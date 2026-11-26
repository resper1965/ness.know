// Indicadores de ameaça das fontes abertas do abuse.ch (Feodo Tracker, ThreatFox, URLhaus, MalwareBazaar), normalizados em `indicadores`.
// Coleta em lote por cron; não há consulta ao vivo por indicador, então nenhuma cota de terceiros é gasta por pergunta.
import { type Adaptador, baixar, type Contexto, gravarEmLotes, limpar, type Resultado } from "./base";
import { chave as chaveIp, parseCidr } from "./rede";

export type TipoIndicador = "ip" | "dominio" | "url" | "hash" | "rede";
export interface Indicador {
  tipo: TipoIndicador;
  valor: string;
  familia?: string | null;
  ameaca?: string | null;
  confianca?: number | null;
  tags?: string[];
  host?: string | null;
  referencia?: string | null;
  data_fonte?: string | null;
}

const UM_DIA = 86_400_000;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;
const DOMINIO = /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{0,62}$/i;
const HASH = /^(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i;
const MAX_URL = 2000;

/** Valor na forma usada para guardar e comparar: sem espaço, sem desfazer a ofuscação (hxxp, [.]), minúsculo onde o valor não distingue caixa. Null se não for do tipo. */
export function normalizar(tipo: TipoIndicador, bruto: unknown): string | null {
  const v = String(bruto ?? "").trim();
  if (!v || /[\u0000-\u001f\u007f-\u009f\s]/.test(v)) return null;
  if (tipo === "ip") return IPV4.test(v) || (v.includes(":") && IPV6.test(v)) ? v.toLowerCase() : null;
  if (tipo === "dominio") return DOMINIO.test(v) && !IPV4.test(v) ? v.toLowerCase().replace(/\.$/, "") : null;
  if (tipo === "hash") return HASH.test(v) ? v.toLowerCase() : null;
  if (tipo === "rede") return parseCidr(v)?.canon ?? null;
  return /^https?:\/\/[^\s/]+/i.test(v) && v.length <= MAX_URL ? v : null;
}

export const dataIso = (v: unknown): string | null => {
  let t = String(v ?? "").trim().replace(" UTC", "").replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += "T00:00:00Z";
  else if (t && !/(Z|[+-]\d\d:?\d\d)$/.test(t)) t += "Z";
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const https = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s]{1,300}$/.test(u) ? u : null);
const familia = (v: unknown) => {
  const f = limpar(v, 80);
  return f && !/^(none|null|unknown)$/i.test(f) ? f : null;
};
const tagsDe = (v: unknown) => (Array.isArray(v) ? v : []).map((t) => limpar(t, 40)).filter(Boolean).slice(0, 15);

/** Grava (ou renova) os indicadores de uma fonte. `dias` é quanto o indicador vale sem aparecer de novo na fonte. */
export async function gravarIndicadores(db: D1Database, fonte: string, itens: Indicador[], agora: Date, dias: number): Promise<number> {
  const t = agora.toISOString();
  const expira = new Date(agora.getTime() + dias * UM_DIA).toISOString();
  const unicos = new Map<string, Indicador>();
  for (const i of itens) {
    const valor = normalizar(i.tipo, i.valor);
    if (valor) unicos.set(`${fonte}|${i.tipo}|${valor}`, { ...i, valor });
  }
  await gravarEmLotes(
    db,
    [...unicos].map(([id, i]) => {
      const faixa = i.tipo === "rede" ? parseCidr(i.valor) : null;
      return db
        .prepare(
          `INSERT INTO indicadores (id, tipo, valor, fonte, familia, ameaca, confianca, tags, host, referencia, data_fonte, primeiro_visto, ultimo_visto, expira_em, expirado, ini, fim)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
           ON CONFLICT (id) DO UPDATE SET familia = excluded.familia, ameaca = excluded.ameaca, confianca = excluded.confianca, tags = excluded.tags, host = excluded.host,
             referencia = excluded.referencia, data_fonte = excluded.data_fonte, ultimo_visto = excluded.ultimo_visto, expira_em = excluded.expira_em, expirado = 0, ini = excluded.ini, fim = excluded.fim`,
        )
        .bind(id, i.tipo, i.valor, fonte, i.familia ?? null, i.ameaca ?? null, i.confianca ?? null, JSON.stringify(i.tags ?? []), i.host ?? null, i.referencia ?? null, i.data_fonte ?? null, t, t, expira, faixa ? chaveIp(faixa.fam, faixa.ini) : null, faixa ? chaveIp(faixa.fam, faixa.fim) : null);
    }),
  );
  return unicos.size;
}

function chave(c: Contexto): string {
  if (!c.env.ABUSECH_AUTH_KEY) throw new Error("ABUSECH_AUTH_KEY não configurada no Worker (Auth-Key gratuita em auth.abuse.ch)");
  return c.env.ABUSECH_AUTH_KEY;
}

async function api(c: Contexto, url: string, corpo?: string, tipo = "application/json"): Promise<any> {
  // Chamado solto, não como método de `c`: o fetch do Workers dá "Illegal invocation" se o `this` não for o global.
  const buscar = c.buscar;
  const r = await buscar(url, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Auth-Key": chave(c), "user-agent": "ness.know (+https://know.ness.com.br)", ...(corpo === undefined ? {} : { "content-type": tipo }) },
    ...(corpo === undefined ? {} : { body: corpo }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
  const j = await r.json().catch(() => null);
  if (!j || typeof j !== "object") throw new Error(`${new URL(url).host}: resposta fora do formato`);
  return j;
}

/** Feodo Tracker: C2 de botnets, lista completa sem chave. Sem mudança no arquivo (304), os itens continuam listados e o prazo é renovado. */
export const feodo: Adaptador = async (c) => {
  const r = await baixar(c.buscar, c.fonte.url, c.fonte.etag);
  const dias = 3;
  if (!r) {
    const t = c.agora.toISOString();
    await c.db.prepare("UPDATE indicadores SET ultimo_visto = ?, expira_em = ? WHERE fonte = 'feodo' AND expirado = 0").bind(t, new Date(c.agora.getTime() + dias * UM_DIA).toISOString()).run();
    return { alterado: false, itens: c.fonte.itens };
  }
  const lista = await r.json().catch(() => null);
  if (!Array.isArray(lista)) throw new Error("feed do Feodo fora do formato esperado");
  const itens: Indicador[] = lista.map((x: any) => ({
    tipo: "ip",
    valor: x?.ip_address,
    familia: familia(x?.malware),
    ameaca: "botnet_c2",
    tags: [`porta:${Number(x?.port) || "?"}`, `estado:${limpar(x?.status, 20)}`, ...(x?.as_number ? [`as:${Number(x.as_number)}`] : [])],
    referencia: https(`https://feodotracker.abuse.ch/browse/host/${encodeURIComponent(String(x?.ip_address))}/`),
    data_fonte: dataIso(x?.first_seen),
  }));
  const n = await gravarIndicadores(c.db, "feodo", itens, c.agora, dias);
  return { alterado: true, itens: n, etag: r.headers.get("etag") } satisfies Resultado;
};

const paraTipoThreatFox = (t: string): { tipo: TipoIndicador; hash?: boolean } | null =>
  t === "ip:port" ? { tipo: "ip" } : t === "domain" ? { tipo: "dominio" } : t === "url" ? { tipo: "url" } : /^(md5|sha1|sha256)_hash$/.test(t) ? { tipo: "hash" } : null;

/** ThreatFox: IOCs do último dia. */
export const threatfox: Adaptador = async (c) => {
  const j = await api(c, c.fonte.url, JSON.stringify({ query: "get_iocs", days: 1 }));
  if (j.query_status === "no_result") return { alterado: false, itens: 0 };
  if (j.query_status !== "ok" || !Array.isArray(j.data)) throw new Error(`ThreatFox: ${limpar(j.query_status ?? j.data, 80) || "resposta fora do formato"}`);
  const itens: Indicador[] = [];
  for (const x of j.data) {
    const t = paraTipoThreatFox(String(x?.ioc_type));
    if (!t) continue;
    let valor = String(x?.ioc ?? "");
    if (x.ioc_type === "ip:port") valor = valor.slice(0, valor.lastIndexOf(":"));
    const conf = Number(x.confidence_level);
    itens.push({
      tipo: t.tipo,
      valor,
      familia: familia(x.malware_printable),
      ameaca: limpar(x.threat_type, 40) || null,
      confianca: Number.isFinite(conf) && conf >= 0 && conf <= 100 ? Math.round(conf) : null,
      tags: tagsDe(x.tags),
      host: t.tipo === "url" ? hostDe(valor) : null,
      referencia: https(x.reference) ?? https(`https://threatfox.abuse.ch/ioc/${encodeURIComponent(String(x.id))}/`),
      data_fonte: dataIso(x.first_seen),
    });
  }
  return { alterado: true, itens: await gravarIndicadores(c.db, "threatfox", itens, c.agora, 7) };
};

const hostDe = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** URLhaus: URLs recentes que distribuem malware. */
export const urlhaus: Adaptador = async (c) => {
  const j = await api(c, c.fonte.url);
  if (j.query_status === "no_results") return { alterado: false, itens: 0 };
  if (j.query_status !== "ok" || !Array.isArray(j.urls)) throw new Error(`URLhaus: ${limpar(j.query_status, 80) || "resposta fora do formato"}`);
  const itens: Indicador[] = j.urls.map((x: any) => ({
    tipo: "url" as const,
    valor: x?.url,
    ameaca: limpar(x?.threat, 40) || null,
    tags: [...tagsDe(x?.tags), `estado:${limpar(x?.url_status, 20)}`],
    host: hostDe(String(x?.url)),
    referencia: https(x?.urlhaus_reference),
    data_fonte: dataIso(x?.date_added),
  }));
  return { alterado: true, itens: await gravarIndicadores(c.db, "urlhaus", itens, c.agora, 7) };
};

/** MalwareBazaar: amostras recentes (sha256 e md5). */
export const malwarebazaar: Adaptador = async (c) => {
  const j = await api(c, c.fonte.url, "query=get_recent&selector=time", "application/x-www-form-urlencoded");
  if (j.query_status !== "ok" || !Array.isArray(j.data)) {
    if (/no_results|no_selector/.test(String(j.query_status))) return { alterado: false, itens: 0 };
    throw new Error(`MalwareBazaar: ${limpar(j.query_status, 80) || "resposta fora do formato"}`);
  }
  const itens: Indicador[] = [];
  for (const x of j.data) {
    const comum = {
      tipo: "hash" as const,
      familia: familia(x?.signature),
      ameaca: "malware_sample",
      tags: [...tagsDe(x?.tags), ...(x?.file_type ? [`arquivo:${limpar(x.file_type, 20)}`] : [])].slice(0, 15),
      referencia: https(`https://bazaar.abuse.ch/sample/${encodeURIComponent(String(x?.sha256_hash))}/`),
      data_fonte: dataIso(x?.first_seen),
    };
    itens.push({ ...comum, valor: x?.sha256_hash }, { ...comum, valor: x?.md5_hash });
  }
  return { alterado: true, itens: await gravarIndicadores(c.db, "malwarebazaar", itens, c.agora, 7) };
};

const URL_DROP_V6 = "https://www.spamhaus.org/drop/drop_v6.json";
const MIN_REDES_V4 = 100; // o DROP v4 tem mais de mil redes; uma resposta pequena é arquivo cortado ou página de erro, não lista

/** Lê o formato do DROP: uma linha JSON por rede ({cidr, sblid, rir}) e, no fim, uma linha de metadados com a contagem. */
function lerDrop(texto: string, nome: string): { cidr: string; sblid: string; rir: string }[] {
  const redes: { cidr: string; sblid: string; rir: string }[] = [];
  let esperado: number | null = null;
  for (const linha of texto.split("\n")) {
    if (!linha.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(linha);
    } catch {
      throw new Error(`${nome}: linha fora do formato`);
    }
    if (o?.type === "metadata") esperado = Number(o.records);
    else if (typeof o?.cidr === "string") redes.push({ cidr: o.cidr, sblid: limpar(o.sblid, 20), rir: limpar(o.rir, 20) });
    else throw new Error(`${nome}: linha fora do formato`);
  }
  if (esperado === null || esperado !== redes.length) throw new Error(`${nome}: arquivo incompleto (metadados dizem ${esperado}, vieram ${redes.length})`);
  return redes;
}

/** Spamhaus DROP (v4 e v6): lista completa. O que sai da lista expira na hora, porque os termos (4.2) pedem a lista em dia. */
export const spamhausDrop: Adaptador = async (c) => {
  const [r4, r6] = await Promise.all([baixar(c.buscar, c.fonte.url), baixar(c.buscar, URL_DROP_V6)]);
  if (!r4 || !r6) throw new Error("DROP: resposta sem conteúdo");
  const v4 = lerDrop(await r4.text(), "DROP v4");
  const v6 = lerDrop(await r6.text(), "DROP v6");
  if (v4.length < MIN_REDES_V4) throw new Error(`DROP v4 com só ${v4.length} redes: arquivo suspeito`);
  const itens: Indicador[] = [...v4, ...v6]
    .filter((x) => parseCidr(x.cidr))
    .map((x) => ({
      tipo: "rede" as const,
      valor: x.cidr,
      ameaca: "drop",
      tags: [...(x.sblid ? [`sbl:${x.sblid}`] : []), ...(x.rir ? [`rir:${x.rir}`] : [])],
      referencia: "https://www.spamhaus.org/blocklists/do-not-route-or-peer/",
    }));
  const n = await gravarIndicadores(c.db, "spamhaus-drop", itens, c.agora, 3);
  const t = c.agora.toISOString();
  await c.db.prepare("UPDATE indicadores SET expirado = 1, expira_em = ? WHERE fonte = 'spamhaus-drop' AND expirado = 0 AND ultimo_visto < ?").bind(t, t).run();
  return { alterado: true, itens: n };
};

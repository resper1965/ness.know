// API em lote para o ness.OS (somente leitura): mesma credencial nesskb_ do /mcp, outro formato. Conhecimento público: sem escopo por pacote.
import { clienteDe, type EnvMcp, recusar, tokenDe } from "./mcp";
import { consultarCves, estadoFontes, MAX_CVES_LOTE } from "./fontes/ferramentas";
import { exportarLista, filtroLista, iocConsultar } from "./fontes/ioc";

/** Até 300 por chamada: cada indicador faz até 3 consultas ao D1, que limita 1.000 por requisição. */
export const MAX_IOC_LOTE = 300;
const MAX_NOVIDADES = 500;

/** O que o ness.know viu desde `desde` (instante em que ele próprio coletou, não a data da fonte). Listas de indicadores vêm de /v1/listas; aqui só a contagem. */
async function novidades(db: D1Database, desde: string, agora: Date) {
  const todos = async <T>(sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).all<T>()).results;
  const kev = await todos<{ cve: string; nome: string; data_inclusao: string; primeiro_visto: string }>("SELECT cve, nome, data_inclusao, primeiro_visto FROM kev WHERE removido_em IS NULL AND primeiro_visto > ? ORDER BY primeiro_visto LIMIT ?", desde, MAX_NOVIDADES + 1);
  const avisos = await todos<{ fonte: string; ref: string; titulo: string; url: string; publicado_em: string | null; primeiro_visto: string }>("SELECT fonte, ref, titulo, url, publicado_em, primeiro_visto FROM avisos WHERE primeiro_visto > ? ORDER BY primeiro_visto LIMIT ?", desde, MAX_NOVIDADES + 1);
  const ind = await todos<{ fonte: string; n: number }>("SELECT fonte, count(*) AS n FROM indicadores WHERE primeiro_visto > ? AND expirado = 0 AND fonte IN (SELECT id FROM fontes WHERE ativa = 1) GROUP BY fonte", desde);
  const vit = (await db.prepare("SELECT count(*) AS n FROM vitimas_ransomware WHERE primeiro_visto > ?").bind(desde).first<{ n: number }>())?.n ?? 0;
  const corta = <T extends { primeiro_visto: string }>(xs: T[]) => ({ itens: xs.slice(0, MAX_NOVIDADES), truncado: xs.length > MAX_NOVIDADES });
  const k = corta(kev);
  const a = corta(avisos);
  // Se cortou, o cursor para no último item devolvido: a próxima chamada continua dali, sem perder nada.
  const cursor = k.truncado || a.truncado ? [k.truncado ? k.itens.at(-1)!.primeiro_visto : "", a.truncado ? a.itens.at(-1)!.primeiro_visto : ""].filter(Boolean).sort()[0] : agora.toISOString();
  return { desde, cursor, completo: !(k.truncado || a.truncado), kev: k.itens, avisos: a.itens, indicadores: { novos: ind.reduce((s, x) => s + x.n, 0), por_fonte: Object.fromEntries(ind.map((x) => [x.fonte, x.n])), lista: "use GET /v1/listas/{tipo} para a lista vigente" }, ransomware: { novas_vitimas: vit, detalhe: "use a ferramenta ransomware_atividade no MCP" }, nota: "Sem veredito. \"Visto\" é o momento em que o ness.know coletou, não a data da fonte." };
}

const erro = (m: string, status: number, h: Record<string, string> = {}) => Response.json({ erro: m }, { status, headers: h });

/** POST /v1/cve {cves: ["CVE-…"]} (até 500): KEV, EPSS e avisos de fabricante, sem NVD (que limita a taxa). */
export async function v1(req: Request, env: EnvMcp, caminho: string): Promise<Response> {
  const token = tokenDe(req);
  const cliente = token ? await clienteDe(token, env.DB) : null;
  if (!cliente) return recusar(req, env);
  if (env.LIMITE_MCP && !(await env.LIMITE_MCP.limit({ key: `v1:${cliente.id}` })).success) return erro("limite de requisições da chave excedido; tente de novo em instantes", 429, { "retry-after": "30" });
  if (caminho === "/v1/cve" && req.method === "POST") {
    const corpo = (await req.json().catch(() => null)) as { cves?: unknown } | null;
    if (!Array.isArray(corpo?.cves) || !corpo.cves.length) return erro("informe cves: lista de ids CVE", 400);
    if (corpo.cves.length > MAX_CVES_LOTE) return erro(`até ${MAX_CVES_LOTE} CVEs por chamada`, 400);
    return Response.json(await consultarCves(env, corpo.cves, { nvd: false }));
  }
  // Consulta em lote de indicadores (IP, domínio, URL, hash). O ness.OS manda só o indicador, nunca o nome do cliente.
  if (caminho === "/v1/ioc" && req.method === "POST") {
    const corpo = (await req.json().catch(() => null)) as { valores?: unknown } | null;
    if (!Array.isArray(corpo?.valores) || !corpo.valores.length) return erro("informe valores: lista de IPs, domínios, URLs ou hashes", 400);
    if (corpo.valores.length > MAX_IOC_LOTE) return erro(`até ${MAX_IOC_LOTE} valores por chamada`, 400);
    return Response.json(await iocConsultar(env.DB, corpo.valores, new Date(), MAX_IOC_LOTE));
  }
  // O que entrou desde o cursor: o ness.OS guarda `cursor` e o manda de volta em `desde`.
  if (caminho === "/v1/novidades" && req.method === "GET") {
    const bruto = new URL(req.url).searchParams.get("desde");
    const agora = new Date();
    const t = bruto ? Date.parse(bruto) : agora.getTime() - 86_400_000;
    if (!Number.isFinite(t)) return erro("desde deve ser uma data ISO (ex.: 2026-11-26T12:00:00Z)", 400);
    if (t > agora.getTime()) return erro("desde está no futuro", 400);
    return Response.json(await novidades(env.DB, new Date(t).toISOString(), agora));
  }
  // Estado das fontes, com a lista das que pedem atenção (erro, pausada ou passada do prazo).
  if (caminho === "/v1/saude" && req.method === "GET") {
    const fontes = await estadoFontes(env.DB, new Date());
    const problemas = fontes.filter((f: any) => !f.ativa || f.ultimo_erro || f.aviso).map((f: any) => ({ id: f.id, motivo: !f.ativa ? "pausada" : f.ultimo_erro ? "erro na última coleta" : "dado possivelmente desatualizado", erro: f.erro ?? null }));
    return Response.json({ ok: !problemas.length, problemas, fontes });
  }
  // Lista inteira de indicadores vigentes para o ness.OS aplicar pelo processo de aprovação dele; o ness.know não bloqueia nada.
  const lista = caminho.match(/^\/v1\/listas\/([a-z]+)$/);
  if (lista && req.method === "GET") {
    const q = new URL(req.url).searchParams;
    const f = filtroLista({ tipo: lista[1], fonte: q.get("fonte") ?? undefined, confianca_min: q.get("confianca_min") ?? undefined, formato: q.get("formato") ?? "texto" });
    if ("erro" in f) return erro(f.erro, 400);
    const r = await exportarLista(env.DB, f, 50_000, new Date());
    const corpo = r.linhas.join("\n") + (r.linhas.length ? "\n" : "");
    return new Response(corpo, {
      headers: {
        "content-type": f.formato === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        "x-total": String(r.total),
        "x-omitidos": String(r.omitidos),
        "x-gerado-em": new Date().toISOString(),
        "x-fontes": r.fontes.map((s) => `${s.fonte}: ${s.frescor}`).join("; ").replace(/[^\x20-\x7e]/g, "?"),
        "x-aviso": `O ness.know nao bloqueia nada; aplique pelo processo de aprovacao do ness.OS.${r.aviso_licenca ? ` ${r.aviso_licenca}` : ""}`.replace(/[^\x20-\x7e]/g, "?"),
      },
    });
  }
  return erro("não encontrado", 404);
}

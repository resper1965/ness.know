// Tipos e utilidades comuns das fontes externas (o motor e os adaptadores importam daqui, sem ciclo).
export interface EnvFontes {
  DB: D1Database;
  /** Opcional: chave gratuita do NVD (secret). Sem ela, a API limita a 5 consultas por 30 s. */
  NVD_API_KEY?: string;
}

export interface Fonte {
  id: string;
  nome: string;
  url: string;
  atribuicao: string | null;
  frequencia_min: number;
  ttl_horas: number;
  ultima_tentativa: string | null;
  ultimo_sucesso: string | null;
  erro_msg: string | null;
  versao: string | null;
  detalhe: string | null;
  etag: string | null;
  itens: number;
  modo: string;
  ultimo_erro: string | null;
}

export interface Resultado {
  alterado: boolean;
  itens: number;
  versao?: string | null;
  detalhe?: string | null;
  etag?: string | null;
}

export interface Contexto {
  db: D1Database;
  fonte: Fonte;
  buscar: typeof fetch;
  agora: Date;
}

export type Adaptador = (c: Contexto) => Promise<Resultado>;

/** Texto de fonte externa é dado: sem controle nem marcação, com tamanho limitado. */
export function limpar(s: unknown, max = 500): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Texto longo de terceiros (trecho de documentação): sem controle, com quebras de linha preservadas e tamanho limitado. */
export function limparTexto(s: unknown, max = 1200): string {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** GET condicional. Devolve null no 304; erro em qualquer outro status que não seja 2xx. */
export async function baixar(buscar: typeof fetch, url: string, etag?: string | null, extra: Record<string, string> = {}): Promise<Response | null> {
  const r = await buscar(url, { headers: { "user-agent": "ness.know (+https://know.ness.com.br)", ...(etag ? { "if-none-match": etag } : {}), ...extra }, signal: AbortSignal.timeout(30_000) });
  if (r.status === 304) return null;
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
  return r;
}

/** Grava em lotes: o D1 limita o tamanho de cada batch. */
export async function gravarEmLotes(db: D1Database, stmts: D1PreparedStatement[], tamanho = 100): Promise<void> {
  for (let i = 0; i < stmts.length; i += tamanho) await db.batch(stmts.slice(i, i + tamanho));
}

function ha(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 90) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}

export interface Selo {
  sistema: string;
  fonte: string;
  versao: string | null;
  coletado_em: string | null;
  frescor: string;
  citar: string;
  atribuicao: string | null;
  url: string;
  aviso?: string;
}

/** Fonte, versão, data da coleta e frescor de uma fonte. Passado o TTL, avisa em vez de omitir. */
export async function selo(db: D1Database, id: string, agora = new Date()): Promise<Selo | null> {
  const f = await db.prepare("SELECT * FROM fontes WHERE id = ?").bind(id).first<Fonte>();
  if (!f) return null;
  const idade = f.ultimo_sucesso ? agora.getTime() - Date.parse(f.ultimo_sucesso) : null;
  if (f.modo === "ao_vivo") {
    // Consulta ao vivo: o dado é de agora; só avisa se a última tentativa falhou.
    const falhou = !!f.ultimo_erro && (!f.ultimo_sucesso || f.ultimo_erro >= f.ultimo_sucesso);
    const quando = agora.toISOString();
    return {
      sistema: "ness.know", fonte: f.nome, versao: null, coletado_em: quando, atribuicao: f.atribuicao, url: f.url,
      frescor: "consulta ao vivo", citar: `Fonte: ${f.nome}, consulta ao vivo em ${quando}`,
      ...(falhou ? { aviso: `A última consulta a esta fonte falhou${f.erro_msg ? `: ${f.erro_msg}` : ""}.` } : {}),
    };
  }
  const base = { sistema: "ness.know", fonte: f.nome, versao: f.versao, coletado_em: f.ultimo_sucesso, atribuicao: f.atribuicao, url: f.url };
  if (idade === null) return { ...base, frescor: "nunca coletada", citar: `Fonte: ${f.nome}, ainda não coletada`, aviso: "Fonte ainda não coletada: não há dado para responder." };
  const frescor = `coletado há ${ha(idade)}`;
  const citar = `Fonte: ${f.nome}${f.versao ? `, versão ${f.versao}` : ""}, coletado em ${f.ultimo_sucesso} (${frescor})`;
  const vencido = idade > f.ttl_horas * 3_600_000;
  return { ...base, frescor, citar, ...(vencido ? { aviso: `Dado possivelmente desatualizado: a última coleta bem-sucedida foi há ${ha(idade)} e o TTL é de ${f.ttl_horas} h.${f.erro_msg ? ` Último erro: ${f.erro_msg}` : ""}` } : {}) };
}

/** Consulta ao vivo com cache curto no D1. Só guarda sucesso: erro da fonte não fica cacheado. */
export async function viaCache<T>(db: D1Database, chave: string, ttlMin: number, agora: Date, produzir: () => Promise<T>): Promise<T> {
  const c = await db.prepare("SELECT valor FROM cache WHERE chave = ? AND expira_em > ?").bind(chave, agora.toISOString()).first<{ valor: string }>();
  if (c) return JSON.parse(c.valor) as T;
  const v = await produzir();
  await db
    .prepare("INSERT INTO cache (chave, valor, expira_em) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, expira_em = excluded.expira_em")
    .bind(chave, JSON.stringify(v), new Date(agora.getTime() + ttlMin * 60_000).toISOString())
    .run();
  return v;
}

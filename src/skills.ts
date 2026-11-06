// Regras das skills (procedimentos que o agente segue ao usar as normas): validação na carga e quem enxerga cada uma.
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const MAX_CORPO = 4000;
export const MAX_BUSCAS = 5;
export const MAX_BUSCA = 120;

type Valido<T> = { ok: true; v: T } | { ok: false; erro: string };
export interface Skill {
  nome: string;
  descricao: string;
  normas: Record<string, string[]>;
  /** Buscas de continuação que o faBRAINzio executa junto com a pergunta (o modelo pequeno não as faz sozinho). */
  buscas: string[];
  corpo: string;
  versao: string | null;
}

const txt = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

export function validarSkill(b: Record<string, unknown>): Valido<Skill> {
  const nome = txt(b.nome, 63).toLowerCase();
  const descricao = txt(b.descricao, 300);
  const corpo = typeof b.corpo === "string" ? b.corpo.trim() : "";
  if (!SLUG.test(nome)) return { ok: false, erro: "nome inválido: letras minúsculas, números e hífen" };
  if (!descricao) return { ok: false, erro: "descrição obrigatória" };
  if (!corpo) return { ok: false, erro: "corpo obrigatório" };
  if (corpo.length > MAX_CORPO) return { ok: false, erro: `corpo com ${corpo.length} caracteres; o máximo é ${MAX_CORPO}` };
  const bruto = b.normas ?? {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erro: "normas: objeto {pacote: [títulos]}" };
  const normas: Record<string, string[]> = {};
  for (const [slug, lista] of Object.entries(bruto)) {
    if (!SLUG.test(slug) || !Array.isArray(lista) || !lista.every((t) => typeof t === "string")) return { ok: false, erro: `normas.${slug}: lista de títulos` };
    normas[slug] = [...new Set(lista.map((t) => t.trim()).filter(Boolean))];
  }
  const brutas = b.buscas ?? [];
  if (!Array.isArray(brutas) || !brutas.every((x) => typeof x === "string")) return { ok: false, erro: "buscas: lista de textos" };
  const buscas = [...new Set(brutas.map((x) => x.trim()).filter(Boolean))];
  if (buscas.length > MAX_BUSCAS) return { ok: false, erro: `buscas: no máximo ${MAX_BUSCAS}` };
  if (buscas.some((x) => x.length > MAX_BUSCA)) return { ok: false, erro: `buscas: cada texto com até ${MAX_BUSCA} caracteres` };
  return { ok: true, v: { nome, descricao, normas, buscas, corpo, versao: txt(b.versao, 50) || null } };
}

/** Mensagem de erro se algum pacote ou título de `normas` não existe na base; null se está tudo lá. */
export async function normasExistem(db: D1Database, normas: Record<string, string[]>): Promise<string | null> {
  for (const [slug, titulos] of Object.entries(normas)) {
    if (!(await db.prepare("SELECT 1 FROM pacotes WHERE slug = ?").bind(slug).first())) return `pacote não existe: ${slug}`;
    const existem = (await db.prepare("SELECT DISTINCT titulo FROM documentos WHERE escopo = 'pacote' AND dono = ? AND status = 'ok'").bind(slug).all<{ titulo: string }>()).results.map((x) => x.titulo);
    const faltam = titulos.filter((t) => !existem.includes(t));
    if (faltam.length) return `norma não existe em ${slug}: ${faltam.join(", ")}`;
  }
  return null;
}

/** A chave enxerga a skill se tem todos os pacotes dela e, quando o pacote é restrito, todas as normas pedidas. */
export function visivel(normas: Record<string, string[]>, c: { pacotes: string[]; documentos: Record<string, string[]> }): boolean {
  return Object.entries(normas).every(([slug, titulos]) => c.pacotes.includes(slug) && (!c.documentos[slug] || titulos.every((t) => c.documentos[slug].includes(t))));
}

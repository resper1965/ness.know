// Base do ness.KNOW: pacotes (slug) com documentos. Original no R2, texto em trechos no FTS5 e no Vectorize (busca híbrida).
// Veio do faBRAINzio, que tinha três camadas; aqui só existe a de pacote (escopo "pacote", dono = slug).
import { consultaFts } from "./fts";

export interface EnvConhecimento {
  DB: D1Database;
  AI: Ai;
  ARQUIVOS: R2Bucket;
  /** Opcional: sem o índice, a busca é só textual. */
  VETORES?: Vectorize;
}
export type EnvBusca = Pick<EnvConhecimento, "DB" | "AI" | "VETORES">;

export type Escopo = "pessoal" | "org" | "pacote";
export interface Alvo {
  escopo: Escopo;
  dono: string;
}
export interface MetaDocumento {
  titulo: string;
  tipo?: string;
  fonte?: string;
  versao?: string;
  vigencia?: string;
  ativo_ref?: string;
}
export interface Trecho {
  documento_id: string;
  escopo: Escopo;
  titulo: string;
  versao: string | null;
  vigencia: string | null;
  fonte: string | null;
  /** Seção ou cláusula de onde o trecho saiu (ex.: "5.2.4 Change control", "Art. 6º"), quando se sabe. */
  secao?: string | null;
  trecho: string;
}

export const LIMITE_ARQUIVO = 15 * 1024 * 1024;

/** Linha que abre seção: markdown, numeração (4.1 / 5.2.4), artigo, controle de anexo (A.8.16, B.2.5.8, CLD.9.5.1), capítulo, ou toda em maiúsculas. Sumário (pontilhado) não conta. */
const TITULO =
  /^(#{1,4}\s+\S.*|\d{1,2}(\.\d{1,2}){0,4}\.?\s{1,3}[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{1,90}|Art\.\s?\d+[ºo°]?.*|[A-Z]{1,4}\.\d{1,2}(\.\d{1,2}){0,3}\s+\S.*|(CAPÍTULO|Capítulo|SEÇÃO|Seção|ANEXO|Anexo)\s+[IVXLC\d]+.*|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9&/()-]+(\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9&/():-]+){1,10})$/;
export const ehTitulo = (linha: string) => {
  const l = linha.trim();
  // Fim em ponto, vírgula ou ponto e vírgula é item de lista ou frase, não título (artigos à parte: "Art. 6º ... ").
  return l.length <= 120 && TITULO.test(l) && !/\.{4,}/.test(l) && (!/[;,.]$/.test(l) || /^Art\./.test(l));
};
/** Linhas que se repetem no documento (cabeçalho e rodapé de página) não são título, mesmo com cara de título. */
function repetidas(texto: string): Set<string> {
  const n = new Map<string, number>();
  for (const l of texto.split("\n")) {
    const k = l.trim();
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return new Set([...n].filter(([, v]) => v > 3).map(([k]) => k));
}
/** Rótulo curto da seção: artigo só com o número; o resto, a linha até 80 caracteres. */
const rotuloDe = (linha: string) => {
  const l = linha.trim().replace(/^#+\s+/, "").replace(/\s{2,}/g, " ");
  return (l.match(/^Art\.\s?\d+[ºo°]?/)?.[0] ?? l).slice(0, 80);
};

/** Trechos de ~`tamanho` caracteres com `sobra` de sobreposição. Corta antes de um título quando dá; senão em fim de parágrafo ou frase. */
export function dividir(texto: string, tamanho = 1200, sobra = 200): string[] {
  const t = texto.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return [];
  if (t.length <= tamanho) return [t];
  const cabecalhos = repetidas(t);
  const titulo = (l: string) => ehTitulo(l) && !cabecalhos.has(l.trim());
  const partes: string[] = [];
  let i = 0;
  while (i < t.length) {
    let fim = Math.min(i + tamanho, t.length);
    let noTitulo = false;
    if (fim < t.length) {
      let antesDoTitulo = -1;
      for (let j = t.indexOf("\n", i + tamanho / 2); j !== -1 && j < fim; j = t.indexOf("\n", j + 1)) {
        const fimLinha = t.indexOf("\n", j + 1);
        if (titulo(t.slice(j + 1, fimLinha === -1 ? t.length : fimLinha))) antesDoTitulo = j;
      }
      if (antesDoTitulo > 0) [fim, noTitulo] = [antesDoTitulo, true];
      else {
        const corte = Math.max(t.lastIndexOf("\n\n", fim), t.lastIndexOf(". ", fim));
        if (corte > i + tamanho / 2) fim = corte + 1;
      }
    }
    partes.push(t.slice(i, fim).trim());
    if (fim >= t.length) break;
    // Corte em título: o próximo trecho começa nele, sem sobreposição (a seção fica inteira e identificada).
    i = noTitulo ? fim + 1 : Math.max(fim - sobra, i + 1);
  }
  return partes.filter(Boolean);
}

/** Seção de cada trecho, na ordem: o título que abre o trecho ou o último visto antes dele. */
export function secoesDe(partes: string[]): (string | null)[] {
  const cabecalhos = repetidas(partes.join("\n"));
  const titulo = (l: string) => ehTitulo(l) && !cabecalhos.has(l.trim());
  let atual: string | null = null;
  return partes.map((p) => {
    if (ehRuido(p)) return null;
    const linhas = p.split("\n");
    const abre = linhas.slice(0, 3).find(titulo);
    const secao = abre ? rotuloDe(abre) : atual;
    const ultimo = linhas.filter(titulo).pop();
    if (ultimo) atual = rotuloDe(ultimo);
    return secao;
  });
}

/**
 * Sumário e índice remissivo: muitas linhas com pontilhado, ou quase só títulos e números de página.
 * Ficam na busca textual, mas não viram vetor nem definem a seção dos trechos seguintes.
 */
export function ehRuido(trecho: string): boolean {
  const linhas = trecho.split("\n").map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 4) return false;
  const pontilhado = linhas.filter((l) => /\.{4,}\s*\S{0,8}$/.test(l)).length;
  if (pontilhado >= 3 && pontilhado / linhas.length >= 0.3) return true;
  const pagina = /^\d+(\.\d+)*$|^[ivxlc]{1,6}$|^\d{1,4}([–-]\d{1,4})?$|\D\s\d{1,4}([–-]\d{1,4})?(,\s*\d{1,4}([–-]\d{1,4})?)*$/;
  const listagem = linhas.filter((l) => pagina.test(l) || (ehTitulo(l) && l.length < 70)).length;
  return linhas.length >= 6 && listagem / linhas.length >= 0.6;
}

const filtroEscopo = (alvos: Alvo[]) => ({
  sql: alvos.map(() => "(t.escopo = ? AND t.dono = ?)").join(" OR "),
  binds: alvos.flatMap((a) => [a.escopo, a.dono]),
});

/** Trecho com a origem e a nota de cada busca, para a fusão e para a avaliação. */
export interface Candidato extends Trecho {
  origem: "textual" | "semantica";
  nota: number;
}

async function buscaTextual(db: D1Database, alvos: Alvo[], consulta: string, limite: number): Promise<Candidato[]> {
  const q = consultaFts(consulta);
  if (!q) return [];
  const f = filtroEscopo(alvos);
  const r = await db
    .prepare(
      `SELECT t.documento_id, t.escopo, d.titulo, d.versao, d.vigencia, d.fonte, t.texto AS trecho, rank
       FROM trechos_fts t JOIN documentos d ON d.id = t.documento_id
       WHERE trechos_fts MATCH ? AND (${f.sql}) ORDER BY rank LIMIT ?`,
    )
    .bind(q, ...f.binds, limite)
    .all<Trecho & { rank: number }>();
  return r.results.map(({ rank, ...t }) => ({ ...t, secao: null, origem: "textual", nota: -rank }));
}

/** Modelo multilíngue: pergunta em português acha texto em inglês. 1024 dimensões. */
const MODELO_VETOR = "@cf/baai/bge-m3";
/** Reordena os candidatos pela pergunta. Treinado sobretudo em inglês; na avaliação de 30/10/2026 piorou o 1º lugar (64% → 58%), por isso fica desligado. */
const MODELO_RERANK = "@cf/baai/bge-reranker-base";
const LOTE_VETOR = 50;
// shortcut: corte escolhido sem calibração; `scripts/avaliar-busca.mjs` mostra as notas reais para ajustar.
export const SIMILARIDADE_MIN = 0.4;
/** Vectorize devolve no máximo 20 resultados com metadados por consulta. */
const CANDIDATOS = 20;

/** Vectorize só indexa os primeiros 64 bytes de uma string e limita o filtro a 2048 bytes: a camada vira um hash curto e fixo. */
export async function chaveAlvo(a: Alvo): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${a.escopo}:${a.dono}`)));
  return Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Camadas por consulta: 50 hashes de 16 caracteres ficam bem abaixo dos 2048 bytes do filtro. */
const CAMADAS_POR_CONSULTA = 50;

async function embutir(ai: Ai, textos: string[]): Promise<number[][]> {
  const r = (await ai.run(MODELO_VETOR, { text: textos, truncate_inputs: true })) as { data?: number[][] };
  if (!r.data || r.data.length !== textos.length) throw new Error("embeddings incompletos");
  return r.data;
}

/** O vetor carrega o contexto que o trecho sozinho perde: documento e seção. O texto guardado continua o original. */
export const textoParaVetor = (titulo: string, secao: string | null, trecho: string) => `${titulo}${secao ? ` — ${secao}` : ""}\n\n${trecho}`;

/** Grava os vetores dos trechos. Id = documento:posição, então refazer só sobrescreve. Sumários não viram vetor. */
export async function vetorizar(env: EnvBusca, documentoId: string, alvo: Alvo, titulo: string, partes: string[]): Promise<number> {
  if (!env.VETORES) return 0;
  const chave = await chaveAlvo(alvo);
  const secoes = secoesDe(partes);
  const todos = partes.map((texto, i) => ({ i, texto, secao: secoes[i] }));
  const itens = todos.filter((x) => !ehRuido(x.texto));
  // Sumário que já virou vetor numa versão anterior sai do índice.
  const ruido = todos.filter((x) => ehRuido(x.texto)).map((x) => `${documentoId}:${x.i}`);
  if (ruido.length) await env.VETORES.deleteByIds(ruido);
  for (let k = 0; k < itens.length; k += LOTE_VETOR) {
    const lote = itens.slice(k, k + LOTE_VETOR);
    const v = await embutir(env.AI, lote.map((x) => textoParaVetor(titulo, x.secao, x.texto)));
    await env.VETORES.upsert(
      lote.map((x, j) => ({ id: `${documentoId}:${x.i}`, values: v[j], metadata: { alvo: chave, documento_id: documentoId, secao: x.secao ?? "", texto: x.texto } })),
    );
  }
  return itens.length;
}

async function buscaSemantica(env: EnvBusca, alvos: Alvo[], consulta: string, limite: number, minimo: number): Promise<Candidato[]> {
  if (!env.VETORES || !consulta.trim()) return [];
  const [v] = await embutir(env.AI, [consulta.slice(0, 2000)]);
  const chaves = await Promise.all(alvos.map(chaveAlvo));
  const grupos = Array.from({ length: Math.ceil(chaves.length / CAMADAS_POR_CONSULTA) }, (_, i) => chaves.slice(i * CAMADAS_POR_CONSULTA, (i + 1) * CAMADAS_POR_CONSULTA));
  const respostas = await Promise.all(grupos.map((g) => env.VETORES!.query(v, { topK: Math.min(limite, CANDIDATOS), returnMetadata: "all", filter: { alvo: { $in: g } } })));
  const hits = respostas
    .flatMap((r) => r.matches)
    .filter((m) => m.score >= minimo && m.metadata)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
  if (!hits.length) return [];
  const ids = [...new Set(hits.map((m) => String(m.metadata?.documento_id)))];
  const docs = await env.DB.prepare(`SELECT id, escopo, dono, titulo, versao, vigencia, fonte FROM documentos WHERE id IN (${ids.map(() => "?").join(", ")})`)
    .bind(...ids)
    .all<{ id: string; escopo: Escopo; dono: string; titulo: string; versao: string | null; vigencia: string | null; fonte: string | null }>();
  // O filtro do índice já limita as camadas; conferir de novo no banco evita vazamento se o índice de metadados faltar.
  const permitidos = new Set(alvos.map((a) => `${a.escopo}:${a.dono}`));
  const porId = new Map(docs.results.filter((d) => permitidos.has(`${d.escopo}:${d.dono}`)).map((d) => [d.id, d]));
  return hits.flatMap((m) => {
    const d = porId.get(String(m.metadata?.documento_id));
    if (!d) return [];
    const secao = m.metadata?.secao ? String(m.metadata.secao) : null;
    return [{ documento_id: d.id, escopo: d.escopo, titulo: d.titulo, versao: d.versao, vigencia: d.vigencia, fonte: d.fonte, secao, trecho: String(m.metadata?.texto ?? ""), origem: "semantica" as const, nota: m.score }];
  });
}

/**
 * Fusão por posição recíproca (RRF, k = 60): soma 1/(k + posição) de cada lista. Não depende das escalas das notas,
 * que não se comparam (cosseno × BM25). O mesmo trecho achado pelas duas buscas soma as duas parcelas.
 */
export function fundir(listas: Candidato[][], k = 60, pesos: number[] = []): Candidato[] {
  const placar = new Map<string, { c: Candidato; total: number }>();
  listas.forEach((lista, l) =>
    lista.forEach((c, pos) => {
      const parcela = (pesos[l] ?? 1) / (k + pos + 1);
      const chave = `${c.documento_id}|${c.trecho}`;
      const atual = placar.get(chave);
      if (atual) {
        atual.total += parcela;
        if (!atual.c.secao && c.secao) atual.c = { ...atual.c, secao: c.secao };
      } else placar.set(chave, { c, total: parcela });
    }),
  );
  return [...placar.values()].sort((a, b) => b.total - a.total).map((x) => ({ ...x.c, nota: x.total }));
}

async function reordenar(ai: Ai, consulta: string, candidatos: Candidato[]): Promise<Candidato[]> {
  if (candidatos.length < 2) return candidatos;
  const r = (await ai.run(MODELO_RERANK, { query: consulta.slice(0, 1000), contexts: candidatos.map((c) => ({ text: textoParaVetor(c.titulo, c.secao ?? null, c.trecho).slice(0, 2000) })) } as never)) as {
    response?: { id?: number; score?: number }[];
  };
  const notas = new Map((r.response ?? []).map((x) => [x.id ?? -1, x.score ?? 0]));
  return candidatos.map((c, i) => ({ ...c, nota: notas.get(i) ?? -Infinity })).sort((a, b) => b.nota - a.nota);
}

/**
 * Peso da textual na fusão. Medido em 30/10/2026 (36 perguntas): semântica sozinha 86% no top 5, textual 44%, fusão com
 * pesos iguais 81%. A textual entra pela metade: ajuda em códigos exatos (A.8.16, CH-1042) sem empurrar a semântica para baixo.
 */
export const PESO_TEXTUAL = 0.5;

export interface OpcoesBusca {
  pesoTextual?: number;
  limite?: number;
  modo?: "hibrida" | "textual" | "semantica";
  rerank?: boolean;
  minimo?: number;
}

/** Busca em camadas dadas (ex.: só os pacotes liberados a um cliente MCP). */
export async function buscarEm(env: EnvBusca, alvos: Alvo[], consulta: string, opcoes: OpcoesBusca = {}): Promise<Candidato[]> {
  if (!alvos.length) return [];
  const { limite = 6, modo = "hibrida", rerank = false, minimo = SIMILARIDADE_MIN, pesoTextual = PESO_TEXTUAL } = opcoes;
  const n = Math.max(limite, CANDIDATOS);
  const [semantica, textual] = await Promise.all([
    modo === "textual" ? [] : buscaSemantica(env, alvos, consulta, n, minimo).catch((e) => (console.warn("busca semântica indisponível", String(e)), [] as Candidato[])),
    modo === "semantica" ? [] : buscaTextual(env.DB, alvos, consulta, n),
  ]);
  let r = modo === "hibrida" ? fundir([semantica, textual], 60, [1, pesoTextual]) : modo === "semantica" ? semantica : textual;
  if (rerank) r = await reordenar(env.AI, consulta, r.slice(0, CANDIDATOS)).catch((e) => (console.warn("rerank indisponível", String(e)), r));
  r = r.slice(0, limite);
  // Com peso 0,5 e 20 candidatos semânticos, nenhum trecho só da textual entra no topo. A melhor textual (ex.: código exato
  // "A.8.16") fica com a última vaga, se ainda não estiver no resultado.
  const t = textual[0];
  if (modo === "hibrida" && t && limite > 1 && !r.some((x) => x.documento_id === t.documento_id && x.trecho === t.trecho)) r = [...r.slice(0, limite - 1), t];
  return r;
}

async function paraTexto(env: EnvConhecimento, arquivo: File): Promise<string> {
  if (/^text\/(plain|markdown)/.test(arquivo.type) || /\.(md|txt)$/i.test(arquivo.name)) return arquivo.text();
  const r = await env.AI.toMarkdown({ name: arquivo.name, blob: arquivo });
  if (r.format === "error") throw new Error(`não consegui ler o arquivo: ${r.error}`);
  return r.data;
}

/** Guarda o original, extrai o texto e indexa os trechos. Arquivo ilegível fica registrado com erro e sem trechos. */
export async function ingerir(env: EnvConhecimento, alvo: Alvo, meta: MetaDocumento, arquivo: File, autor: string): Promise<{ id: string; trechos: number; erro?: string }> {
  const id = crypto.randomUUID();
  const chave = `${alvo.escopo}/${alvo.dono}/${id}/${arquivo.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120)}`;
  await env.ARQUIVOS.put(chave, arquivo.stream(), { httpMetadata: { contentType: arquivo.type || "application/octet-stream" } });
  const doc = env.DB.prepare(
    "INSERT INTO documentos (id, escopo, dono, titulo, tipo, fonte, versao, vigencia, ativo_ref, r2_key, status, erro, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const valores = [id, alvo.escopo, alvo.dono, meta.titulo, meta.tipo ?? null, meta.fonte ?? null, meta.versao ?? null, meta.vigencia ?? null, meta.ativo_ref ?? null, chave];
  let partes: string[];
  try {
    partes = dividir(await paraTexto(env, arquivo));
    if (!partes.length) throw new Error("arquivo sem texto");
  } catch (e) {
    const erro = String(e instanceof Error ? e.message : e).slice(0, 300);
    await doc.bind(...valores, "erro", erro, autor).run();
    return { id, trechos: 0, erro };
  }
  const ins = env.DB.prepare("INSERT INTO trechos_fts (documento_id, escopo, dono, texto) VALUES (?, ?, ?, ?)");
  const stmts = [doc.bind(...valores, "ok", null, autor), ...partes.map((p) => ins.bind(id, alvo.escopo, alvo.dono, p))];
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  // Sem vetores o documento continua achável pela busca textual; o reprocessamento refaz depois.
  await vetorizar(env, id, alvo, meta.titulo, partes).catch((e) => console.warn("vetores não gravados", id, String(e)));
  return { id, trechos: partes.length };
}

/** Refaz os vetores de documentos já carregados, em páginas (id > `apos`). */
export async function revetorizar(env: EnvBusca, apos: string, porVez = 5): Promise<{ feitos: { id: string; trechos: number }[]; proximo: string | null }> {
  const docs = await env.DB.prepare("SELECT id, escopo, dono, titulo FROM documentos WHERE status = 'ok' AND id > ? ORDER BY id LIMIT ?")
    .bind(apos, porVez)
    .all<{ id: string; escopo: Escopo; dono: string; titulo: string }>();
  const feitos: { id: string; trechos: number }[] = [];
  for (const d of docs.results) {
    // rowid segue a ordem de inserção, a mesma posição usada no id do vetor.
    const t = await env.DB.prepare("SELECT texto FROM trechos_fts WHERE documento_id = ? ORDER BY rowid").bind(d.id).all<{ texto: string }>();
    feitos.push({ id: d.id, trechos: await vetorizar(env, d.id, d, d.titulo, t.results.map((x) => x.texto)) });
  }
  return { feitos, proximo: docs.results.length === porVez ? docs.results[docs.results.length - 1].id : null };
}

export async function apagarDocumento(env: EnvConhecimento, id: string): Promise<boolean> {
  const d = await env.DB.prepare("SELECT r2_key FROM documentos WHERE id = ?").bind(id).first<{ r2_key: string | null }>();
  if (!d) return false;
  const n = (await env.DB.prepare("SELECT count(*) AS n FROM trechos_fts WHERE documento_id = ?").bind(id).first<{ n: number }>())?.n ?? 0;
  await env.DB.batch([env.DB.prepare("DELETE FROM trechos_fts WHERE documento_id = ?").bind(id), env.DB.prepare("DELETE FROM documentos WHERE id = ?").bind(id)]);
  if (d.r2_key) await env.ARQUIVOS.delete(d.r2_key);
  if (env.VETORES && n) {
    const ids = Array.from({ length: n }, (_, i) => `${id}:${i}`);
    for (let i = 0; i < ids.length; i += 1000) await env.VETORES.deleteByIds(ids.slice(i, i + 1000)).catch((e) => console.warn("vetores não apagados", id, String(e)));
  }
  return true;
}

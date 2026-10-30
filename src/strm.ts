// Correspondência entre frameworks pelo SCF STRM (NIST IR 8477): item de origem → controles SCF → itens dos destinos.
export const PACOTE_STRM = "scf-strm";
/** Destinos por chamada: mantém a resposta legível e a consulta pequena. */
export const MAX_DESTINOS = 10;

export interface Correspondencia {
  framework: string;
  item: string;
  nome: string | null;
  /** Controle SCF que liga origem e destino. */
  via: string;
  relacao_origem: string;
  relacao_destino: string;
  /** Elo mais fraco do caminho (0 a 10); null quando a planilha não informa. */
  forca: number | null;
}
export interface Resultado {
  origem: { framework: string; nome: string; item: string; item_nome: string | null };
  versao_scf: string | null;
  scf: { scf: string; nome: string | null; relacao: string; forca: number | null }[];
  /** Destinos pedidos (após deduplicar e limitar) que não existem em strm_frameworks. */
  destinos_desconhecidos: string[];
  correspondencias: Correspondencia[];
}

type Linha = { framework: string; item: string; item_nome: string | null; relacao: string; forca: number | null; scf: string };
/** D1 aceita no máximo 100 parâmetros por consulta: as listas de SCF vão em lotes. */
const LOTE = 40;
const lotes = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE));
const minimo = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.min(a, b));

export async function correlacionar(db: D1Database, itemPedido: string, de: string, para: string[]): Promise<Resultado | { erro: string }> {
  const item = itemPedido.trim();
  let origem: Resultado["origem"];
  let versao: string | null = null;
  let ligacoes: { scf: string; relacao: string; forca: number | null }[];

  if (de === "scf") {
    const c = await db.prepare("SELECT scf, nome FROM scf_controles WHERE lower(scf) = lower(?)").bind(item).first<{ scf: string; nome: string | null }>();
    if (!c) return { erro: `controle SCF desconhecido: ${item}` };
    origem = { framework: "scf", nome: "Secure Controls Framework", item: c.scf, item_nome: c.nome };
    ligacoes = [{ scf: c.scf, relacao: "igual", forca: 10 }];
  } else {
    const fw = await db.prepare("SELECT nome, versao_scf FROM strm_frameworks WHERE id = ?").bind(de).first<{ nome: string; versao_scf: string | null }>();
    if (!fw) return { erro: `framework desconhecido: ${de}. Os ids estão em listar_pacotes, pacote ${PACOTE_STRM}` };
    const r = await db.prepare("SELECT framework, item, item_nome, relacao, forca, scf FROM strm WHERE framework = ? AND lower(item) = lower(?) ORDER BY forca DESC, scf").bind(de, item).all<Linha>();
    if (!r.results.length) return { erro: `item ${item} sem correspondência em ${de}. Para o Anexo A da ISO 27001, use o framework da ISO 27002 (mesma numeração)` };
    origem = { framework: de, nome: fw.nome, item: r.results[0].item, item_nome: r.results[0].item_nome };
    versao = fw.versao_scf;
    ligacoes = r.results.map((x) => ({ scf: x.scf, relacao: x.relacao, forca: x.forca }));
  }

  const ids = ligacoes.map((l) => l.scf);
  const nomes = new Map<string, string | null>();
  for (const lote of lotes(ids)) {
    const r = await db.prepare(`SELECT scf, nome FROM scf_controles WHERE scf IN (${lote.map(() => "?").join(", ")})`).bind(...lote).all<{ scf: string; nome: string | null }>();
    for (const x of r.results) nomes.set(x.scf, x.nome);
  }
  const scf = ligacoes.map((l) => ({ scf: l.scf, nome: nomes.get(l.scf) ?? null, relacao: l.relacao, forca: l.forca }));

  const destinos = [...new Set(para)].filter((p) => p !== de).slice(0, MAX_DESTINOS);
  if (!destinos.length) return { origem, versao_scf: versao, scf, destinos_desconhecidos: [], correspondencias: [] };
  const conhecidos = new Set(
    (await db.prepare(`SELECT id FROM strm_frameworks WHERE id IN (${destinos.map(() => "?").join(", ")})`).bind(...destinos).all<{ id: string }>()).results.map((x) => x.id),
  );
  const destinos_desconhecidos = destinos.filter((d) => !conhecidos.has(d));
  const alvo: { results: Linha[] } = { results: [] };
  for (const lote of lotes(ids)) {
    const r = await db
      .prepare(`SELECT framework, item, item_nome, relacao, forca, scf FROM strm WHERE scf IN (${lote.map(() => "?").join(", ")}) AND framework IN (${destinos.map(() => "?").join(", ")})`)
      .bind(...lote, ...destinos)
      .all<Linha>();
    alvo.results.push(...r.results);
  }

  // Um resultado por item de destino: o caminho de maior força (o elo mais fraco de cada caminho decide).
  const melhor = new Map<string, Correspondencia>();
  for (const t of alvo.results) {
    for (const o of ligacoes.filter((l) => l.scf === t.scf)) {
      const c: Correspondencia = { framework: t.framework, item: t.item, nome: t.item_nome, via: t.scf, relacao_origem: o.relacao, relacao_destino: t.relacao, forca: minimo(o.forca, t.forca) };
      const chave = `${t.framework}|${t.item}`;
      const atual = melhor.get(chave);
      if (!atual || (c.forca ?? -1) > (atual.forca ?? -1)) melhor.set(chave, c);
    }
  }
  const correspondencias = [...melhor.values()].sort((a, b) => (b.forca ?? -1) - (a.forca ?? -1) || a.framework.localeCompare(b.framework) || a.item.localeCompare(b.item, undefined, { numeric: true }));
  return { origem, versao_scf: versao, scf, destinos_desconhecidos, correspondencias };
}

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

/** Caminho a partir desta força conta como cobertura; abaixo, cobertura parcial. */
export const FORCA_COBERTURA = 8;
/** Itens implementados por chamada: cobre o Anexo A inteiro (93) e o CSF (106) com folga. */
export const MAX_IMPLEMENTADOS = 500;

export interface ItemCobertura {
  item: string;
  nome: string | null;
  situacao: "coberto" | "parcial" | "sem_cobertura";
  /** Elo mais fraco do melhor caminho implementado → SCF → item do alvo. */
  forca: number | null;
  via: { scf: string; origem: string } | null;
  /** Controles SCF ligados ao item do alvo que nada do implementado alcança. */
  scf_sem_cobertura: string[];
}
export interface Cobertura {
  de: string;
  alvo: { framework: string; nome: string };
  versao_scf: string | null;
  implementados_desconhecidos: string[];
  resumo: Record<ItemCobertura["situacao"], number>;
  itens: ItemCobertura[];
}

/**
 * Cobertura de um framework alvo a partir do que já está implementado em outro (ou de controles SCF).
 * Indicativa: segue os mapeamentos do SCF; o requisito de cada item ainda precisa ser conferido no texto da norma.
 */
export async function cobertura(db: D1Database, de: string, implementados: string[], alvoId: string): Promise<Cobertura | { erro: string }> {
  const alvo = await db.prepare("SELECT nome, versao_scf FROM strm_frameworks WHERE id = ?").bind(alvoId).first<{ nome: string; versao_scf: string | null }>();
  if (!alvo) return { erro: `framework desconhecido: ${alvoId}. Os ids estão em listar_pacotes, pacote ${PACOTE_STRM}` };

  // Melhor força com que o que está implementado alcança cada controle SCF.
  const alcance = new Map<string, { forca: number | null; origem: string }>();
  const pedidos = [...new Set(implementados.map((x) => x.trim()).filter(Boolean))];
  let desconhecidos: string[];
  if (de === "scf") {
    const conhecidos = new Map(
      (await db.prepare("SELECT scf FROM scf_controles").all<{ scf: string }>()).results.map((x) => [x.scf.toLowerCase(), x.scf]),
    );
    desconhecidos = pedidos.filter((p) => !conhecidos.has(p.toLowerCase()));
    for (const p of pedidos) if (conhecidos.has(p.toLowerCase())) alcance.set(conhecidos.get(p.toLowerCase())!, { forca: 10, origem: conhecidos.get(p.toLowerCase())! });
  } else {
    if (!(await db.prepare("SELECT 1 FROM strm_frameworks WHERE id = ?").bind(de).first())) return { erro: `framework desconhecido: ${de}. Os ids estão em listar_pacotes, pacote ${PACOTE_STRM}` };
    const linhas = (await db.prepare("SELECT item, forca, scf FROM strm WHERE framework = ?").bind(de).all<{ item: string; forca: number | null; scf: string }>()).results;
    const itens = new Map(linhas.map((l) => [l.item.toLowerCase(), l.item]));
    // "A.8.16" (Anexo A da 27001) vale como "8.16" (numeração da 27002 no STRM).
    const resolver = (p: string) => itens.get(p.toLowerCase()) ?? itens.get(p.replace(/^a\./i, "").toLowerCase());
    desconhecidos = pedidos.filter((p) => !resolver(p));
    const meus = new Set(pedidos.map(resolver).filter((x): x is string => !!x));
    for (const l of linhas) {
      if (!meus.has(l.item)) continue;
      const atual = alcance.get(l.scf);
      if (!atual || (l.forca ?? -1) > (atual.forca ?? -1)) alcance.set(l.scf, { forca: l.forca, origem: l.item });
    }
  }

  const linhasAlvo = (await db.prepare("SELECT item, item_nome, forca, scf FROM strm WHERE framework = ?").bind(alvoId).all<{ item: string; item_nome: string | null; forca: number | null; scf: string }>()).results;
  const porItem = new Map<string, ItemCobertura>();
  for (const l of linhasAlvo) {
    const c = porItem.get(l.item) ?? { item: l.item, nome: l.item_nome, situacao: "sem_cobertura", forca: null, via: null, scf_sem_cobertura: [] };
    porItem.set(l.item, c);
    const a = alcance.get(l.scf);
    if (!a) {
      c.scf_sem_cobertura.push(l.scf);
      continue;
    }
    const forca = minimo(a.forca, l.forca);
    if (!c.via || (forca ?? -1) > (c.forca ?? -1)) Object.assign(c, { forca, via: { scf: l.scf, origem: a.origem } });
  }
  const itens = [...porItem.values()].sort((a, b) => a.item.localeCompare(b.item, undefined, { numeric: true }));
  for (const c of itens) if (c.via) c.situacao = (c.forca ?? 0) >= FORCA_COBERTURA ? "coberto" : "parcial";
  const resumo = { coberto: 0, parcial: 0, sem_cobertura: 0 };
  for (const c of itens) resumo[c.situacao]++;
  return { de, alvo: { framework: alvoId, nome: alvo.nome }, versao_scf: alvo.versao_scf, implementados_desconhecidos: desconhecidos, resumo, itens };
}

export interface DetalheControle {
  scf: string;
  nome: string | null;
  dominio: string | null;
  descricao: string | null;
  pergunta: string | null;
  peso: number | null;
  cadencia: string | null;
  funcao_csf: string[];
  legado: string[];
  objetivos: { id: string; objetivo: string }[];
  evidencias: { id: string; area: string | null; artefato: string; descricao: string | null }[];
  maturidade: { nivel: number; rotulo: string; criterio: string }[];
  /** Presente quando o pedido veio com um id da versão anterior do SCF. */
  aviso?: string;
}

const lista = <T>(s: string | null): T[] => {
  try {
    return s ? (JSON.parse(s) as T[]) : [];
  } catch {
    return [];
  }
};

/** Como avaliar um controle SCF: pergunta, objetivos de avaliação, evidências a pedir e critérios de maturidade. */
export async function detalharControle(db: D1Database, pedido: string): Promise<DetalheControle | { erro: string }> {
  const id = pedido.trim();
  type Linha = { scf: string; nome: string | null; dominio: string | null; descricao: string | null; pergunta: string | null; peso: number | null; cadencia: string | null; funcao_csf: string | null; maturidade: string | null; evidencias: string | null; legado: string | null };
  const colunas = "scf, nome, dominio, descricao, pergunta, peso, cadencia, funcao_csf, maturidade, evidencias, legado";
  let c = await db.prepare(`SELECT ${colunas} FROM scf_controles WHERE lower(scf) = lower(?)`).bind(id).first<Linha>();
  let aviso: string | undefined;
  if (!c) {
    // Ids da versão anterior (o SCF 2026.3 renumerou a maioria dos controles).
    const r = await db.prepare(`SELECT ${colunas} FROM scf_controles WHERE legado LIKE ?`).bind(`%"${id.toUpperCase().replace(/[%_"]/g, "")}"%`).all<Linha>();
    if (!r.results.length) return { erro: `controle SCF desconhecido: ${id}` };
    c = r.results[0];
    aviso = `${id} é um id da versão anterior do SCF; hoje corresponde a ${r.results.map((x) => x.scf).join(", ")}`;
  }
  const objetivos = (await db.prepare("SELECT ao_id AS id, objetivo FROM scf_objetivos WHERE scf = ? ORDER BY ao_id").bind(c.scf).all<{ id: string; objetivo: string }>()).results;
  const ids = lista<string>(c.evidencias);
  const evidencias = ids.length
    ? (await db.prepare(`SELECT erl_id AS id, area, artefato, descricao FROM scf_evidencias WHERE erl_id IN (${ids.map(() => "?").join(", ")}) ORDER BY erl_id`).bind(...ids).all<DetalheControle["evidencias"][number]>()).results
    : [];
  return {
    scf: c.scf,
    nome: c.nome,
    dominio: c.dominio,
    descricao: c.descricao,
    pergunta: c.pergunta,
    peso: c.peso,
    cadencia: c.cadencia,
    funcao_csf: lista<string>(c.funcao_csf),
    legado: lista<string>(c.legado),
    objetivos,
    evidencias,
    maturidade: lista<DetalheControle["maturidade"][number]>(c.maturidade),
    ...(aviso ? { aviso } : {}),
  };
}

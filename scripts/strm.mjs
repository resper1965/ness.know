// SCF STRM (NIST IR 8477): uma planilha por framework ligando cada item a controles SCF. Funções puras, testadas em test/strm.test.ts.

const RELACOES = {
  equal: "igual",
  "subset of": "subconjunto",
  "superset of": "superconjunto",
  "intersects with": "intersecao",
  "instersects with": "intersecao", // grafia errada que existe nas planilhas
  intersects: "intersecao",
};

/** Texto de uma célula, com quebras de linha e espaços repetidos viram um espaço. */
const texto = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** Célula do exceljs → valor simples (rich text, fórmula, hyperlink). */
export function valor(c) {
  if (c == null || typeof c !== "object" || c instanceof Date) return c ?? null;
  if (Array.isArray(c.richText)) return c.richText.map((t) => t.text).join("");
  return c.result ?? c.text ?? null;
}

/** Linhas de uma planilha (primeira aba) → framework e ligações item × controle SCF. */
export function lerPlanilha(linhas, arquivo) {
  const topo = linhas.slice(0, 4);
  const depois = (rotulo) => {
    for (const r of topo) {
      const i = r.findIndex((c) => texto(c).replace(/:$/, "") === rotulo);
      if (i >= 0) return texto(r[i + 1]);
    }
    return "";
  };
  const id = arquivo.replace(/^scf-strm-/, "").replace(/\.xlsx$/, "");
  const nome = depois("Focal Document") || id;
  const versao = depois("Reference document").match(/version\s+(\S+)/i)?.[1] ?? null;

  const h = linhas.findIndex((r) => r.some((c) => texto(c) === "SCF #"));
  if (h < 0) throw new Error(`${arquivo}: cabeçalho não reconhecido (falta SCF #)`);
  const cab = linhas[h].map(texto);
  const col = (teste) => cab.findIndex(teste);
  const c = {
    item: col((t) => /FDE ?#$/.test(t)), // primeira: há arquivo com "FDE #" repetido
    nome: col((t) => t.startsWith("FDE Name")),
    relacao: col((t) => t === "STRM Relationship"),
    scf: col((t) => t === "SCF #"),
    scfNome: col((t) => t === "SCF Control"),
    scfDescricao: col((t) => t.startsWith("Secure Controls Framework (SCF)") || t.startsWith("SCF desc")), // "SCF desc" é o nome em planilhas mais enxutas
    forca: col((t) => t.startsWith("Strength of Relationship")),
  };
  const faltam = [["item", "FDE #"], ["relacao", "STRM Relationship"], ["scf", "SCF #"], ["scfNome", "SCF Control"]].filter(([k]) => c[k] < 0).map(([, rotulo]) => rotulo);
  if (faltam.length) throw new Error(`${arquivo}: cabeçalho não reconhecido (falta ${faltam.join(", ")})`);

  const ligacoes = [];
  let item = "";
  let itemNome = null;
  for (const r of linhas.slice(h + 1)) {
    // shortcut: item numérico (ex.: "1.10" no NIS2) chega como número e perde o zero final; para corrigir, ler o formato da célula.
    if (texto(r[c.item])) {
      item = texto(r[c.item]);
      const n = texto(r[c.nome]);
      itemNome = n && n !== "N/A" ? n : null;
    }
    const relacao = RELACOES[texto(r[c.relacao]).toLowerCase()];
    const scf = texto(r[c.scf]);
    if (!item || !relacao || !/^[A-Z]{3}-\d/.test(scf)) continue;
    const f = texto(r[c.forca]);
    const n = Number(f);
    ligacoes.push({ item, itemNome, relacao, forca: f !== "" && Number.isInteger(n) && n >= 0 && n <= 10 ? n : null, scf, scfNome: texto(r[c.scfNome]), scfDescricao: texto(r[c.scfDescricao]) });
  }
  return { id, nome, versao, ligacoes };
}

const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const LOTE = 200; // linhas por INSERT: bem abaixo do limite de 100 KB por instrução do D1

const INSTRUCOES =
  "Correspondência oficial entre frameworks (SCF STRM, NIST IR 8477). Use a ferramenta correlacionar. Igual ou subconjunto com força alta indica cobertura; interseção indica cobertura parcial. Confirme o requisito no texto da norma com buscar_conhecimento antes de afirmar conformidade. Controles do Anexo A da ISO 27001 estão no framework da ISO 27002 (mesma numeração).";

/** SQL idempotente: apaga e recarrega tudo, e cria ou atualiza o pacote scf-strm. */
export function paraSql(planilhas) {
  const versao = planilhas.find((p) => p.versao)?.versao ?? null;
  const sql = ["DELETE FROM strm;", "DELETE FROM strm_frameworks;", "DELETE FROM scf_controles;"];
  const controles = new Map();
  for (const p of planilhas) {
    sql.push(`INSERT INTO strm_frameworks (id, nome, versao_scf, itens) VALUES (${q(p.id)}, ${q(p.nome)}, ${q(p.versao)}, ${new Set(p.ligacoes.map((l) => l.item)).size});`);
    for (let i = 0; i < p.ligacoes.length; i += LOTE) {
      const valores = p.ligacoes.slice(i, i + LOTE).map((l) => `(${q(p.id)}, ${q(l.item)}, ${q(l.itemNome)}, ${q(l.relacao)}, ${q(l.forca)}, ${q(l.scf)})`);
      sql.push(`INSERT INTO strm (framework, item, item_nome, relacao, forca, scf) VALUES ${valores.join(", ")};`);
    }
    for (const l of p.ligacoes) if (!controles.has(l.scf)) controles.set(l.scf, l);
  }
  const lista = [...controles.values()];
  for (let i = 0; i < lista.length; i += 50) {
    sql.push(`INSERT INTO scf_controles (scf, nome, descricao) VALUES ${lista.slice(i, i + 50).map((l) => `(${q(l.scf)}, ${q(l.scfNome)}, ${q(l.scfDescricao)})`).join(", ")};`);
  }
  sql.push(
    `INSERT INTO pacotes (slug, nome, descricao, instrucoes, versao) VALUES ('scf-strm', 'Correspondência entre frameworks', ${q(`SCF STRM ${versao ?? ""}: ${planilhas.length} frameworks mapeados ao Secure Controls Framework`)}, ${q(INSTRUCOES)}, ${q(versao)}) ON CONFLICT (slug) DO UPDATE SET nome = excluded.nome, descricao = excluded.descricao, instrucoes = excluded.instrucoes, versao = excluded.versao, atualizado_em = datetime('now');`,
  );
  return sql.join("\n");
}

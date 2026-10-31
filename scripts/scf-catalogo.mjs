// Catálogo do SCF (scf-full-<versão>.json): controles enriquecidos, objetivos de avaliação e lista de evidências.
const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const js = (v) => q(v == null ? null : JSON.stringify(v));
// D1 recusa instruções acima de 100 KB; um controle com os critérios de maturidade passa de 3 KB, então os lotes são por tamanho.
const MAX_INSTRUCAO = 60_000;
function emLotes(prefixo, linhas) {
  const sql = [];
  let atual = [];
  let tamanho = 0;
  for (const l of linhas) {
    if (atual.length && tamanho + l.length > MAX_INSTRUCAO) {
      sql.push(`${prefixo} ${atual.join(", ")};`);
      atual = [];
      tamanho = 0;
    }
    atual.push(l);
    tamanho += l.length + 2;
  }
  if (atual.length) sql.push(`${prefixo} ${atual.join(", ")};`);
  return sql;
}

/** SQL idempotente: substitui controles, objetivos e evidências. As ligações do STRM (tabela strm) não são tocadas. */
export function catalogoParaSql(scf) {
  const controles = scf.controls.map((c) => {
    const peso = Number.parseInt(c.weight, 10);
    const maturidade = (c.cmm_levels ?? []).map((m) => ({ nivel: m.level, rotulo: m.label, criterio: m.criteria }));
    return `(${[c.scf_id, c.scf_control_name, c.description, c.scf_domain, c.control_question].map(q).join(", ")}, ${Number.isFinite(peso) ? peso : "NULL"}, ${q(c.conformity_cadence)}, ${js(c.nist_csf_function_grouping ?? [])}, ${js(maturidade)}, ${js(c.erl_references ?? [])}, ${js(c.legacy_scf_ids ?? [])})`;
  });
  return [
    "DELETE FROM scf_controles;", // o catálogo é a fonte dos controles; o STRM só acrescenta os que faltarem
    "DELETE FROM scf_objetivos;",
    "DELETE FROM scf_evidencias;",
    ...emLotes("INSERT INTO scf_controles (scf, nome, descricao, dominio, pergunta, peso, cadencia, funcao_csf, maturidade, evidencias, legado) VALUES", controles),
    ...emLotes("INSERT INTO scf_objetivos (ao_id, scf, objetivo) VALUES", scf.assessment_objectives.map((a) => `(${q(a.ao_id)}, ${q(a.scf_id)}, ${q(a.objective)})`)),
    ...emLotes("INSERT INTO scf_evidencias (erl_id, area, artefato, descricao) VALUES", scf.evidence_request_list.map((e) => `(${q(e.erl_id)}, ${q(e.area_of_focus)}, ${q(e.artifact)}, ${q(e.description)})`)),
  ].join("\n");
}

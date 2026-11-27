#!/usr/bin/env node
// Gera a base enxuta de grupos de ameaça (MISP galaxy, cluster threat-actor) para consulta por nome, apelido, país ou setor.
// Guarda só METADADOS (nome, apelidos, país atribuído, setores e categorias alvo, patrocinador suspeito, links de referência);
// a descrição não é copiada porque cita trechos de relatórios de terceiros.
// Licença: os arquivos de clusters do MISP galaxy são CC0 1.0 ou BSD (README do repositório; o LICENSE.md não pôde ser lido em 27/11/2026).
//
// Uso: node scripts/gerar-atores.mjs <threat-actor.json> [saida.json]
//   origem: https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json
import { readFileSync, writeFileSync } from "node:fs";

export const ATRIBUICAO = "Perfis de grupos de ameaça do MISP Project (MISP galaxy, cluster threat-actor, github.com/MISP/misp-galaxy), CC0 1.0 ou BSD conforme o README. Aqui só metadados e links; a atribuição de um grupo é relato público, não prova.";
const lista = (v, max, tam) => [...new Set((Array.isArray(v) ? v : v == null ? [] : [v]).filter((x) => x != null).map((x) => String(x).replace(/\s+/g, " ").trim().slice(0, tam)).filter(Boolean))].slice(0, max);

export function gerar(galaxy, geradoEm = new Date().toISOString()) {
  const atores = [];
  for (const v of galaxy.values ?? []) {
    if (!v?.value || !v?.uuid) continue;
    const m = v.meta ?? {};
    const a = { id: String(v.uuid), nome: String(v.value).slice(0, 80) };
    const apelidos = lista(m.synonyms, 25, 80).filter((s) => s.toLowerCase() !== a.nome.toLowerCase());
    if (apelidos.length) a.apelidos = apelidos;
    const pais = lista(m.country, 3, 4);
    if (pais.length) a.pais = pais;
    const setores = lista([m["targeted-sector"], m["cfr-target-category"]].flat(), 12, 60);
    if (setores.length) a.setores = setores;
    const patrocinador = lista(m["cfr-suspected-state-sponsor"], 3, 40);
    if (patrocinador.length) a.patrocinador_suspeito = patrocinador;
    const refs = lista(m.refs, 6, 300).filter((r) => /^https:\/\//.test(r));
    if (refs.length) a.refs = refs;
    atores.push(a);
  }
  atores.sort((x, y) => x.nome.localeCompare(y.nome, "en"));
  return { meta: { versao: String(galaxy.version ?? ""), gerado_em: geradoEm, fonte: "MISP galaxy (threat-actor)", url: "https://github.com/MISP/misp-galaxy", licenca: "CC0 1.0 ou BSD", atribuicao: ATRIBUICAO }, atores };
}

if (process.argv[1]?.endsWith("gerar-atores.mjs")) {
  const [entrada, saida = "src/fontes/dados/atores.json"] = process.argv.slice(2);
  if (!entrada) (console.error("uso: node scripts/gerar-atores.mjs <threat-actor.json> [saida.json]"), process.exit(1));
  const d = gerar(JSON.parse(readFileSync(entrada, "utf8")));
  writeFileSync(saida, JSON.stringify(d));
  console.log(`${d.atores.length} grupos -> ${saida}`);
}

#!/usr/bin/env node
// Converte o catálogo do SCF (JSON/scf-full-<versão>.json do pacote de download) em SQL para o D1.
//
// Uso: node scripts/scf-catalogo-para-sql.mjs <scf-full.json> <saida.sql>
// Depois: npx wrangler d1 execute ness-know --remote --file=<saida.sql>
// Use a mesma versão do SCF do STRM carregado: a numeração dos controles muda entre versões.
import { readFile, writeFile } from "node:fs/promises";
import { catalogoParaSql } from "./scf-catalogo.mjs";

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error("uso: node scripts/scf-catalogo-para-sql.mjs <scf-full.json> <saida.sql>");
  process.exit(1);
}
const scf = JSON.parse(await readFile(entrada, "utf8"));
await writeFile(saida, catalogoParaSql(scf), "utf8");
console.log(`SCF ${scf.metadata?.version ?? "?"}: ${scf.controls.length} controles, ${scf.assessment_objectives.length} objetivos de avaliação, ${scf.evidence_request_list.length} evidências → ${saida}`);

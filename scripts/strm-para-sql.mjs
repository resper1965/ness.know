#!/usr/bin/env node
// Converte o pacote STRM do SCF (pasta com os scf-strm-*.xlsx) em SQL para o D1.
//
// Uso: node scripts/strm-para-sql.mjs <pasta-dos-xlsx | extraido.json> <saida.sql>
//   (o .json vem de scripts/strm-pdf-para-json.py, quando a versão do STRM só sai em PDF)
// Depois: npx wrangler d1 execute ness-know --remote --file=<saida.sql>
// O SQL apaga e recarrega tudo: rodar de novo com uma versão nova do SCF substitui a anterior.
import { readFile, writeFile } from "node:fs/promises";
import { lerPlanilha, paraSql } from "./strm.mjs";
import { lerPasta } from "./strm-xlsx.mjs";

const [pasta, saida] = process.argv.slice(2);
if (!pasta || !saida) {
  console.error("uso: node scripts/strm-para-sql.mjs <pasta-dos-xlsx> <saida.sql>");
  process.exit(1);
}
const planilhas = [];
if (pasta.endsWith(".json")) {
  for (const [f, linhas] of Object.entries(JSON.parse(await readFile(pasta, "utf8")))) planilhas.push(lerPlanilha(linhas, f));
  await gravar();
  process.exit(0);
}
planilhas.push(...(await lerPasta(pasta).catch((e) => (console.error(e.message), process.exit(1)))));
await gravar();

async function gravar() {
  await writeFile(saida, paraSql(planilhas), "utf8");
  const total = planilhas.reduce((n, p) => n + p.ligacoes.length, 0);
  const controles = new Set(planilhas.flatMap((p) => p.ligacoes.map((l) => l.scf))).size;
  console.log(`${planilhas.length} frameworks, ${total} ligações, ${controles} controles SCF, versão ${planilhas.find((p) => p.versao)?.versao ?? "?"} → ${saida}`);
}

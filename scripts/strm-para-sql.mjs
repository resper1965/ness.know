#!/usr/bin/env node
// Converte o pacote STRM do SCF (pasta com os scf-strm-*.xlsx) em SQL para o D1.
//
// Uso: node scripts/strm-para-sql.mjs <pasta-dos-xlsx | extraido.json> <saida.sql>
//   (o .json vem de scripts/strm-pdf-para-json.py, quando a versão do STRM só sai em PDF)
// Depois: npx wrangler d1 execute ness-know --remote --file=<saida.sql>
// O SQL apaga e recarrega tudo: rodar de novo com uma versão nova do SCF substitui a anterior.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { lerPlanilha, paraSql, valor } from "./strm.mjs";

// shortcut: ExcelJS 4.4 falha ao ler 20 planilhas cujos comentários têm alvo absoluto ("/xl/comments/…"); os comentários não trazem dado STRM, então saem do arquivo antes da leitura. Revisar ao atualizar o exceljs.
async function abrirPlanilha(caminho) {
  const zip = await JSZip.loadAsync(await readFile(caminho));
  for (const nome of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(n))) {
    const xml = await zip.file(nome).async("string");
    zip.file(nome, xml.replace(/<Relationship [^>]*Type="[^"]*\/comments"[^>]*\/>/g, ""));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await zip.generateAsync({ type: "nodebuffer" }));
  return wb;
}

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
const arquivos = (await readdir(pasta)).filter((f) => /^scf-strm-.+\.xlsx$/i.test(f)).sort();
if (!arquivos.length) {
  console.error(`nenhum scf-strm-*.xlsx em ${pasta}`);
  process.exit(1);
}
for (const f of arquivos) {
  const wb = await abrirPlanilha(join(pasta, f));
  const ws = wb.worksheets[0]; // a primeira aba é a completa; as extras ("condensed", crosswalk) repetem ou resumem
  if (!ws) throw new Error(`${f}: planilha sem abas`);
  const linhas = [];
  ws.eachRow({ includeEmpty: true }, (row) => linhas.push(Array.from({ length: row.cellCount }, (_, i) => valor(row.getCell(i + 1).value))));
  const p = lerPlanilha(linhas, f);
  if (!p.ligacoes.length) console.warn(`aviso: ${f} sem ligações (cabeçalho não reconhecido?)`);
  planilhas.push(p);
}
await gravar();

async function gravar() {
  await writeFile(saida, paraSql(planilhas), "utf8");
  const total = planilhas.reduce((n, p) => n + p.ligacoes.length, 0);
  const controles = new Set(planilhas.flatMap((p) => p.ligacoes.map((l) => l.scf))).size;
  console.log(`${planilhas.length} frameworks, ${total} ligações, ${controles} controles SCF, versão ${planilhas.find((p) => p.versao)?.versao ?? "?"} → ${saida}`);
}

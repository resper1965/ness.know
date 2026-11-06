// Lê a pasta de planilhas do SCF STRM (scf-strm-*.xlsx) em frameworks e ligações. Usado por strm-para-sql.mjs e conferir-strm.mjs.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { lerPlanilha, valor } from "./strm.mjs";

// shortcut: ExcelJS 4.4 falha ao ler 20 planilhas cujos comentários têm alvo absoluto ("/xl/comments/…"); os comentários não trazem dado STRM, então saem do arquivo antes da leitura. Revisar ao atualizar o exceljs.
export async function abrirPlanilha(caminho) {
  const zip = await JSZip.loadAsync(await readFile(caminho));
  for (const nome of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(n))) {
    const xml = await zip.file(nome).async("string");
    zip.file(nome, xml.replace(/<Relationship [^>]*Type="[^"]*\/comments"[^>]*\/>/g, ""));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await zip.generateAsync({ type: "nodebuffer" }));
  return wb;
}

/** Todas as planilhas scf-strm-*.xlsx da pasta, na ordem do nome. Lança se a pasta não tem nenhuma. */
export async function lerPasta(pasta) {
  const arquivos = (await readdir(pasta)).filter((f) => /^scf-strm-.+\.xlsx$/i.test(f)).sort();
  if (!arquivos.length) throw new Error(`nenhum scf-strm-*.xlsx em ${pasta}`);
  const planilhas = [];
  for (const f of arquivos) {
    const ws = (await abrirPlanilha(join(pasta, f))).worksheets[0]; // a primeira aba é a completa; as extras ("condensed", crosswalk) repetem ou resumem
    if (!ws) throw new Error(`${f}: planilha sem abas`);
    const linhas = [];
    ws.eachRow({ includeEmpty: true }, (row) => linhas.push(Array.from({ length: row.cellCount }, (_, i) => valor(row.getCell(i + 1).value))));
    const p = lerPlanilha(linhas, f);
    if (!p.ligacoes.length) console.warn(`aviso: ${f} sem ligações (cabeçalho não reconhecido?)`);
    planilhas.push(p);
  }
  return planilhas;
}

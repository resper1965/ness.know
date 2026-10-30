import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

// Planilha com comentário (nota) cujo alvo na relação é absoluto, como nos arquivos do SCF que o ExcelJS não lê.
async function planilhaComComentario(pasta: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("STRM");
  ws.addRows([
    ["FDE #", "FDE Name", "STRM Relationship", "SCF #", "SCF Control", "Strength of Relationship"],
    ["8.16", "Monitoring activities", "Subset Of", "MON-01", "Continuous Monitoring", 10],
  ]);
  ws.getCell("A2").note = "nota sem dado STRM";
  const bruto = await wb.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(bruto);
  const rels = "xl/worksheets/_rels/sheet1.xml.rels";
  const xml = await zip.file(rels)!.async("string");
  zip.file(rels, xml.replace(/Target="(?!\/)([^"]*comment[^"]*)"/g, 'Target="/xl/$1"'));
  writeFileSync(join(pasta, "scf-strm-teste-comentario.xlsx"), await zip.generateAsync({ type: "nodebuffer" }));
}

describe("conversor STRM para SQL", () => {
  it("lê planilha com comentário de alvo absoluto e gera o SQL", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "strm-"));
    await planilhaComComentario(pasta);
    const saida = join(pasta, "saida.sql");
    const cli = join(process.cwd(), "scripts", "strm-para-sql.mjs");
    const resumo = execFileSync("node", [cli, pasta, saida], { encoding: "utf8" });
    expect(resumo).toMatch(/^1 frameworks, 1 ligações, 1 controles SCF/);
    const sql = readFileSync(saida, "utf8");
    expect(sql).toContain("'teste-comentario', 'teste-comentario'");
    expect(sql).toContain("'8.16', 'Monitoring activities', 'subconjunto', 10, 'MON-01'");
  });
});

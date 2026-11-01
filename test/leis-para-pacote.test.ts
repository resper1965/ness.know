import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dividir, secoesDe } from "../src/busca";

const artigo = (n: number) => `**Art. ${n}º** ${"O tratamento de dados pessoais observará a boa-fé e os princípios. ".repeat(12)}`;
const norma = (cab: string, corpo: string) => `---\n${cab}\nbaixado_em: 2026-10-13\n---\n# Título\n\n${corpo}\n`;

describe("conversor do acervo ctresb/leis", () => {
  it("gera documentos.json, tira revogadas e o cabeçalho, e o divisor rotula os trechos por artigo", () => {
    const raiz = mkdtempSync(join(tmpdir(), "leis-"));
    const pasta = join(raiz, "pacote");
    mkdirSync(join(raiz, "federal/2018"), { recursive: true });
    mkdirSync(join(raiz, "estaduais/SP"), { recursive: true });
    writeFileSync(
      join(raiz, "federal/2018/lgpd.md"),
      norma(
        'titulo: "Lei nº 13.709 de 14/08/2018"\ntipo: "Lei Ordinária"\ndata: 2018-08-14\nementa: "Lei Geral de Proteção de Dados Pessoais (LGPD)."\nrevogada: false\nversao_texto: "compilada (texto vigente)"\nfonte: "https://normas.leg.br/x"',
        `#### CAPÍTULO I — DISPOSIÇÕES PRELIMINARES\n\n${[1, 2, 3].map(artigo).join("\n\n")}`,
      ),
    );
    writeFileSync(join(raiz, "estaduais/SP/a.md"), norma('titulo: "Lei nº 1 de 01/01/2000"\nuf: "SP"\ntipo: "Lei Ordinária"\ndata: 2000-01-01', "Texto."));
    writeFileSync(join(raiz, "estaduais/SP/b.md"), norma('titulo: "Lei nº 1 de 01/01/2000"\nuf: "SP"\ntipo: "Lei Ordinária"\ndata: 2000-01-01', "Outro."));
    writeFileSync(join(raiz, "estaduais/SP/c.md"), norma('titulo: "Lei nº 2 de 01/01/2000"\nuf: "SP"\nrevogada: true', "Revogada."));

    // "estaduais/SP/a.md" repete um arquivo da pasta: não pode virar outra norma.
    const saida = execFileSync("node", ["scripts/leis-para-pacote.mjs", raiz, pasta, "federal", "estaduais/SP", "estaduais/SP/a.md"], { encoding: "utf8" });
    expect(saida).toContain("revogada, fora do pacote (apague se já estava carregada): Lei nº 2 de 01/01/2000 (SP)");
    const docs = JSON.parse(readFileSync(join(pasta, "documentos.json"), "utf8"));

    expect(docs).toHaveLength(3);
    expect(docs[0]).toEqual({
      arquivo: "textos/federal__2018__lgpd.md",
      titulo: "Lei nº 13.709 de 14/08/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).",
      tipo: "Lei Ordinária",
      versao: "compilada (texto vigente)",
      vigencia: "2018-08-14",
      fonte: "https://normas.leg.br/x",
    });
    // Mesmo título em dois arquivos: o segundo leva o caminho, senão a carga substituiria o primeiro.
    expect(docs.map((d: { titulo: string }) => d.titulo).slice(1)).toEqual(["Lei nº 1 de 01/01/2000 (SP)", "Lei nº 1 de 01/01/2000 (SP) [estaduais/SP/b.md]"]);

    const texto = readFileSync(join(pasta, docs[0].arquivo), "utf8");
    expect(texto).not.toContain("baixado_em");
    expect(secoesDe(dividir(texto))).toEqual(["Título", "Art. 2º", "Art. 3º"]);
  });
});

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const ato = (titulo: string, data: string, ementa: string) => `---\ntitulo: "${titulo}"\ndata: ${data}\nementa: "${ementa}"\n---\n# ${titulo}\n`;
const escreve = (base: string, rel: string, conteudo: string) => (mkdirSync(dirname(join(base, rel)), { recursive: true }), writeFileSync(join(base, rel), conteudo));
const LGPD = "Altera a Lei nº 13.709, de 14 de agosto de 2018, para dispor sobre a ANPD.";

function montar() {
  const raiz = mkdtempSync(join(tmpdir(), "vl-"));
  const acervo = join(raiz, "leis");
  escreve(acervo, "federal/leis-ordinarias/2022/lei-14460-2022-10-25.md", ato("Lei nº 14.460 de 25/10/2022", "2022-10-25", LGPD)); // citada no texto
  escreve(acervo, "federal/leis-ordinarias/2019/lei-13853-2019-07-08.md", ato("Lei nº 13.853 de 08/07/2019", "2019-07-08", LGPD)); // anterior à carga, não citada
  escreve(acervo, "federal/leis-ordinarias/2026/lei-15352-2026-02-25.md", ato("Lei nº 15.352 de 25/02/2026", "2026-02-25", LGPD)); // posterior à carga, não citada
  escreve(acervo, "federal/leis-ordinarias/2018/lei-13709-2018-08-14.md", ato("Lei nº 13.709 de 14/08/2018", "2018-08-14", "Lei Geral de Proteção de Dados Pessoais (LGPD).")); // a própria
  escreve(acervo, "federal/leis-ordinarias/2024/lei-14000-2024-01-01.md", ato("Lei nº 14.000 de 01/01/2024", "2024-01-01", "Altera a Lei nº 12.965, de 23 de abril de 2014.")); // outra norma
  escreve(acervo, "federal/decretos/2025/dec-1-2025-01-01.md", ato("Decreto nº 1 de 01/01/2025", "2025-01-01", "Regulamenta a Lei nº 13.709, de 14 de agosto de 2018.")); // regulamenta
  escreve(acervo, "federal/decretos/2025/dec-2-2025-01-01.md", ato("Decreto nº 2 de 01/01/2025", "2025-01-01", "Altera o Decreto nº 7, de 1º de maio de 2020, que regulamenta a Lei nº 13.709, de 14 de agosto de 2018.")); // altera o decreto
  for (const a of [["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"]]) execFileSync("git", ["-C", acervo, ...a]);

  const pacotes = join(raiz, "pacotes");
  escreve(pacotes, "digital/pacote.json", JSON.stringify({ slug: "digital", versao: "ctresb/leis abc (2026-01-01)" }));
  const doc = (versao: string) => JSON.stringify([{ arquivo: "lgpd.md", titulo: "Lei nº 13.709 de 14/08/2018 — LGPD", versao, vigencia: "2018-08-14", fonte: "https://normas.leg.br/?urn=urn:lex:br:federal:lei:2018-08-14;13709" }]);
  const rodar = () => spawnSync("node", ["scripts/verificar-leis.mjs", acervo], { encoding: "utf8", env: { ...process.env, PACOTES: pacotes } });
  return { pacotes, doc, rodar };
}

describe("verificar-leis", () => {
  it("só derruba a alteração nova; a anterior à carga vira 'conferir'; regulamento e decreto alterado não contam", () => {
    const { pacotes, doc, rodar } = montar();
    escreve(pacotes, "digital/documentos.json", doc("compilada (texto vigente)"));
    escreve(pacotes, "digital/lgpd.md", "Art. 55-A ... (Redação dada pela Lei nº 14.460, de 25/10/2022)");

    const r = rodar();
    expect(r.stdout).toContain("FALTA Lei nº 13.709 de 14/08/2018 — LGPD: 1 de 3 alterações já no texto");
    expect(r.stdout).toContain("Lei nº 15.352 (2026-02-25)");
    expect(r.stdout).toContain("conferir (anteriores à carga, não citadas): Lei nº 13.853");
    expect(r.stdout).not.toContain("Decreto nº 1 ");
    expect(r.stdout).not.toContain("Decreto nº 2 ");
    expect(r.stdout).toContain("1 alteração(ões) fora do texto dos pacotes.");
    expect(r.status).toBe(1);

    // Citada a nova, sobra só o informativo e o resultado é sucesso.
    escreve(pacotes, "digital/lgpd.md", "(Lei nº 14.460, de 25/10/2022) (Lei nº 15.352, de 25/2/2026)");
    const ok = rodar();
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("Nenhuma alteração nova fora do texto dos pacotes.");
    expect(ok.stdout).toContain("1 alteração(ões) anteriores à carga");
  });

  it("texto original: qualquer alteração achada derruba, mesmo a anterior à carga", () => {
    const { pacotes, doc, rodar } = montar();
    escreve(pacotes, "digital/documentos.json", doc("original"));
    escreve(pacotes, "digital/lgpd.md", "texto original");
    const r = rodar();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Lei nº 13.853 (2019-07-08)");
  });
});

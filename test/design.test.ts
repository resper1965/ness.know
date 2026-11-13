import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// As três páginas (painel, /enviar e /docs) seguem os tokens do design system ness. (tema escuro). Estes testes impedem a paleta antiga de voltar.
const paginas = { "index.html": "painel", "enviar.html": "enviar", "docs.html": "docs" } as const;
const ler = (p: string) => readFileSync(`public/${p}`, "utf8");

const TOKENS = ["--ness-paper: #0e1116", "--ness-surface: #16191f", "--ness-surface-2: #1e232b", "--ness-line: rgba(255, 255, 255, .14)", "--ness-bad: #f87171", "--ness-bluedot: #00ade8", "--ness-accent-ink: #04121c"];
const PALETA_ANTIGA = ["#0b1326", "#162244", "#1e2d52", "#14214a", "#26365f", "#ef4444", "#fca5a5", "#ff6b6b", "#031018", "#a9b6cb", "#34d399"];

describe.each(Object.keys(paginas))("%s", (arq) => {
  const html = ler(arq);
  it("traz os tokens do design system", () => {
    for (const t of TOKENS) expect(html, t).toContain(t);
  });
  it("não usa a paleta antiga", () => {
    for (const h of PALETA_ANTIGA) expect(html.toLowerCase(), h).not.toContain(h);
  });
  it("usa as fontes do sistema e não uma fonte genérica como principal", () => {
    expect(html).toContain("family=Montserrat");
    expect(html).toContain("family=Inter");
    expect(html).toContain("family=JetBrains+Mono");
    expect(html).not.toMatch(/font:[^;{}]*(system-ui|Arial|Helvetica)/);
  });
  it("não usa cantos arredondados, gradiente nem blur", () => {
    expect(html).not.toMatch(/border-radius:\s*[1-9]/);
    expect(html).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter/);
  });
});

describe("marca e texto", () => {
  it("o produto é ness.know (caixa baixa) em toda a interface", () => {
    for (const arq of ["index.html", "app.js", "mensagem.js", "enviar.html", "docs.html", "llms.txt"]) expect(ler(arq), arq).not.toContain("ness.KNOW");
  });
  it("em texto corrido a empresa é NESS, na documentação pública", () => {
    for (const arq of ["docs.html", "llms.txt", "openapi.json"]) expect(ler(arq).replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, ""), arq).not.toMatch(/\b(da|pela|à|a|com a) ness\.(?![a-z])/);
  });
});

import { describe, expect, it } from "vitest";
import { lerSkill } from "../scripts/skills-md.mjs";

const md = `---
name: avaliando-mudanca
description: Use quando alguém abre ou aprova uma mudança (GMUD): classifica e avalia risco
version: 2026-11-06
normas:
  gestao-servicos-ti: ["ITIL 4 Foundation"]
  seguranca-conformidade: []
---

# Avaliando mudança
Passo 1.
`;

describe("lerSkill", () => {
  it("lê frontmatter, normas e corpo", () => {
    expect(lerSkill(md)).toEqual({
      nome: "avaliando-mudanca",
      descricao: "Use quando alguém abre ou aprova uma mudança (GMUD): classifica e avalia risco",
      versao: "2026-11-06",
      buscas: [],
      normas: { "gestao-servicos-ti": ["ITIL 4 Foundation"], "seguranca-conformidade": [] },
      corpo: "# Avaliando mudança\nPasso 1.",
    });
  });
  it("lê o bloco buscas; sem o bloco devolve []", () => {
    const comBuscas = "---\nname: x\ndescription: d\nbuscas:\n  - change enablement mudança padrão\n  - 8.32 gestão de mudanças\nnormas:\n  iso: []\n---\ncorpo";
    expect(lerSkill(comBuscas).buscas).toEqual(["change enablement mudança padrão", "8.32 gestão de mudanças"]);
    expect(lerSkill(comBuscas).normas).toEqual({ iso: [] });
    expect(lerSkill("---\nname: x\ndescription: d\n---\ncorpo").buscas).toEqual([]);
  });
  it("sem normas vale para toda chave; sem frontmatter ou sem nome dá erro", () => {
    expect(lerSkill("---\nname: geral\ndescription: x\n---\ncorpo").normas).toEqual({});
    expect(() => lerSkill("sem frontmatter")).toThrow("frontmatter");
    expect(() => lerSkill("---\ndescription: x\n---\ncorpo")).toThrow("name");
  });
});

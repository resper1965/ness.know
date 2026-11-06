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
      normas: { "gestao-servicos-ti": ["ITIL 4 Foundation"], "seguranca-conformidade": [] },
      corpo: "# Avaliando mudança\nPasso 1.",
    });
  });
  it("sem normas vale para toda chave; sem frontmatter ou sem nome dá erro", () => {
    expect(lerSkill("---\nname: geral\ndescription: x\n---\ncorpo").normas).toEqual({});
    expect(() => lerSkill("sem frontmatter")).toThrow("frontmatter");
    expect(() => lerSkill("---\ndescription: x\n---\ncorpo")).toThrow("name");
  });
});

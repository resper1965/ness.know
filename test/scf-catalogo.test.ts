import { describe, expect, it } from "vitest";
import strm from "../migrations/0003_strm.sql?raw";
import catalogo from "../migrations/0004_scf_catalogo.sql?raw";
import { catalogoParaSql } from "../scripts/scf-catalogo.mjs";
import { detalharControle } from "../src/strm";
import { bancoTeste } from "./sqlite";

const json = {
  metadata: { version: "2026.3" },
  controls: [
    {
      scf_id: "MON-02",
      legacy_scf_ids: ["MON-01"],
      scf_domain: "Continuous Monitoring",
      scf_control_name: "Continuous Monitoring",
      description: "Mechanisms exist to facilitate monitoring.",
      control_question: "Does the organization's monitor?",
      conformity_cadence: "Annual",
      weight: "10",
      nist_csf_function_grouping: ["Govern"],
      erl_references: ["E-MON-01"],
      cmm_levels: [{ level: 0, label: "Level 0 Not Performed", criteria: "Nada." }],
    },
  ],
  assessment_objectives: [
    { scf_id: "MON-02", ao_id: "MON-02_A02", objective: "objectives are defined." },
    { scf_id: "MON-02", ao_id: "MON-02_A01", objective: "the program is organization-wide." },
  ],
  evidence_request_list: [{ erl_id: "E-MON-01", area_of_focus: "Monitoring", artifact: "Monitoring Program", description: "Documented evidence of a monitoring program." }],
};

describe("catálogo do SCF", () => {
  const banco = () => {
    const sql = catalogoParaSql(json);
    return bancoTeste(strm, catalogo, sql, sql); // rodar duas vezes substitui, não duplica
  };

  it("detalha um controle com avaliação, evidências e maturidade", async () => {
    expect(await detalharControle(banco(), "mon-02")).toEqual({
      scf: "MON-02",
      nome: "Continuous Monitoring",
      dominio: "Continuous Monitoring",
      descricao: "Mechanisms exist to facilitate monitoring.",
      pergunta: "Does the organization's monitor?",
      peso: 10,
      cadencia: "Annual",
      funcao_csf: ["Govern"],
      legado: ["MON-01"],
      objetivos: [
        { id: "MON-02_A01", objetivo: "the program is organization-wide." },
        { id: "MON-02_A02", objetivo: "objectives are defined." },
      ],
      evidencias: [{ id: "E-MON-01", area: "Monitoring", artefato: "Monitoring Program", descricao: "Documented evidence of a monitoring program." }],
      maturidade: [{ nivel: 0, rotulo: "Level 0 Not Performed", criterio: "Nada." }],
    });
  });

  it("acha pelo id antigo e explica o desconhecido", async () => {
    expect(await detalharControle(banco(), "MON-01")).toMatchObject({ scf: "MON-02", aviso: expect.stringContaining("MON-01") });
    expect(await detalharControle(banco(), "XXX-99")).toEqual({ erro: expect.stringContaining("XXX-99") });
  });
});

describe("tamanho das instruções", () => {
  it("nenhuma instrução passa de 100 KB, mesmo com muitos controles grandes", () => {
    const grande = { ...json.controls[0], description: "x".repeat(5_000) };
    const sql = catalogoParaSql({ ...json, controls: Array.from({ length: 200 }, (_, i) => ({ ...grande, scf_id: `MON-${i}` })) });
    const instrucoes = sql.split(/;\n/);
    expect(instrucoes.length).toBeGreaterThan(10);
    for (const i of instrucoes) expect(new TextEncoder().encode(i).length).toBeLessThan(100_000);
  });
});

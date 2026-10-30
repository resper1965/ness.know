import { describe, expect, it } from "vitest";
import migracao from "../migrations/0003_strm.sql?raw";
import { lerPlanilha, paraSql } from "../scripts/strm.mjs";
import { bancoTeste } from "./sqlite";

const CAB = ["FDE #", "FDE Name", "Focal Document Element (FDE) Description", "STRM\nRationale", "STRM\nRelationship", "SCF Control", "SCF #", "Secure Controls Framework (SCF)\nControl Description", "Strength of Relationship", "Notes"];
const linhas = [
  ["NIST IR 8477-Based Set Theory Relationship Mapping (STRM)", null, null, null, null, "Focal Document: ", "ISO 27002:2022"],
  ["Reference document:", "Secure Controls Framework (SCF) version 2026.1"],
  [],
  [],
  CAB,
  ["8.16", "Monitoring activities", "…", "Functional", "Subset Of", "Continuous Monitoring", "MON-01", "Mechanisms exist to…", 10, null],
  [null, null, null, null, "Instersects With", "Anomalous Behavior", "MON-01.8", "Mechanisms exist to detect…", "5", null],
  ["5.1", "Policies", "…", "Functional", "No Relationship", "N/A", "N/A", "N/A", 0, null],
  [1.1, "Item numérico", "…", "Functional", "Equal", "O'Brien's control", "GOV-01", "Desc com 'aspas'", null, null],
];

describe("leitura do STRM", () => {
  it("acha as colunas pelo nome, herda o item em branco, normaliza a relação e descarta sem relação", () => {
    const p = lerPlanilha(linhas, "scf-strm-general-iso-27002-2022.xlsx");
    expect(p).toMatchObject({ id: "general-iso-27002-2022", nome: "ISO 27002:2022", versao: "2026.1" });
    expect(p.ligacoes).toEqual([
      { item: "8.16", itemNome: "Monitoring activities", relacao: "subconjunto", forca: 10, scf: "MON-01", scfNome: "Continuous Monitoring", scfDescricao: "Mechanisms exist to…" },
      { item: "8.16", itemNome: "Monitoring activities", relacao: "intersecao", forca: 5, scf: "MON-01.8", scfNome: "Anomalous Behavior", scfDescricao: "Mechanisms exist to detect…" },
      { item: "1.1", itemNome: "Item numérico", relacao: "igual", forca: null, scf: "GOV-01", scfNome: "O'Brien's control", scfDescricao: "Desc com 'aspas'" },
    ]);
  });

  it("acha as colunas mesmo deslocadas (FDE # repetido) e com FDE#", () => {
    const deslocado = [["Focal Document:", "X"], [], [], [], ["FDE #", "FDE #", "FDE Name", "Desc", "STRM Rationale", "STRM Relationship", "SCF Control", "SCF #", "SCF desc", "Strength of Relationship (optional)"], ["A1", "dup", "Nome", "d", "Functional", "Equal", "Ctl", "IAC-01", "d", "8"]];
    expect(lerPlanilha(deslocado, "scf-strm-x.xlsx").ligacoes).toEqual([{ item: "A1", itemNome: "Nome", relacao: "igual", forca: 8, scf: "IAC-01", scfNome: "Ctl", scfDescricao: "d" }]);
  });

  it("o SQL gerado roda no esquema, escapa aspas e cria o pacote scf-strm", async () => {
    const sql = paraSql([lerPlanilha(linhas, "scf-strm-general-iso-27002-2022.xlsx")]);
    const db = bancoTeste("CREATE TABLE pacotes (slug TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, instrucoes TEXT NOT NULL DEFAULT '', versao TEXT, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')));", migracao, sql, sql);
    expect((await db.prepare("SELECT count(*) AS n FROM strm").first<{ n: number }>())?.n).toBe(3); // rodar duas vezes não duplica
    expect(await db.prepare("SELECT nome FROM scf_controles WHERE scf = 'GOV-01'").first()).toEqual({ nome: "O'Brien's control" });
    expect(await db.prepare("SELECT itens FROM strm_frameworks").first()).toEqual({ itens: 2 });
    expect(await db.prepare("SELECT slug, versao FROM pacotes").first()).toEqual({ slug: "scf-strm", versao: "2026.1" });
  });
});

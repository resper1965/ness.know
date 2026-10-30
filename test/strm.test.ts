import { describe, expect, it } from "vitest";
import migracao from "../migrations/0003_strm.sql?raw";
import { lerPlanilha, paraSql } from "../scripts/strm.mjs";
import { cobertura, correlacionar } from "../src/strm";
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
    const deslocado = [["Focal Document:", "X"], [], [], [], ["CMMC FDE#", "FDE #", "FDE Name", "Desc", "STRM Rationale", "STRM Relationship", "SCF Control", "SCF #", "SCF desc", "Strength of Relationship (optional)"], ["A1", "dup", "Nome", "d", "Functional", "Equal", "Ctl", "IAC-01", "d", "8"]];
    expect(lerPlanilha(deslocado, "scf-strm-x.xlsx").ligacoes).toEqual([{ item: "A1", itemNome: "Nome", relacao: "igual", forca: 8, scf: "IAC-01", scfNome: "Ctl", scfDescricao: "d" }]);
  });

  it("cabeçalho sem STRM Relationship falha com erro que cita o arquivo", () => {
    const semRelacao = [["Focal Document:", "X"], [], [], [], ["FDE #", "FDE Name", "Desc", "STRM Rationale", "SCF Control", "SCF #", "SCF desc"], ["A1", "n", "d", "Functional", "Ctl", "IAC-01", "d"]];
    expect(() => lerPlanilha(semRelacao, "scf-strm-x-sem-relacao.xlsx")).toThrow(/scf-strm-x-sem-relacao\.xlsx.*STRM Relationship/);
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

const BASE = `
INSERT INTO strm_frameworks VALUES ('iso', 'ISO 27002:2022', '2026.1', 1), ('csf', 'NIST CSF 2.0', '2026.1', 1), ('cis', 'CIS v8.1', '2026.1', 1);
INSERT INTO scf_controles VALUES ('MON-01', 'Continuous Monitoring', 'd'), ('MON-02.2', 'Central Review', 'd');
INSERT INTO strm VALUES
  ('iso', '8.16', 'Monitoring activities', 'subconjunto', 10, 'MON-01'),
  ('iso', '8.16', 'Monitoring activities', 'intersecao', 5, 'MON-02.2'),
  ('csf', 'DE.CM-01', NULL, 'subconjunto', 10, 'MON-01'),
  ('cis', '8.11', 'Conduct Audit Log Reviews', 'igual', 10, 'MON-02.2'),
  ('cis', '8.2', 'Collect Audit Logs', 'intersecao', 8, 'MON-01'),
  ('cis', '8.2', 'Collect Audit Logs', 'intersecao', 6, 'MON-02.2');
`;
const banco = () => bancoTeste(migracao, BASE);

describe("correlacionar", () => {
  it("vai do item ao SCF e do SCF aos destinos, com a força do elo mais fraco e um resultado por item", async () => {
    const r = await correlacionar(banco(), " 8.16 ", "iso", ["csf", "cis", "iso", "nao-existe"]);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.destinos_desconhecidos).toEqual(["nao-existe"]);
    expect(r.origem).toEqual({ framework: "iso", nome: "ISO 27002:2022", item: "8.16", item_nome: "Monitoring activities" });
    expect(r.scf.map((s) => s.scf)).toEqual(["MON-01", "MON-02.2"]);
    expect(r.correspondencias).toEqual([
      { framework: "csf", item: "DE.CM-01", nome: null, via: "MON-01", relacao_origem: "subconjunto", relacao_destino: "subconjunto", forca: 10 },
      { framework: "cis", item: "8.2", nome: "Collect Audit Logs", via: "MON-01", relacao_origem: "subconjunto", relacao_destino: "intersecao", forca: 8 },
      { framework: "cis", item: "8.11", nome: "Conduct Audit Log Reviews", via: "MON-02.2", relacao_origem: "intersecao", relacao_destino: "igual", forca: 5 },
    ]);
  });

  it("aceita um controle SCF como origem", async () => {
    const r = await correlacionar(banco(), "mon-02.2", "scf", ["cis"]);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.correspondencias.map((c) => c.item)).toEqual(["8.11", "8.2"]);
  });

  it("explica framework e item desconhecidos", async () => {
    expect(await correlacionar(banco(), "8.16", "nao-existe", ["cis"])).toEqual({ erro: expect.stringContaining("framework desconhecido") });
    expect(await correlacionar(banco(), "99.9", "iso", ["cis"])).toEqual({ erro: expect.stringContaining("sem correspondência") });
  });

  it("atravessa o limite de parâmetros do D1: item ligado a 45 controles SCF", async () => {
    let sql = "INSERT INTO strm_frameworks VALUES ('big', 'Big', '2026.1', 1);";
    for (let i = 0; i < 45; i++) {
      const c = `X-${String(i).padStart(2, "0")}`;
      sql += `INSERT INTO scf_controles VALUES ('${c}', 'Controle ${i}', 'd');INSERT INTO strm VALUES ('iso', '1.1', 'Origem', 'igual', 10, '${c}'), ('big', 'B${i}', NULL, 'igual', 10, '${c}');`;
    }
    const r = await correlacionar(bancoTeste(migracao, BASE, sql), "1.1", "iso", ["big"]);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.scf).toHaveLength(45);
    expect(r.scf.every((s) => s.nome)).toBe(true);
    expect(r.correspondencias).toHaveLength(45);
  });
});

describe("cobertura", () => {
  const db = () => bancoTeste(migracao, BASE, "INSERT INTO strm VALUES ('cis', '4.1', 'Secure Configuration', 'subconjunto', 10, 'CFG-02');");

  it("classifica cada item do alvo pelo melhor caminho a partir do que está implementado", async () => {
    const r = await cobertura(db(), "iso", ["A.8.16", "9.99"], "cis");
    if ("erro" in r) throw new Error(r.erro);
    expect(r.alvo).toEqual({ framework: "cis", nome: "CIS v8.1" });
    expect(r.implementados_desconhecidos).toEqual(["9.99"]); // "A.8.16" vale como 8.16 na ISO 27002
    expect(r.resumo).toEqual({ coberto: 1, parcial: 1, sem_cobertura: 1 });
    expect(r.itens).toEqual([
      { item: "4.1", nome: "Secure Configuration", situacao: "sem_cobertura", forca: null, via: null, scf_sem_cobertura: ["CFG-02"] },
      { item: "8.2", nome: "Collect Audit Logs", situacao: "coberto", forca: 8, via: { scf: "MON-01", origem: "8.16" }, scf_sem_cobertura: [] },
      { item: "8.11", nome: "Conduct Audit Log Reviews", situacao: "parcial", forca: 5, via: { scf: "MON-02.2", origem: "8.16" }, scf_sem_cobertura: [] },
    ]);
  });

  it("aceita controles SCF como o que está implementado e explica alvo desconhecido", async () => {
    const r = await cobertura(db(), "scf", ["mon-02.2"], "cis");
    if ("erro" in r) throw new Error(r.erro);
    expect(r.itens.find((i) => i.item === "8.11")).toMatchObject({ situacao: "coberto", forca: 10 });
    expect(await cobertura(db(), "iso", ["8.16"], "nao-existe")).toEqual({ erro: expect.stringContaining("framework desconhecido") });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import { amostrar, comparar, escolher } from "../scripts/strm-conferir.mjs";
import { bancoTeste } from "./sqlite";

const lig = (item: string, scf = "MON-01", forca = 10) => ({ item, itemNome: `Item ${item}`, relacao: "igual", forca, scf });
const fw = (id: string, itens: string[], extras: Record<string, unknown> = {}) => ({ id, nome: id, ligacoes: itens.map((i) => lig(i)), ...extras });
const cem = Array.from({ length: 100 }, (_, i) => `1.${i}`);

describe("comparar", () => {
  it("sem diferença: nenhuma falha", () => {
    const r = comparar([fw("a", cem)], [fw("a", cem)]);
    expect(r.falhas).toBe(0);
    expect(r.comuns[0]).toMatchObject({ itensAntes: 100, itensDepois: 100, perdidos: [], falha: false });
  });
  it("perder mais que o limite dos itens falha; perder até o limite não", () => {
    expect(comparar([fw("a", cem)], [fw("a", cem.slice(3))]).falhas).toBe(1); // 3%
    const ok = comparar([fw("a", cem)], [fw("a", cem.slice(2))]); // 2%
    expect(ok.falhas).toBe(0);
    expect(ok.comuns[0].perdidos).toEqual(["1.0", "1.1"]);
  });
  it("framework da versão anterior que sumiu falha; um novo só é listado", () => {
    const r = comparar([fw("a", cem), fw("b", cem)], [fw("a", cem), fw("c", cem)]);
    expect(r.soAntigo).toEqual(["b"]);
    expect(r.soNovo).toEqual(["c"]);
    expect(r.falhas).toBe(1);
  });
  it("mudança grande de ligações só avisa (a renumeração junta e separa controles)", () => {
    const dobro = { id: "a", nome: "a", ligacoes: cem.flatMap((i) => [lig(i, "MON-01"), lig(i, "MON-02")]) };
    const r = comparar([fw("a", cem)], [dobro]);
    expect(r.comuns[0]).toMatchObject({ aviso: true, falha: false, varLigacoesPct: 100 });
    expect(r.falhas).toBe(0);
  });
});

describe("amostrar", () => {
  it("sorteia até n itens do framework escolhido e traz as ligações dos dois lados", () => {
    const novas = [fw("general-iso-27002-2022", ["8.15", "8.16"]), fw("outro", ["1"])];
    const antigas = [{ id: "general-iso-27002-2022", nome: "x", ligacoes: [lig("8.15", "OLD-01", 5)] }];
    const [a] = amostrar(escolher(novas, ["27002-2022", "nao-existe"]), antigas, 5, () => 0);
    expect(a.id).toBe("general-iso-27002-2022");
    expect(a.itens.map((i: { item: string }) => i.item).sort()).toEqual(["8.15", "8.16"]);
    const i815 = a.itens.find((i: { item: string }) => i.item === "8.15");
    expect(i815).toMatchObject({ depois: ["MON-01 igual 10"], antes: ["OLD-01 igual 5"] });
    expect(a.itens.find((i: { item: string }) => i.item === "8.16").antes).toEqual([]);
  });
  it("respeita o máximo de itens", () => {
    const [a] = amostrar([fw("a", cem)], [], 7);
    expect(a.itens).toHaveLength(7);
    expect(new Set(a.itens.map((i: { item: string }) => i.item)).size).toBe(7);
  });
});

describe("admin /api/strm", () => {
  const banco = () => {
    const DB = bancoTeste(readFileSync("migrations/0003_strm.sql", "utf8"));
    return { DB, env: { DB } as never };
  };
  const pedir = (env: never, caminho: string) => admin(new Request(`https://know${caminho}`), env, "a@ness.com.br", caminho);

  it("lista frameworks com a contagem de ligações e devolve as linhas de um framework", async () => {
    const { DB, env } = banco();
    await DB.prepare("INSERT INTO strm_frameworks (id, nome, versao_scf, itens) VALUES ('iso-27002', 'ISO 27002', '2026.3', 1)").bind().run();
    await DB.prepare("INSERT INTO strm (framework, item, item_nome, relacao, forca, scf) VALUES ('iso-27002', '8.16', 'Monitoring', 'igual', 10, 'MON-01'), ('iso-27002', '8.16', 'Monitoring', 'igual', 8, 'MON-02')").bind().run();
    expect(await (await pedir(env, "/api/strm/frameworks")).json()).toEqual([{ id: "iso-27002", nome: "ISO 27002", versao_scf: "2026.3", itens: 1, ligacoes: 2 }]);
    const linhas = (await (await pedir(env, "/api/strm/iso-27002")).json()) as { scf: string }[];
    expect(linhas.map((l) => l.scf)).toEqual(["MON-01", "MON-02"]);
  });
  it("framework desconhecido dá 404", async () => {
    const { env } = banco();
    expect((await pedir(env, "/api/strm/nao-existe")).status).toBe(404);
  });
});

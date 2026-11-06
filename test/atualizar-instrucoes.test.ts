import { describe, expect, it } from "vitest";
import { montarCorpo } from "../scripts/atualizar-instrucoes.mjs";

describe("montarCorpo", () => {
  it("mantém nome, descrição e versão do pacote e troca só as instruções", () => {
    expect(montarCorpo({ slug: "x", nome: "N", descricao: "D", versao: "1" }, "texto novo")).toEqual({ slug: "x", nome: "N", descricao: "D", versao: "1", instrucoes: "texto novo" });
  });
  it("descrição e versão nulas ficam de fora", () => {
    expect(montarCorpo({ slug: "x", nome: "N", descricao: null, versao: null }, "t")).toEqual({ slug: "x", nome: "N", instrucoes: "t" });
  });
  it("texto vazio é recusado", () => {
    expect(() => montarCorpo({ slug: "x", nome: "N" }, "   ")).toThrow("vazio");
  });
});

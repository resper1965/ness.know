import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escopoDe } from "../src/escopo";
import { bancoTeste } from "./sqlite";

export const migracoes = () => readdirSync("migrations").sort().map((f) => readFileSync(`migrations/${f}`, "utf8"));

function banco(regras: [string, string, string[], Record<string, string[]>?][]) {
  const db = bancoTeste(...migracoes());
  return Promise.all(
    regras.map(([tipo, sujeito, pacotes, docs]) =>
      db.prepare("INSERT INTO acesso_regras (tipo, sujeito, pacotes, documentos) VALUES (?, ?, ?, ?)").bind(tipo, sujeito, JSON.stringify(pacotes), JSON.stringify(docs ?? {})).run(),
    ),
  ).then(() => db);
}

describe("escopoDe", () => {
  it("sem regra não vê nada", async () => expect(await escopoDe(await banco([]), "a@ness.com.br")).toEqual({ pacotes: [], documentos: {} }));

  it("padrão vale para todos; regra da pessoa soma; regra de outra pessoa não vale; e-mail sem diferença de maiúsculas", async () => {
    const db = await banco([["padrao", "", ["leis"]], ["pessoa", "ana@ness.com.br", ["iso"]], ["pessoa", "bia@ness.com.br", ["nist"]]]);
    expect((await escopoDe(db, "Ana@ness.com.br")).pacotes.sort()).toEqual(["iso", "leis"]);
    expect((await escopoDe(db, "zé@ness.com.br")).pacotes).toEqual(["leis"]);
  });

  it("pacote inteiro numa regra vence a restrição de outra; duas restrições somam os títulos", async () => {
    const db = await banco([["padrao", "", ["iso"], { iso: ["ISO 27001"] }], ["pessoa", "ana@ness.com.br", ["iso", "nist"], { iso: ["ISO 27017"] }]]);
    expect(await escopoDe(db, "ana@ness.com.br")).toEqual({ pacotes: ["iso", "nist"], documentos: { iso: ["ISO 27001", "ISO 27017"] } });
    const db2 = await banco([["padrao", "", ["iso"], { iso: ["ISO 27001"] }], ["pessoa", "ana@ness.com.br", ["iso"]]]);
    expect(await escopoDe(db2, "ana@ness.com.br")).toEqual({ pacotes: ["iso"], documentos: {} });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import type { EnvConhecimento } from "../src/busca";
import { hashToken, mcp } from "../src/mcp";
import { bancoTeste } from "./sqlite";

const migracao = (n: string) => readFileSync(`migrations/${n}.sql`, "utf8");

describe("uso das chaves (SQL de verdade)", () => {
  it("conta as chamadas por ferramenta, atualiza o último uso e mostra no GET /api/chaves", async () => {
    const DB = bancoTeste(migracao("0001_inicial"), migracao("0002_chave_documentos"), migracao("0005_uso_chaves"), migracao("0007_chave_validade"), migracao("0009_oauth"));
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'faBRAINzio', ?, '[]')").bind(await hashToken("nesskb_x")).run();
    const chamar = (corpo: unknown) =>
      mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: "Bearer nesskb_x" }, body: JSON.stringify(corpo) }), { DB, AI: {} } as never);

    // O faBRAINzio chama tools/call direto, sem initialize: antes disso o último uso ficava "nunca".
    await chamar({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_pacotes" } });
    await chamar({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "listar_pacotes" } });
    await chamar({ jsonrpc: "2.0", id: 3, method: "tools/list" });

    const env = { DB } as unknown as EnvConhecimento;
    const lista = (await (await admin(new Request("https://x/api/chaves"), env, "a@b.c", "/api/chaves")).json()) as { nome: string; usado_em: string | null; chamadas_30d: number }[];
    expect(lista).toHaveLength(1);
    expect(lista[0].chamadas_30d).toBe(3);
    expect(lista[0].usado_em).not.toBeNull();
    const porFerramenta = await DB.prepare("SELECT ferramenta, chamadas FROM uso_chaves ORDER BY ferramenta").all<{ ferramenta: string; chamadas: number }>();
    expect(porFerramenta.results).toEqual([{ ferramenta: "listar_pacotes", chamadas: 2 }, { ferramenta: "tools/list", chamadas: 1 }]);
  });
});

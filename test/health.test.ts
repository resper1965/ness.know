import { describe, expect, it } from "vitest";
import worker from "../src/worker";
import { bancoTeste } from "./sqlite";

const pedir = (DB: D1Database, caminho: string) => worker.fetch(new Request(`https://know${caminho}`), { DB } as never);

describe("/health", () => {
  it("simples responde ok sem tocar no banco", async () => {
    const DB = { prepare: () => { throw new Error("não devia consultar"); } } as unknown as D1Database;
    expect(await (await pedir(DB, "/health")).text()).toBe("ok");
  });
  it("profundo consulta o D1: 200 com o banco no ar, 503 sem ele", async () => {
    const r = await pedir(bancoTeste(), "/health?profundo=1");
    expect([r.status, await r.text()]).toEqual([200, "ok"]);
    const fora = { prepare: () => ({ first: async () => { throw new Error("D1 fora"); } }) } as unknown as D1Database;
    expect((await pedir(fora, "/health?profundo=1")).status).toBe(503);
  });
});

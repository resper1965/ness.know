import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import type { EnvConhecimento } from "../src/busca";
import { hashToken, mcp } from "../src/mcp";
import { bancoTeste } from "./sqlite";

const migracao = (n: string) => readFileSync(`migrations/${n}.sql`, "utf8");
const novoBanco = () => bancoTeste(migracao("0001_inicial"), migracao("0002_chave_documentos"), migracao("0005_uso_chaves"), migracao("0007_chave_validade"));

describe("validade da chave", () => {
  const ping = (DB: D1Database, token: string) =>
    mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }), { DB, AI: {} } as never);

  it("chave vencida recebe 401; a válida e a sem validade entram", async () => {
    const DB = novoBanco();
    const nova = async (id: string, expira: string | null) =>
      DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, expira_em) VALUES (?, ?, ?, '[]', ?)").bind(id, id, await hashToken(`nesskb_${id}`), expira).run();
    await nova("vencida", "2020-01-01 00:00:00");
    await nova("valida", "2999-01-01 00:00:00");
    await nova("sem", null);
    expect((await ping(DB, "nesskb_vencida")).status).toBe(401);
    expect((await ping(DB, "nesskb_valida")).status).toBe(200);
    expect((await ping(DB, "nesskb_sem")).status).toBe(200);
  });
});

describe("POST /api/chaves com validade", () => {
  const criar = async (corpo: Record<string, unknown>) => {
    const DB = novoBanco();
    await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('iso', 'ISO')").bind().run();
    const env = { DB } as unknown as EnvConhecimento;
    const r = await admin(new Request("https://x/api/chaves", { method: "POST", body: JSON.stringify({ nome: "teste", pacotes: ["iso"], ...corpo }) }), env, "a@b.c", "/api/chaves");
    const lista = (await (await admin(new Request("https://x/api/chaves"), env, "a@b.c", "/api/chaves")).json()) as { expira_em: string | null }[];
    return { status: r.status, expira: lista[0]?.expira_em ?? null };
  };

  it("sem validade, não expira", async () => expect(await criar({})).toEqual({ status: 200, expira: null }));
  it("`dias` vira data daqui a N dias", async () => {
    const r = await criar({ dias: 30 });
    expect(r.status).toBe(200);
    const dias = (Date.parse(`${r.expira!.replace(" ", "T")}Z`) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
  });
  it("`expira_em` AAAA-MM-DD vale até o fim desse dia (UTC)", async () => expect(await criar({ expira_em: "2999-12-31" })).toEqual({ status: 200, expira: "2999-12-31 23:59:59" }));
  it("recusa data passada, data inválida, dias fora de 1 a 3650 e os dois juntos", async () => {
    for (const c of [{ expira_em: "2020-01-01" }, { expira_em: "31/12/2999" }, { dias: 0 }, { dias: 4000 }, { dias: "x" }, { dias: 5, expira_em: "2999-12-31" }]) expect((await criar(c)).status).toBe(400);
  });
});

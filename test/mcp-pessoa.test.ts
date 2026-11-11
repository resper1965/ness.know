import { describe, expect, it } from "vitest";
import { hashToken, mcp } from "../src/mcp";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const TOKEN = "nesskb_pessoa";

async function ambiente(pessoa: string | null, pacotesNaChave = ["gravado"]) {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('leis', 'Leis'), ('iso', 'ISO'), ('gravado', 'Gravado')").run();
  await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, pessoa) VALUES ('c1', 'ana (OAuth)', ?, ?, ?)").bind(await hashToken(TOKEN), JSON.stringify(pacotesNaChave), pessoa).run();
  return { DB, AI: {} as Ai };
}
const regra = (env: { DB: D1Database }, tipo: string, sujeito: string, pacotes: string[]) =>
  env.DB.prepare("INSERT INTO acesso_regras (tipo, sujeito, pacotes) VALUES (?, ?, ?)").bind(tipo, sujeito, JSON.stringify(pacotes)).run();
const listar = async (env: Awaited<ReturnType<typeof ambiente>>) => {
  const r = await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_pacotes", arguments: {} } }) }), env);
  const j = (await r.json()) as { result: { content: { text: string }[] } };
  return (JSON.parse(j.result.content[0].text).pacotes as { slug: string }[]).map((p) => p.slug).sort();
};

describe("chave de pessoa (OAuth)", () => {
  it("o escopo vem das regras de hoje, não do gravado na chave; mudar a regra muda a próxima chamada", async () => {
    const env = await ambiente("ana@ness.com.br");
    expect(await listar(env)).toEqual([]);
    await regra(env, "padrao", "", ["leis"]);
    expect(await listar(env)).toEqual(["leis"]);
    await regra(env, "pessoa", "ana@ness.com.br", ["iso"]);
    expect(await listar(env)).toEqual(["iso", "leis"]);
    await env.DB.prepare("DELETE FROM acesso_regras WHERE tipo = 'pessoa'").run();
    expect(await listar(env)).toEqual(["leis"]);
  });

  it("chave de agente (sem pessoa) segue o gravado, ignorando as regras", async () => {
    const env = await ambiente(null);
    await regra(env, "padrao", "", ["leis"]);
    expect(await listar(env)).toEqual(["gravado"]);
  });

  it("buscar_conhecimento não passa do escopo da pessoa", async () => {
    const env = await ambiente("ana@ness.com.br");
    await regra(env, "padrao", "", ["leis"]);
    const r = await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "buscar_conhecimento", arguments: { consulta: "x", pacotes: ["iso"] } } }) }), env);
    const j = (await r.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(JSON.parse(j.result.content[0].text).trechos).toEqual([]); // pediu "iso", fora do escopo: a busca não o alcança
  });

  it("o 401 aponta a descoberta OAuth", async () => {
    const env = await ambiente(null);
    const r = await mcp(new Request("https://know.ness.com.br/mcp", { method: "POST", headers: { authorization: "Bearer errado" }, body: "{}" }), env);
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain('resource_metadata="https://know.ness.com.br/.well-known/oauth-protected-resource"');
  });
});

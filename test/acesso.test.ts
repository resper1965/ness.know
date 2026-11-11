import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import worker from "../src/worker";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

async function ambiente() {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('leis', 'Leis'), ('iso', 'ISO')").run();
  await DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo) VALUES ('d1', 'pacote', 'iso', 'ISO 27001'), ('d2', 'pacote', 'iso', 'ISO 27017')").run();
  return { DB };
}
const chamar = async (env: unknown, metodo: string, caminho: string, corpo?: unknown, email = "adm@ness.com.br") => {
  const r = await admin(new Request(`https://know${caminho}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } }), env as never, email, caminho);
  return { status: r.status, corpo: (await r.json()) as never as Record<string, unknown> & unknown[] };
};

describe("acesso por pessoa (painel)", () => {
  it("define o padrão e a regra da pessoa; a lista traz as duas", async () => {
    const env = await ambiente();
    expect((await chamar(env, "PUT", "/api/acesso/padrao", { pacotes: ["leis"] })).status).toBe(200);
    expect((await chamar(env, "PUT", "/api/acesso/pessoa/Ana%40Ness.com.br", { pacotes: ["iso"], documentos: { iso: ["ISO 27001"] } })).status).toBe(200);
    const { corpo } = await chamar(env, "GET", "/api/acesso");
    expect(corpo).toMatchObject({ padrao: { pacotes: ["leis"] }, pessoas: [{ email: "ana@ness.com.br", pacotes: ["iso"], documentos: { iso: ["ISO 27001"] }, criado_por: "adm@ness.com.br" }] });
  });

  it("recusa pacote ou norma inexistente e e-mail inválido; regra inexistente não se remove", async () => {
    const env = await ambiente();
    expect((await chamar(env, "PUT", "/api/acesso/padrao", { pacotes: ["nao-existe"] })).status).toBe(404);
    expect((await chamar(env, "PUT", "/api/acesso/padrao", { pacotes: ["iso"], documentos: { iso: ["ISO 99999"] } })).status).toBe(400);
    expect((await chamar(env, "PUT", "/api/acesso/pessoa/sem-arroba", { pacotes: ["leis"] })).status).toBe(400);
    expect((await chamar(env, "DELETE", "/api/acesso/pessoa/ana%40ness.com.br")).status).toBe(404);
  });

  it("remover a regra tira o acesso; tudo fica na auditoria com o ator, sem conteúdo", async () => {
    const env = await ambiente();
    await chamar(env, "PUT", "/api/acesso/pessoa/ana%40ness.com.br", { pacotes: ["iso"] });
    expect((await chamar(env, "DELETE", "/api/acesso/pessoa/ana%40ness.com.br")).status).toBe(200);
    const a = (await chamar(env, "GET", "/api/auditoria")).corpo as unknown as { ator: string; acao: string }[];
    expect(a.map((x) => x.acao)).toEqual(["acesso.remover", "acesso.definir"]);
    expect(a.every((x) => x.ator === "adm@ness.com.br")).toBe(true);
  });

  it("a lista de chaves mostra a origem; revogar grava quem revogou", async () => {
    const env = await ambiente();
    await env.DB.prepare("INSERT INTO chaves (id, nome, token_hash, pessoa, cliente_oauth) VALUES ('11111111-1111-1111-1111-111111111111', 'ness.work (OAuth)', 'h1', 'ana@ness.com.br', 'oa-x'), ('22222222-2222-2222-2222-222222222222', 'faBRAINzio', 'h2', NULL, NULL)").run();
    const lista = (await chamar(env, "GET", "/api/chaves")).corpo as unknown as { nome: string; origem: string; pessoa: string | null }[];
    expect(lista.find((c) => c.nome === "faBRAINzio")).toMatchObject({ origem: "agente", pessoa: null });
    expect(lista.find((c) => c.nome.startsWith("ness.work"))).toMatchObject({ origem: "oauth", pessoa: "ana@ness.com.br" });
    expect((await chamar(env, "DELETE", "/api/chaves/11111111-1111-1111-1111-111111111111", undefined, "outro@ness.com.br")).status).toBe(200);
    expect(await env.DB.prepare("SELECT ator, acao, detalhe FROM auditoria").first()).toMatchObject({ ator: "outro@ness.com.br", acao: "chave.revogar", detalhe: "11111111-1111-1111-1111-111111111111" });
  });

  it("sem login de admin no Access, as rotas novas respondem 401", async () => {
    const env = { ...(await ambiente()), ASSETS: {} as Fetcher, ACCESS_TEAM: "x.cloudflareaccess.com", ACCESS_AUD: "a", ADMIN_EMAILS: "adm@ness.com.br" } as never;
    for (const c of ["/api/acesso", "/api/auditoria"]) expect((await worker.fetch(new Request(`https://know.ness.com.br${c}`), env)).status).toBe(401);
  });
});

import { describe, expect, it } from "vitest";
import { mcp } from "../src/mcp";
import { autorizar, metadados, redirectValido, registrar, token, VALIDADE_DIAS } from "../src/oauth";
import worker from "../src/worker";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const REDIRECT = "https://work.ness.com.br/callback";
const VERIFICADOR = "v".repeat(64);
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desafioDe = async (v: string) => b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));

const novoEnv = () => ({ DB: bancoTeste(...migracoes()) });
type Env = ReturnType<typeof novoEnv>;
const post = (url: string, corpo: unknown, h: Record<string, string> = {}) => new Request(`https://know.ness.com.br${url}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json", ...h } });
const form = (url: string, c: Record<string, string>) => new Request(`https://know.ness.com.br${url}`, { method: "POST", body: new URLSearchParams(c) });

async function registrarCliente(env: Env, nome = "ness.work") {
  const r = await registrar(post("/oauth/register", { client_name: nome, redirect_uris: [REDIRECT] }), env);
  expect(r.status).toBe(201);
  return ((await r.json()) as { client_id: string }).client_id;
}

/** GET do consentimento: devolve o id do pedido que a página guarda no formulário. */
async function pedir(env: Env, clientId: string, pessoa: string, extra: Record<string, string> = {}, agora?: number) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", state: "est", code_challenge: await desafioDe(VERIFICADOR), code_challenge_method: "S256", ...extra });
  const r = await autorizar(new Request(`https://know.ness.com.br/oauth/authorize?${q}`), env, pessoa, agora);
  return { r, html: r.status === 200 ? await r.text() : "" };
}
const pedidoDe = (html: string) => /name="pedido" value="([^"]+)"/.exec(html)![1];

/** Percorre o consentimento até o código; devolve o código. */
async function codigo(env: Env, clientId: string, pessoa = "ana@ness.com.br", agora?: number) {
  const { html } = await pedir(env, clientId, pessoa, {}, agora);
  const r = await autorizar(form("/oauth/authorize", { pedido: pedidoDe(html), decisao: "sim" }), env, pessoa, agora);
  expect(r.status).toBe(302);
  const u = new URL(r.headers.get("location")!);
  expect(u.searchParams.get("state")).toBe("est");
  return u.searchParams.get("code")!;
}
const trocar = (env: Env, c: string, extra: Record<string, string> = {}, agora?: number) =>
  token(form("/oauth/token", { grant_type: "authorization_code", code: c, redirect_uri: REDIRECT, code_verifier: VERIFICADOR, ...extra }), env, agora);

const usarNoMcp = (env: Env, chave: string) =>
  mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${chave}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }), { ...env, AI: {} as Ai });

describe("descoberta", () => {
  it("anuncia recurso e servidor com S256 e cliente público", async () => {
    const rec = await (metadados("/.well-known/oauth-protected-resource/mcp", "https://know.ness.com.br")!.json() as Promise<Record<string, unknown>>);
    expect(rec.resource).toBe("https://know.ness.com.br/mcp");
    const srv = await (metadados("/.well-known/oauth-authorization-server", "https://know.ness.com.br")!.json() as Promise<Record<string, unknown>>);
    expect(srv).toMatchObject({ code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], registration_endpoint: "https://know.ness.com.br/oauth/register" });
    expect(metadados("/outra", "https://x")).toBeNull();
  });
});

describe("registro", () => {
  it("valida redirect_uris", () => {
    expect([REDIRECT, "http://localhost:3000/cb", "http://127.0.0.1/cb"].every(redirectValido)).toBe(true);
    for (const ruim of ["http://evil.com/cb", "https://a.com/cb#frag", "https://u:p@a.com/cb", "javascript:alert(1)", "não é url", 5]) expect(redirectValido(ruim)).toBe(false);
  });
  it("corpo que não é objeto, JSON inválido e URIs fora de 1 a 5 respondem 400 sem exceção", async () => {
    const env = novoEnv();
    for (const corpo of [null, [], 7, "texto"]) expect((await registrar(post("/oauth/register", corpo), env)).status).toBe(400);
    expect((await registrar(new Request("https://x/oauth/register", { method: "POST", body: "{não é json" }), env)).status).toBe(400);
    expect((await registrar(post("/oauth/register", { redirect_uris: [] }), env)).status).toBe(400);
    expect((await registrar(post("/oauth/register", { redirect_uris: Array(6).fill(REDIRECT) }), env)).status).toBe(400);
    expect((await registrar(post("/oauth/register", { redirect_uris: ["http://evil.com/cb"] }), env)).status).toBe(400);
  });
  it("a cada registro apaga códigos vencidos e clientes abandonados, e preserva o que está em uso", async () => {
    const env = novoEnv();
    const exec = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
    await exec("INSERT INTO oauth_clientes (client_id, nome, redirect_uris, criado_em) VALUES ('oa-velho', 'v', '[]', datetime('now', '-40 days')), ('oa-comchave', 'c', '[]', datetime('now', '-40 days')), ('oa-compedido', 'p', '[]', datetime('now', '-40 days')), ('oa-recente', 'r', '[]', datetime('now', '-2 days'))");
    await exec("INSERT INTO chaves (id, nome, token_hash, pessoa, cliente_oauth) VALUES ('11111111-1111-1111-1111-111111111111', 'k', 'h', 'ana@ness.com.br', 'oa-comchave')");
    await exec("INSERT INTO oauth_codigos (id, client_id, pessoa, redirect_uri, desafio, expira_em) VALUES ('vencido', 'oa-velho', 'a', 'https://x', 'd', datetime('now', '-1 hour')), ('vigente', 'oa-compedido', 'a', 'https://x', 'd', datetime('now', '+5 minutes'))");
    expect((await registrar(post("/oauth/register", { redirect_uris: [REDIRECT] }), env)).status).toBe(201);
    const clientes = (await env.DB.prepare("SELECT client_id FROM oauth_clientes").all<{ client_id: string }>()).results.map((c) => c.client_id);
    expect(clientes).toEqual(expect.arrayContaining(["oa-comchave", "oa-compedido", "oa-recente"])); // chave, pedido em andamento e registro recente ficam
    expect(clientes).not.toContain("oa-velho");
    expect(clientes).toHaveLength(4); // os 3 que ficam e o recém-registrado
    expect((await env.DB.prepare("SELECT id FROM oauth_codigos").all<{ id: string }>()).results.map((c) => c.id)).toEqual(["vigente"]);
  });
  it("falha na limpeza não impede o registro", async () => {
    const env = novoEnv();
    const real = env.DB.prepare.bind(env.DB);
    env.DB.prepare = ((sql: string) => (sql.startsWith("DELETE FROM oauth_") ? { run: async () => { throw new Error("banco indisponível"); } } : real(sql))) as never;
    expect((await registrar(post("/oauth/register", { redirect_uris: [REDIRECT] }), env)).status).toBe(201);
  });
  it("a cota por IP vem antes da global: um IP esgotado não gasta a cota global", async () => {
    const chamadas: string[] = [];
    const limite = (nome: string, ok: (k: string) => boolean) => ({ limit: async ({ key }: { key: string }) => (chamadas.push(`${nome}:${key}`), { success: ok(key) }) }) as unknown as RateLimit;
    const env = { ...novoEnv(), LIMITE_REGISTRO_IP: limite("ip", (k) => k !== "1.1.1.1"), LIMITE_REGISTRO: limite("global", () => true) };
    const r = await registrar(post("/oauth/register", { redirect_uris: [REDIRECT] }, { "cf-connecting-ip": "1.1.1.1" }), env);
    expect(r.status).toBe(429);
    expect(chamadas).toEqual(["ip:1.1.1.1"]);
    expect((await registrar(post("/oauth/register", { redirect_uris: [REDIRECT] }, { "cf-connecting-ip": "2.2.2.2" }), env)).status).toBe(201);
    expect(chamadas).toEqual(["ip:1.1.1.1", "ip:2.2.2.2", "global:global"]);
  });
});

describe("autorização", () => {
  it("cliente ou redirect desconhecido responde 400 sem redirecionar", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    expect((await pedir(env, "oa-nao-existe", "ana@ness.com.br")).r.status).toBe(400);
    const { r } = await pedir(env, c, "ana@ness.com.br", { redirect_uri: "https://evil.com/cb" });
    expect(r.status).toBe(400);
    expect(r.headers.get("location")).toBeNull();
  });
  it("exige PKCE S256", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    for (const extra of [{ code_challenge_method: "plain" }, { code_challenge: "curto" }] as Record<string, string>[]) {
      const { r } = await pedir(env, c, "ana@ness.com.br", extra);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toContain("error=invalid_request");
    }
  });
  it("a página de consentimento mostra a pessoa e escapa o nome do cliente", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env, '<img src=x onerror="alert(1)">');
    const { html } = await pedir(env, c, "ana@ness.com.br");
    expect(html).toContain("ana@ness.com.br");
    expect(html).not.toContain("<img");
    expect(html).toContain("&#60;img");
  });
  it("CSRF: pedido de outra pessoa, inexistente ou vencido não gera código", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const { html } = await pedir(env, c, "ana@ness.com.br", {}, 1_000_000);
    const pedido = pedidoDe(html);
    expect((await autorizar(form("/oauth/authorize", { pedido, decisao: "sim" }), env, "bia@ness.com.br", 1_000_000)).status).toBe(400);
    expect((await autorizar(form("/oauth/authorize", { pedido: "inventado", decisao: "sim" }), env, "ana@ness.com.br", 1_000_000)).status).toBe(400);
    expect((await autorizar(form("/oauth/authorize", { pedido, decisao: "sim" }), env, "ana@ness.com.br", 1_000_000 + 11 * 60_000)).status).toBe(400);
  });
  it("recusar volta com access_denied e apaga o pedido", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const { html } = await pedir(env, c, "ana@ness.com.br");
    const r = await autorizar(form("/oauth/authorize", { pedido: pedidoDe(html), decisao: "nao" }), env, "ana@ness.com.br");
    expect(r.headers.get("location")).toContain("error=access_denied");
    expect((await autorizar(form("/oauth/authorize", { pedido: pedidoDe(html), decisao: "sim" }), env, "ana@ness.com.br")).status).toBe(400);
  });
});

describe("token", () => {
  it("fluxo completo: a chave entra no /mcp, vale 30 dias e o código é de uso único", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const cod = await codigo(env, c);
    const r = await trocar(env, cod, { client_id: c });
    expect(r.status).toBe(200);
    const t = (await r.json()) as { access_token: string; token_type: string; expires_in: number };
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: VALIDADE_DIAS * 86_400 });
    expect(t.access_token).toMatch(/^nesskb_/);
    expect((await usarNoMcp(env, t.access_token)).status).toBe(200);
    expect((await trocar(env, cod, { client_id: c })).status).toBe(400); // código já usado
    const linha = (await env.DB.prepare("SELECT pessoa, cliente_oauth, expira_em FROM chaves").first()) as { pessoa: string; cliente_oauth: string; expira_em: string };
    expect(linha).toMatchObject({ pessoa: "ana@ness.com.br", cliente_oauth: c });
    expect(linha.expira_em).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect((await env.DB.prepare("SELECT ator, acao FROM auditoria").first())).toMatchObject({ ator: "ana@ness.com.br", acao: "oauth.conceder" });
  });
  it("PKCE, client_id e redirect que não conferem recusam sem queimar o código", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const cod = await codigo(env, c);
    for (const extra of [{ code_verifier: "errado".repeat(10) }, { client_id: "oa-outro" }, { redirect_uri: "https://evil.com/cb" }] as Record<string, string>[])
      expect((await trocar(env, cod, { client_id: c, ...extra })).status).toBe(400);
    expect((await trocar(env, cod, { client_id: c })).status).toBe(200); // a troca certa ainda funciona
  });
  it("código vencido (60 s) é recusado", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const t0 = Date.now();
    const cod = await codigo(env, c, "ana@ness.com.br", t0);
    expect((await trocar(env, cod, { client_id: c }, t0 + 61_000)).status).toBe(400);
  });
  it("reautorizar substitui a chave anterior da mesma pessoa e cliente", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    const a = (await (await trocar(env, await codigo(env, c), { client_id: c })).json()) as { access_token: string };
    const b = (await (await trocar(env, await codigo(env, c), { client_id: c })).json()) as { access_token: string };
    expect((await usarNoMcp(env, a.access_token)).status).toBe(401);
    expect((await usarNoMcp(env, b.access_token)).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM chaves").first<{ n: number }>())!.n).toBe(1);
    expect((await env.DB.prepare("SELECT id FROM chaves").first<{ id: string }>())!.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("chave revogada no painel não volta por reautorização", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    await trocar(env, await codigo(env, c), { client_id: c });
    await env.DB.prepare("UPDATE chaves SET ativo = 0").run();
    const r = await trocar(env, await codigo(env, c), { client_id: c });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error_description: string }).error_description).toContain("revogada");
    expect((await env.DB.prepare("SELECT ativo FROM chaves").first<{ ativo: number }>())!.ativo).toBe(0);
  });
  it("pessoas diferentes no mesmo cliente têm chaves diferentes", async () => {
    const env = novoEnv();
    const c = await registrarCliente(env);
    await trocar(env, await codigo(env, c, "ana@ness.com.br"), { client_id: c });
    await trocar(env, await codigo(env, c, "bia@ness.com.br"), { client_id: c });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM chaves").first<{ n: number }>())!.n).toBe(2);
  });
});

describe("rotas do Worker", () => {
  const env = { ...novoEnv(), ASSETS: { fetch: async () => new Response("estático") } as unknown as Fetcher, ACCESS_TEAM: "x.cloudflareaccess.com", ACCESS_AUD: "aud", ADMIN_EMAILS: "" };
  it("descoberta e registro ficam abertos; authorize sem login do Access responde 401", async () => {
    const w = (u: string, i?: RequestInit) => worker.fetch(new Request(`https://know.ness.com.br${u}`, i), env as never);
    expect((await w("/.well-known/oauth-protected-resource")).status).toBe(200);
    expect((await w("/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [REDIRECT] }) })).status).toBe(201);
    expect((await w("/oauth/authorize?client_id=x")).status).toBe(401);
  });
});

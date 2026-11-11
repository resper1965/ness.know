import { describe, expect, it, vi } from "vitest";
import { admin } from "../src/admin";
import { envio, novoTokenEnvio } from "../src/envio";
import { hashToken, mcp } from "../src/mcp";
import worker from "../src/worker";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

// O que depende do Workers AI (converter o arquivo em trechos) é simulado; o resto roda de verdade no SQLite.
vi.mock("../src/busca", async (original) => ({
  ...(await original<typeof import("../src/busca")>()),
  ingerir: vi.fn(async (env: { DB: D1Database }, alvo: { dono: string }, meta: { titulo: string }, _arquivo: File, autor: string) => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, status, r2_key, criado_por) VALUES (?, 'pacote', ?, ?, 'ok', 'k', ?)").bind(id, alvo.dono, meta.titulo, autor).run();
    return { id, trechos: 1 };
  }),
}));

async function ambiente(cota: number | null = 2) {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO pacotes (slug, nome, cota_documentos) VALUES ('cliente-x', 'Cliente X', ?), ('cliente-y', 'Cliente Y', 5)").bind(cota).run();
  const token = novoTokenEnvio();
  await DB.prepare("INSERT INTO chaves_envio (id, nome, token_hash, pacote, expira_em) VALUES ('11111111-1111-1111-1111-111111111111', 'Cliente X', ?, 'cliente-x', datetime('now', '+30 days'))").bind(await hashToken(token)).run();
  return { env: { DB, ARQUIVOS: { delete: vi.fn(async () => {}) }, VETORES: { deleteByIds: vi.fn(async () => ({})) }, AI: {} }, token };
}
type Amb = Awaited<ReturnType<typeof ambiente>>;

const pedir = (a: Amb, metodo: string, caminho: string, opcoes: { token?: string | null; corpo?: BodyInit; ip?: string } = {}) =>
  envio(
    new Request(`https://know.ness.com.br${caminho}`, {
      method: metodo,
      body: opcoes.corpo,
      headers: { ...(opcoes.token === null ? {} : { authorization: `Bearer ${opcoes.token ?? a.token}` }), ...(opcoes.ip ? { "cf-connecting-ip": opcoes.ip } : {}) },
    }),
    a.env as never,
    caminho,
  );
const arquivo = (titulo: string, tamanho = 5) => {
  const f = new FormData();
  f.set("arquivo", new Blob(["x".repeat(tamanho)]), "a.md");
  f.set("titulo", titulo);
  return f;
};
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("chave de envio: autenticação", () => {
  it("sem chave, chave errada, revogada ou vencida: 401", async () => {
    const a = await ambiente();
    expect((await pedir(a, "GET", "/api/envio/documentos", { token: null })).status).toBe(401);
    expect((await pedir(a, "GET", "/api/envio/documentos", { token: "nessup_errada" })).status).toBe(401);
    await a.env.DB.prepare("UPDATE chaves_envio SET expira_em = datetime('now', '-1 day')").run();
    expect((await pedir(a, "GET", "/api/envio/documentos")).status).toBe(401);
    await a.env.DB.prepare("UPDATE chaves_envio SET expira_em = datetime('now', '+1 day'), ativo = 0").run();
    expect((await pedir(a, "GET", "/api/envio/documentos")).status).toBe(401);
  });

  it("quem insiste com chave errada recebe 429 (limite por IP) e a chave certa não é afetada", async () => {
    const a = await ambiente();
    const limite = { limit: vi.fn(async () => ({ success: false })) } as unknown as RateLimit;
    (a.env as Record<string, unknown>).LIMITE_AUTH = limite;
    const r = await pedir(a, "GET", "/api/envio/documentos", { token: "nessup_errada", ip: "9.9.9.9" });
    expect(r.status).toBe(429);
    expect((await pedir(a, "GET", "/api/envio/documentos")).status).toBe(200); // chave certa não passa pelo limite de falhas
  });

  it("limite por chave: acima dele, 429", async () => {
    const a = await ambiente();
    (a.env as Record<string, unknown>).LIMITE_ENVIO = { limit: async () => ({ success: false }) };
    expect((await pedir(a, "GET", "/api/envio/documentos")).status).toBe(429);
  });

  it("as duas credenciais são separadas: a de envio não lê pelo /mcp e a do /mcp não grava", async () => {
    const a = await ambiente();
    const r = await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${a.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }), a.env as never);
    expect(r.status).toBe(401);
    const tokenMcp = "nesskb_leitura";
    await a.env.DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('22222222-2222-2222-2222-222222222222', 'leitura', ?, '[\"cliente-x\"]')").bind(await hashToken(tokenMcp)).run();
    expect((await pedir(a, "GET", "/api/envio/documentos", { token: tokenMcp })).status).toBe(401);
  });

  it("pelo Worker, /api/envio/* não passa pelo Access: sem chave é 401 do envio, não do painel", async () => {
    const a = await ambiente();
    const w = { ...a.env, ASSETS: {} as Fetcher, ACCESS_TEAM: "x.cloudflareaccess.com", ACCESS_AUD: "a", ADMIN_EMAILS: "" };
    const r = await worker.fetch(new Request("https://know.ness.com.br/api/envio/documentos", { headers: { authorization: `Bearer ${a.token}` } }), w as never);
    expect(r.status).toBe(200);
  });
});

describe("chave de envio: o pacote da empresa, e só ele", () => {
  it("lista só os documentos do próprio pacote, com o uso da cota", async () => {
    const a = await ambiente();
    await a.env.DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, status) VALUES ('d1', 'pacote', 'cliente-x', 'Política A', 'ok'), ('d2', 'pacote', 'cliente-y', 'Do outro', 'ok')").run();
    const j = await json(await pedir(a, "GET", "/api/envio/documentos"));
    expect(j).toMatchObject({ pacote: { nome: "Cliente X", cota_documentos: 2, usados: 1 }, documentos: [{ titulo: "Política A" }] });
  });

  it("envia, substitui o mesmo título sem gastar cota e recusa título novo acima da cota (422)", async () => {
    const a = await ambiente(2);
    expect((await pedir(a, "POST", "/api/envio/documentos", { corpo: arquivo("A") })).status).toBe(200);
    expect((await pedir(a, "POST", "/api/envio/documentos", { corpo: arquivo("B") })).status).toBe(200);
    const sub = await json(await pedir(a, "POST", "/api/envio/documentos", { corpo: arquivo("A") })); // mesmo título: substitui
    expect(sub).toMatchObject({ substituidos: 1 });
    const cheio = await pedir(a, "POST", "/api/envio/documentos", { corpo: arquivo("C") });
    expect(cheio.status).toBe(422);
    expect((await json(cheio)).erro).toContain("cota de 2 documentos");
    expect((await a.env.DB.prepare("SELECT count(*) AS n FROM documentos WHERE dono = 'cliente-x'").first<{ n: number }>())!.n).toBe(2);
  });

  it("recusa arquivo ausente e arquivo maior que 15 MB", async () => {
    const a = await ambiente();
    expect((await pedir(a, "POST", "/api/envio/documentos", { corpo: new FormData() })).status).toBe(400);
    const grande = arquivo("G");
    grande.set("arquivo", new File([new Uint8Array(15 * 1024 * 1024 + 1)], "g.pdf"));
    expect((await json(await pedir(a, "POST", "/api/envio/documentos", { corpo: grande }))).erro).toContain("15 MB");
  });

  it("apaga só documento do próprio pacote; o de outra empresa responde como inexistente", async () => {
    const a = await ambiente();
    const proprio = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const alheio = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await a.env.DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, status, r2_key) VALUES (?, 'pacote', 'cliente-x', 'Meu', 'ok', 'k1'), (?, 'pacote', 'cliente-y', 'Alheio', 'ok', 'k2')").bind(proprio, alheio).run();
    expect((await pedir(a, "DELETE", `/api/envio/documentos/${alheio}`)).status).toBe(404);
    expect((await a.env.DB.prepare("SELECT count(*) AS n FROM documentos WHERE id = ?").bind(alheio).first<{ n: number }>())!.n).toBe(1);
    expect((await pedir(a, "DELETE", `/api/envio/documentos/${proprio}`)).status).toBe(200);
    expect((await a.env.DB.prepare("SELECT count(*) AS n FROM documentos WHERE id = ?").bind(proprio).first<{ n: number }>())!.n).toBe(0);
  });

  it("grava na auditoria quem enviou e apagou, sem o conteúdo", async () => {
    const a = await ambiente();
    const id = ((await json(await pedir(a, "POST", "/api/envio/documentos", { corpo: arquivo("Política A", 50) }))).id as string);
    await pedir(a, "DELETE", `/api/envio/documentos/${id}`);
    const linhas = (await a.env.DB.prepare("SELECT ator, acao, detalhe FROM auditoria ORDER BY id").all<{ ator: string; acao: string; detalhe: string }>()).results;
    expect(linhas).toEqual([
      { ator: "envio:Cliente X", acao: "envio.enviar", detalhe: "cliente-x: Política A" },
      { ator: "envio:Cliente X", acao: "envio.apagar", detalhe: "cliente-x: Política A" },
    ]);
  });
});

describe("chaves de envio no painel (admin)", () => {
  const adm = async (a: Amb, metodo: string, caminho: string, corpo?: unknown) => {
    const r = await admin(new Request(`https://know${caminho}`, { method: metodo, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } }), a.env as never, "adm@ness.com.br", caminho);
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown> & unknown[] };
  };

  it("cria a chave (token uma vez, só o hash no banco, validade padrão de 1 ano) e o token funciona no envio", async () => {
    const a = await ambiente();
    const r = await adm(a, "POST", "/api/chaves-envio", { nome: "Cliente Y", pacote: "cliente-y" });
    expect(r.status).toBe(200);
    const token = r.corpo.token as string;
    expect(token).toMatch(/^nessup_/);
    const linha = (await a.env.DB.prepare("SELECT token_hash, expira_em FROM chaves_envio WHERE nome = 'Cliente Y'").first<{ token_hash: string; expira_em: string }>())!;
    expect(linha.token_hash).toBe(await hashToken(token));
    expect(linha.token_hash).not.toContain("nessup");
    expect(Date.parse(`${linha.expira_em.replace(" ", "T")}Z`) - Date.now()).toBeGreaterThan(360 * 86_400_000);
    expect((await pedir(a, "GET", "/api/envio/documentos", { token })).status).toBe(200);
    const lista = (await adm(a, "GET", "/api/chaves-envio")).corpo as unknown as Record<string, unknown>[];
    expect(JSON.stringify(lista)).not.toContain("token");
  });

  it("recusa pacote inexistente (404) e pacote sem cota (400)", async () => {
    const a = await ambiente(null);
    expect((await adm(a, "POST", "/api/chaves-envio", { nome: "X", pacote: "nao-existe" })).status).toBe(404);
    const semCota = await adm(a, "POST", "/api/chaves-envio", { nome: "X", pacote: "cliente-x" });
    expect(semCota.status).toBe(400);
    expect(semCota.corpo.erro).toContain("cota");
  });

  it("revogar corta o envio na hora e grava quem revogou; a lista mostra a chave revogada", async () => {
    const a = await ambiente();
    expect((await adm(a, "DELETE", "/api/chaves-envio/11111111-1111-1111-1111-111111111111")).status).toBe(200);
    expect((await pedir(a, "GET", "/api/envio/documentos")).status).toBe(401);
    expect(await a.env.DB.prepare("SELECT ator, acao FROM auditoria WHERE acao = 'envio.chave.revogar'").first()).toMatchObject({ ator: "adm@ness.com.br" });
    expect((await adm(a, "DELETE", "/api/chaves-envio/99999999-9999-9999-9999-999999999999")).status).toBe(404);
  });

  it("excluir o pacote é recusado (409) enquanto houver chave de envio ativa", async () => {
    const a = await ambiente();
    const r = await adm(a, "DELETE", "/api/pacotes/cliente-x");
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ envios: [{ nome: "Cliente X" }] });
    await adm(a, "DELETE", "/api/chaves-envio/11111111-1111-1111-1111-111111111111");
    expect((await adm(a, "DELETE", "/api/pacotes/cliente-x")).status).toBe(200);
  });
});

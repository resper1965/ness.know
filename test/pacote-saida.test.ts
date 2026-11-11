import { describe, expect, it, vi } from "vitest";
import { admin } from "../src/admin";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

async function ambiente() {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('cliente-x', 'Cliente X'), ('comum', 'Comum')").run();
  await DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, r2_key) VALUES ('d1', 'pacote', 'cliente-x', 'Política A', 'pacote/cliente-x/d1/a.md'), ('d2', 'pacote', 'cliente-x', 'Política B', 'pacote/cliente-x/d2/b.md'), ('d3', 'pacote', 'comum', 'Lei', 'pacote/comum/d3/l.md')").run();
  for (const [id, doc, i] of [["d1", "d1", 0], ["d1", "d1", 1], ["d2", "d2", 0], ["d3", "d3", 0]] as const) await DB.prepare("INSERT INTO trechos_fts (documento_id, escopo, dono, texto) VALUES (?, 'pacote', ?, 'texto')").bind(doc, doc === "d3" ? "comum" : "cliente-x").run();
  return { DB, ARQUIVOS: { delete: vi.fn(async () => {}) }, VETORES: { deleteByIds: vi.fn(async () => ({})) }, AI: {} };
}
type Env = Awaited<ReturnType<typeof ambiente>>;
const chamar = async (env: Env, metodo: string, caminho: string, corpo?: unknown) => {
  const r = await admin(new Request(`https://know${caminho}`, { method: metodo, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } }), env as never, "adm@ness.com.br", caminho);
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
};
const n = async (env: Env, sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;

describe("excluir pacote", () => {
  it("apaga documentos, arquivos, trechos e vetores do pacote, e só dele", async () => {
    const env = await ambiente();
    const r = await chamar(env, "DELETE", "/api/pacotes/cliente-x");
    expect(r).toEqual({ status: 200, corpo: { ok: true, documentos: 2 } });
    expect(await n(env, "SELECT count(*) AS n FROM pacotes WHERE slug = 'cliente-x'")).toBe(0);
    expect(await n(env, "SELECT count(*) AS n FROM documentos WHERE dono = 'cliente-x'")).toBe(0);
    expect(await n(env, "SELECT count(*) AS n FROM trechos_fts WHERE dono = 'cliente-x'")).toBe(0);
    expect(env.ARQUIVOS.delete).toHaveBeenCalledTimes(2);
    expect(env.VETORES.deleteByIds).toHaveBeenCalled();
    expect(await n(env, "SELECT count(*) AS n FROM documentos WHERE dono = 'comum'")).toBe(1); // outro pacote intacto
    expect(await env.DB.prepare("SELECT ator, acao FROM auditoria").first()).toMatchObject({ ator: "adm@ness.com.br", acao: "pacote.excluir" });
  });

  it("recusa com 409 enquanto chave ativa, regra de acesso ou skill usam o pacote, e não apaga nada", async () => {
    const env = await ambiente();
    await env.DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('11111111-1111-1111-1111-111111111111', 'Cliente X', 'h', '[\"cliente-x\"]')").run();
    await env.DB.prepare("INSERT INTO acesso_regras (tipo, sujeito, pacotes) VALUES ('pessoa', 'ana@ness.com.br', '[\"cliente-x\"]')").run();
    await env.DB.prepare("INSERT INTO skills (nome, descricao, normas, corpo) VALUES ('s', 'd', '{\"cliente-x\":[]}', 'c')").run();
    const r = await chamar(env, "DELETE", "/api/pacotes/cliente-x");
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ chaves: [{ nome: "Cliente X" }], regras: [{ sujeito: "ana@ness.com.br" }], skills: [{ nome: "s" }] });
    expect(await n(env, "SELECT count(*) AS n FROM documentos WHERE dono = 'cliente-x'")).toBe(2);
    expect(env.ARQUIVOS.delete).not.toHaveBeenCalled();
  });

  it("chave revogada não bloqueia; pacote inexistente dá 404", async () => {
    const env = await ambiente();
    await env.DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, ativo) VALUES ('11111111-1111-1111-1111-111111111111', 'Velha', 'h', '[\"cliente-x\"]', 0)").run();
    expect((await chamar(env, "DELETE", "/api/pacotes/cliente-x")).status).toBe(200);
    expect((await chamar(env, "DELETE", "/api/pacotes/nao-existe")).status).toBe(404);
  });
});

describe("cota de documentos", () => {
  const enviar = (env: Env, titulo: string) => {
    const f = new FormData();
    f.set("arquivo", new Blob(["texto"]), "a.md");
    f.set("titulo", titulo);
    return admin(new Request("https://know/api/pacotes/cliente-x/documentos", { method: "POST", body: f }), env as never, "adm@ness.com.br", "/api/pacotes/cliente-x/documentos");
  };

  it("valida e grava a cota (null tira o limite); pacote inexistente dá 404", async () => {
    const env = await ambiente();
    for (const ruim of [0, -1, 1.5, "10", 100001]) expect((await chamar(env, "PUT", "/api/pacotes/cliente-x/cota", { cota_documentos: ruim })).status).toBe(400);
    expect((await chamar(env, "PUT", "/api/pacotes/cliente-x/cota", { cota_documentos: 2 })).status).toBe(200);
    expect((await env.DB.prepare("SELECT cota_documentos AS c FROM pacotes WHERE slug = 'cliente-x'").first<{ c: number }>())!.c).toBe(2);
    expect((await chamar(env, "PUT", "/api/pacotes/cliente-x/cota", { cota_documentos: null })).status).toBe(200);
    expect((await chamar(env, "PUT", "/api/pacotes/nao-existe/cota", { cota_documentos: 2 })).status).toBe(404);
    expect((await chamar(env, "GET", "/api/pacotes")).corpo).toBeDefined();
  });

  it("recusa um título novo acima da cota com 422; o título que já existe (substituição) passa pela cota", async () => {
    const env = await ambiente();
    await chamar(env, "PUT", "/api/pacotes/cliente-x/cota", { cota_documentos: 2 }); // já tem 2 documentos
    const r = await enviar(env, "Política C");
    expect(r.status).toBe(422);
    expect(((await r.json()) as { erro: string }).erro).toContain("cota de 2 documentos");
    // Recarregar "Política A" não conta de novo: a cota não o barra (o que vem depois depende do Workers AI, fora deste teste).
    const sub = await enviar(env, "Política A").catch(() => null);
    if (sub) expect(((await sub.json().catch(() => ({}))) as { erro?: string }).erro ?? "").not.toContain("cota");
  });
});

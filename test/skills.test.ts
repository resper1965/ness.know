import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import { hashToken, mcp } from "../src/mcp";
import { MAX_CORPO, normasExistem, validarSkill, visivel } from "../src/skills";
import { bancoTeste } from "./sqlite";

const migracao = (n: string) => readFileSync(`migrations/${n}.sql`, "utf8");

describe("validarSkill", () => {
  const ok = { nome: "consultando-normas", descricao: "Use ao responder sobre normas", corpo: "Passo 1.", normas: {} };
  it("aceita skill válida e normaliza o nome", () => {
    expect(validarSkill({ ...ok, nome: "Consultando-Normas" })).toMatchObject({ ok: true, v: { nome: "consultando-normas", versao: null, normas: {} } });
  });
  it("recusa nome inválido, descrição ou corpo vazios e corpo grande demais", () => {
    expect(validarSkill({ ...ok, nome: "a b" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, descricao: "" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, corpo: "" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, corpo: "x".repeat(MAX_CORPO + 1) })).toMatchObject({ ok: false });
  });
  it("normas: só objeto de listas de texto", () => {
    expect(validarSkill({ ...ok, normas: { iso: ["ISO 27001"] } })).toMatchObject({ ok: true, v: { normas: { iso: ["ISO 27001"] } } });
    expect(validarSkill({ ...ok, normas: [1] })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, normas: { iso: "ISO 27001" } })).toMatchObject({ ok: false });
  });
});

describe("visivel", () => {
  it("sem normas vale para toda chave", () => expect(visivel({}, { pacotes: [], documentos: {} })).toBe(true));
  it("exige todos os pacotes", () => {
    expect(visivel({ iso: [], cis: [] }, { pacotes: ["iso"], documentos: {} })).toBe(false);
    expect(visivel({ iso: [], cis: [] }, { pacotes: ["iso", "cis"], documentos: {} })).toBe(true);
  });
  it("chave restrita só vê a skill se tiver as normas pedidas; lista vazia só exige o pacote", () => {
    const c = { pacotes: ["iso"], documentos: { iso: ["ISO 27001"] } };
    expect(visivel({ iso: ["ISO 27001"] }, c)).toBe(true);
    expect(visivel({ iso: ["ISO 27001", "ISO 27017"] }, c)).toBe(false);
    expect(visivel({ iso: [] }, c)).toBe(true);
  });
});

describe("normasExistem", () => {
  it("confere pacote e título no banco", async () => {
    const DB = bancoTeste(migracao("0001_inicial"));
    await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('iso', 'ISO')").bind().run();
    await DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, status) VALUES ('d1', 'pacote', 'iso', 'ISO 27001', 'ok')").bind().run();
    expect(await normasExistem(DB, { iso: ["ISO 27001"] })).toBeNull();
    expect(await normasExistem(DB, { iso: [] })).toBeNull();
    expect(await normasExistem(DB, { cis: [] })).toContain("cis");
    expect(await normasExistem(DB, { iso: ["Outra"] })).toContain("Outra");
  });
});

describe("admin /api/skills", () => {
  const novo = () => {
    const DB = bancoTeste(migracao("0001_inicial"), migracao("0006_skills"));
    return { DB, env: { DB } as never };
  };
  const chamar = (env: never, metodo: string, caminho: string, corpo?: unknown) =>
    admin(new Request(`https://know${caminho}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } }), env, "a@ness.com.br", caminho);
  const skill = { nome: "consultando-normas", descricao: "Use ao responder sobre normas", normas: {}, corpo: "Passo 1." };

  it("grava, lista (sem o corpo) e substitui ao recarregar o mesmo nome", async () => {
    const { env } = novo();
    expect((await chamar(env, "POST", "/api/skills", skill)).status).toBe(200);
    expect((await chamar(env, "POST", "/api/skills", { ...skill, corpo: "Passo 1. Passo 2." })).status).toBe(200);
    const lista = (await (await chamar(env, "GET", "/api/skills")).json()) as { nome: string; tamanho: number; corpo?: string }[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nome: "consultando-normas", tamanho: 17 });
    expect(lista[0].corpo).toBeUndefined();
  });
  it("recusa skill inválida e norma que não existe", async () => {
    const { env } = novo();
    expect((await chamar(env, "POST", "/api/skills", { ...skill, corpo: "" })).status).toBe(400);
    const r = await chamar(env, "POST", "/api/skills", { ...skill, normas: { iso: [] } });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toContain("iso");
  });
  it("apaga; apagar de novo dá 404", async () => {
    const { env } = novo();
    await chamar(env, "POST", "/api/skills", skill);
    expect((await chamar(env, "DELETE", "/api/skills/consultando-normas")).status).toBe(200);
    expect((await chamar(env, "DELETE", "/api/skills/consultando-normas")).status).toBe(404);
  });
});

describe("mcp: skills", () => {
  const TOKEN = "nesskb_skill";
  async function ambiente(pacotes: string[], documentos: Record<string, string[]> = {}) {
    const DB = bancoTeste(migracao("0001_inicial"), migracao("0002_chave_documentos"), migracao("0005_uso_chaves"), migracao("0006_skills"), migracao("0007_chave_validade"));
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, documentos) VALUES ('c1', 'teste', ?, ?, ?)").bind(await hashToken(TOKEN), JSON.stringify(pacotes), JSON.stringify(documentos)).run();
    for (const slug of ["iso", "cis"]) await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES (?, ?)").bind(slug, slug).run();
    const sk = (nome: string, normas: object) => DB.prepare("INSERT INTO skills (nome, descricao, normas, corpo) VALUES (?, ?, ?, ?)").bind(nome, `desc ${nome}`, JSON.stringify(normas), `corpo ${nome}`).run();
    await sk("geral", {});
    await sk("so-iso", { iso: [] });
    await sk("iso-e-cis", { iso: [], cis: [] });
    return { DB, AI: {} as Ai };
  }
  const chamar = async (env: Awaited<ReturnType<typeof ambiente>>, nome: string, args: unknown) =>
    (await (await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: nome, arguments: args } }) }), env)).json()) as { result: { isError?: boolean; content: { text: string }[] } };

  it("listar_pacotes traz só as skills que a chave enxerga", async () => {
    const env = await ambiente(["iso"]);
    const r = JSON.parse((await chamar(env, "listar_pacotes", {})).result.content[0].text) as { skills: { nome: string }[] };
    expect(r.skills.map((s) => s.nome)).toEqual(["geral", "so-iso"]);
  });
  it("obter_skill devolve o corpo da skill liberada", async () => {
    const env = await ambiente(["iso"]);
    const r = await chamar(env, "obter_skill", { nome: "so-iso" });
    expect(r.result.isError).toBeUndefined();
    expect(JSON.parse(r.result.content[0].text)).toMatchObject({ nome: "so-iso", corpo: "corpo so-iso" });
  });
  it("skill não liberada e skill inexistente recebem a mesma resposta de erro", async () => {
    const env = await ambiente(["iso"]);
    const a = await chamar(env, "obter_skill", { nome: "iso-e-cis" });
    const b = await chamar(env, "obter_skill", { nome: "nao-existe" });
    expect(a.result.isError).toBe(true);
    expect(a.result.content[0].text.replace("iso-e-cis", "X")).toBe(b.result.content[0].text.replace("nao-existe", "X"));
  });
  it("sem o nome, pede o nome; o uso conta como obter_skill", async () => {
    const env = await ambiente(["iso"]);
    expect((await chamar(env, "obter_skill", {})).result.isError).toBe(true);
    await chamar(env, "obter_skill", { nome: "geral" });
    expect(await env.DB.prepare("SELECT chamadas FROM uso_chaves WHERE ferramenta = 'obter_skill'").first()).toEqual({ chamadas: 2 });
  });
});

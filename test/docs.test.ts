import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { envio, novoTokenEnvio } from "../src/envio";
import { hashToken, mcp } from "../src/mcp";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

// A documentação pública (public/docs.html, openapi.json, llms.txt) não pode ficar para trás da API: estes testes a conferem.
const ler = (p: string) => readFileSync(`public/${p}`, "utf8");
const openapi = JSON.parse(ler("openapi.json")) as { paths: Record<string, Record<string, unknown>> };
const docs = ler("docs.html");
const llms = ler("llms.txt");
const wrangler = readFileSync("wrangler.jsonc", "utf8");

const UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function ambienteEnvio() {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO pacotes (slug, nome, cota_documentos) VALUES ('cliente-x', 'Cliente X', 5)").run();
  const token = novoTokenEnvio();
  await DB.prepare("INSERT INTO chaves_envio (id, nome, token_hash, pacote, expira_em) VALUES ('11111111-1111-1111-1111-111111111111', 'Cliente X', ?, 'cliente-x', datetime('now', '+30 days'))").bind(await hashToken(token)).run();
  return { env: { DB, ARQUIVOS: { delete: vi.fn(async () => {}) }, VETORES: { deleteByIds: vi.fn(async () => ({})) }, AI: {} }, token };
}

describe("OpenAPI do envio", () => {
  it("descreve exatamente as 3 operações que a API tem", () => {
    const operacoes = Object.entries(openapi.paths).flatMap(([caminho, ms]) => Object.keys(ms).map((m) => `${m.toUpperCase()} ${caminho}`));
    expect(operacoes.sort()).toEqual(["DELETE /api/envio/documentos/{id}", "GET /api/envio/documentos", "POST /api/envio/documentos"]);
  });

  it("cada operação documentada existe na API (não cai no 'não encontrado' genérico)", async () => {
    const a = await ambienteEnvio();
    for (const [caminho, ms] of Object.entries(openapi.paths))
      for (const m of Object.keys(ms)) {
        const url = caminho.replace("{id}", UUID);
        const r = await envio(new Request(`https://know.ness.com.br${url}`, { method: m.toUpperCase(), headers: { authorization: `Bearer ${a.token}` } }), a.env as never, url);
        const corpo = (await r.json()) as { erro?: string };
        expect(corpo.erro, `${m.toUpperCase()} ${caminho}`).not.toBe("não encontrado");
      }
    // e uma operação não documentada continua sem existir
    const put = await envio(new Request("https://know.ness.com.br/api/envio/documentos", { method: "PUT", headers: { authorization: `Bearer ${a.token}` } }), a.env as never, "/api/envio/documentos");
    expect(((await put.json()) as { erro: string }).erro).toBe("não encontrado");
  });

  it("a chave de envio usa o prefixo documentado", () => {
    expect(novoTokenEnvio()).toMatch(/^nessup_/);
    expect(docs).toContain("nessup_");
    expect(llms).toContain("nessup_");
  });
});

describe("ferramentas e limites documentados", () => {
  it("as ferramentas do MCP aparecem na página e no llms.txt", async () => {
    const DB = bancoTeste(...migracoes());
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('22222222-2222-2222-2222-222222222222', 'k', ?, '[]')").bind(await hashToken("nesskb_x")).run();
    const r = await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: "Bearer nesskb_x" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), { DB, AI: {} } as never);
    const nomes = ((await r.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(nomes.length).toBeGreaterThanOrEqual(6);
    for (const n of nomes) {
      expect(docs, n).toContain(n);
      expect(llms, n).toContain(n);
    }
  });

  it("os limites escritos nas docs são os do wrangler.jsonc", () => {
    const limite = (nome: string) => Number(new RegExp(`"name": "${nome}"[^}]*"limit": (\\d+)`).exec(wrangler)?.[1]);
    expect(limite("LIMITE_MCP")).toBe(240);
    expect(limite("LIMITE_ENVIO")).toBe(30);
    for (const t of [docs, llms]) {
      expect(t).toContain("240");
      expect(t).toContain("30 ");
    }
    expect(docs).toContain("15 MB");
    expect(llms).toContain("15 MB");
  });
});

describe("o que é público não expõe o painel", () => {
  const proibidos = ["/api/chaves", "/api/acesso", "/api/pacotes", "/api/auditoria", "/oauth/", "ADMIN_EMAILS", "cloudflareaccess", "ACCESS_AUD", "d1_databases"];
  it.each([["docs.html", docs], ["llms.txt", llms], ["openapi.json", JSON.stringify(openapi)]])("%s", (_nome, texto) => {
    for (const p of proibidos) expect(texto, p).not.toContain(p);
  });
});

describe("a página de documentação", () => {
  it("os links internos apontam para arquivos e âncoras que existem", () => {
    for (const href of [...docs.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1])) {
      const arquivo = href === "/enviar" ? "enviar.html" : href.slice(1);
      expect(existsSync(`public/${arquivo}`), href).toBe(true);
    }
    for (const ancora of [...docs.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])) expect(docs, ancora).toContain(`id="${ancora}"`);
  });
  it("os links do llms.txt apontam para o que existe", () => {
    for (const caminho of [...llms.matchAll(/https:\/\/know\.ness\.com\.br(\/[a-z.]*)/g)].map((m) => m[1]).filter((c) => c !== "/mcp")) {
      const arquivo = caminho === "/enviar" ? "enviar.html" : caminho === "/docs" ? "docs.html" : caminho.slice(1);
      expect(existsSync(`public/${arquivo}`), caminho).toBe(true);
    }
  });
});

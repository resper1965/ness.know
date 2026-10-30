import { describe, expect, it } from "vitest";
import { hashToken, mcp, novoToken } from "../src/mcp";

const TOKEN = "nesskb_teste";

async function ambiente(pacotes = ["iso"], documentos: Record<string, string[]> = {}) {
  const hash = await hashToken(TOKEN);
  const consultas: { sql: string; binds: unknown[] }[] = [];
  const DB = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => {
        consultas.push({ sql, binds });
        return {
          first: async () => (sql.includes("FROM chaves") && binds[0] === hash ? { id: "c1", nome: "n.posture", pacotes: JSON.stringify(pacotes), documentos: JSON.stringify(documentos) } : null),
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({
            results: sql.includes("trechos_fts MATCH")
              ? [{ documento_id: "d1", escopo: "pacote", titulo: "ISO 27001", versao: "2022", vigencia: null, fonte: null, trecho: "A.8.16 Atividades de monitoramento", rank: -3 }]
              : sql.includes("FROM pacotes")
                ? [{ slug: "iso", nome: "Segurança e conformidade", descricao: null, versao: "2026-10", instrucoes: "Cite a cláusula." }]
                : sql.includes("FROM documentos")
                  ? [{ dono: "iso", titulo: "ISO 27001", versao: "2022" }, { dono: "iso", titulo: "NIST CSF", versao: "2.0" }]
                  : [],
          }),
        };
      },
    }),
  } as unknown as D1Database;
  return { env: { DB, AI: {} as Ai }, consultas };
}

const chamar = (env: Awaited<ReturnType<typeof ambiente>>["env"], corpo: unknown, token = TOKEN) =>
  mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(corpo) }), env);

describe("mcp", () => {
  it("sem token válido não entra; GET não é aceito; notificação devolve 202", async () => {
    const { env } = await ambiente();
    expect((await chamar(env, { jsonrpc: "2.0", id: 1, method: "ping" }, "errado")).status).toBe(401);
    expect((await mcp(new Request("https://x/mcp", { method: "POST", body: "{}" }), env)).status).toBe(401);
    expect((await mcp(new Request("https://x/mcp"), env)).status).toBe(405);
    expect((await chamar(env, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  });

  it("inicializa e lista as ferramentas", async () => {
    const { env } = await ambiente();
    const ini = (await (await chamar(env, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).json()) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(ini.result.protocolVersion).toBe("2025-03-26");
    expect(ini.result.serverInfo.name).toBe("ness.KNOW");
    const futura = (await (await chamar(env, { jsonrpc: "2.0", id: 9, method: "initialize", params: { protocolVersion: "2099-01-01" } })).json()) as { result: { protocolVersion: string } };
    expect(futura.result.protocolVersion).toBe("2025-06-18");
    const l = (await (await chamar(env, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as { result: { tools: { name: string }[] } };
    expect(l.result.tools.map((t) => t.name)).toEqual(["listar_pacotes", "buscar_conhecimento"]);
  });

  it("busca só nos pacotes liberados, mesmo se pedir outro", async () => {
    const { env, consultas } = await ambiente(["iso"]);
    const r = (await (
      await chamar(env, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "buscar_conhecimento", arguments: { consulta: "monitoramento", pacotes: ["iso", "segredo"], limite: 5.5 } } })
    ).json()) as { result: { content: { text: string }[] } };
    const { trechos } = JSON.parse(r.result.content[0].text) as { trechos: { ref: string; documento: string; versao: string; fonte: Record<string, string> }[] };
    expect(trechos[0]).toMatchObject({ documento: "ISO 27001", versao: "2022" });
    expect(trechos[0].ref).toMatch(/^know-[0-9a-f]{12}$/);
    expect(trechos[0].fonte).toMatchObject({ sistema: "ness.KNOW", consulta: "monitoramento", ref: trechos[0].ref });
    const fts = consultas.find((c) => c.sql.includes("trechos_fts MATCH"))!;
    expect(fts.binds).toContain("iso");
    expect(fts.binds).not.toContain("segredo");
    expect(fts.binds.at(-1)).toBe(20); // candidatos: inteiro, mesmo com limite fracionado
  });

  it("cliente sem pacote pedido não busca nada; lista pacotes com documentos", async () => {
    const { env, consultas } = await ambiente(["iso"]);
    const vazio = (await (await chamar(env, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "buscar_conhecimento", arguments: { consulta: "x y z w", pacotes: ["segredo"] } } })).json()) as {
      result: { content: { text: string }[] };
    };
    expect(JSON.parse(vazio.result.content[0].text)).toEqual({ trechos: [], aviso: "Nada encontrado nos pacotes liberados." });
    expect(consultas.some((c) => c.sql.includes("trechos_fts MATCH"))).toBe(false);
    const p = (await (await chamar(env, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "listar_pacotes" } })).json()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(p.result.content[0].text)).toEqual({
      pacotes: [{ slug: "iso", nome: "Segurança e conformidade", descricao: null, versao: "2026-10", instrucoes: "Cite a cláusula.", documentos: [{ titulo: "ISO 27001", versao: "2022" }, { titulo: "NIST CSF", versao: "2.0" }] }],
    });
  });

  it("token novo é longo, prefixado e o hash é estável", async () => {
    const t = novoToken();
    expect(t).toMatch(/^nesskb_[A-Za-z0-9_-]{43}$/);
    expect(await hashToken(t)).toBe(await hashToken(t));
    expect(await hashToken(t)).not.toBe(await hashToken(novoToken()));
  });

  it("chave restrita: busca e lista só as normas escolhidas", async () => {
    const { env, consultas } = await ambiente(["iso"], { iso: ["NIST CSF"] });
    await chamar(env, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "buscar_conhecimento", arguments: { consulta: "monitoramento" } } });
    const fts = consultas.find((c) => c.sql.includes("trechos_fts MATCH"))!;
    expect(fts.sql).toContain("d.titulo IN (?)");
    expect(fts.binds).toContain("NIST CSF");
    const p = (await (await chamar(env, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "listar_pacotes" } })).json()) as { result: { content: { text: string }[] } };
    const { pacotes } = JSON.parse(p.result.content[0].text) as { pacotes: { restrito?: boolean; documentos: { titulo: string }[] }[] };
    expect(pacotes[0].restrito).toBe(true);
    expect(pacotes[0].documentos.map((d) => d.titulo)).toEqual(["NIST CSF"]);
  });
});

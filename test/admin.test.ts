import { describe, expect, it } from "vitest";
import { admin, validarPacote } from "../src/admin";
import { hashToken } from "../src/mcp";
import worker from "../src/worker";

/** Banco simulado: guarda as chaves inseridas e responde às consultas que a API faz. */
function banco() {
  const chaves: { id: string; nome: string; token_hash: string; pacotes: string; documentos: string; ativo: number }[] = [];
  const DB = {
    prepare: (sql: string) => ({
      bind: (...b: unknown[]) => ({
        run: async () => {
          if (sql.startsWith("INSERT INTO chaves")) chaves.push({ id: b[0] as string, nome: b[1] as string, token_hash: b[2] as string, pacotes: b[3] as string, documentos: b[4] as string, ativo: 1 });
          if (sql.startsWith("UPDATE chaves SET ativo = 0")) {
            const c = chaves.find((x) => x.id === b[0]);
            if (c) c.ativo = 0;
            return { meta: { changes: c ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
        all: async () => ({
          results: sql.includes("SELECT slug FROM pacotes")
            ? (b as string[]).filter((s) => s !== "nao-existe").map((slug) => ({ slug }))
            : sql.includes("SELECT DISTINCT titulo")
              ? ["ISO 27001", "ISO 27017", "NIST CSF"].map((titulo) => ({ titulo }))
              : [],
        }),
      }),
    }),
  } as unknown as D1Database;
  return { DB, chaves };
}

const req = (metodo: string, corpo?: unknown) => new Request("https://know/api/x", { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } });

describe("admin", () => {
  it("valida pacote", () => {
    expect(validarPacote({ slug: "Seguranca-Conformidade", nome: "Segurança" })).toMatchObject({ ok: true, v: { slug: "seguranca-conformidade" } });
    expect(validarPacote({ slug: "a b", nome: "x" })).toMatchObject({ ok: false });
    expect(validarPacote({ slug: "ok-slug", nome: "" })).toMatchObject({ ok: false });
  });

  it("cria chave: token aparece uma vez, só o hash fica no banco; pacote inexistente é recusado", async () => {
    const { DB, chaves } = banco();
    const env = { DB } as never;
    const r = (await (await admin(req("POST", { nome: "faBRAINzio", pacotes: ["iso", "iso", "x y"] }), env, "a@b.c", "/api/chaves")).json()) as { id: string; token: string; pacotes: string[] };
    expect(r.token).toMatch(/^nesskb_/);
    expect(r.pacotes).toEqual(["iso"]);
    expect(chaves[0].token_hash).toBe(await hashToken(r.token));
    expect(JSON.stringify(chaves)).not.toContain(r.token);
    expect((await admin(req("POST", { nome: "x", pacotes: ["nao-existe"] }), env, "a@b.c", "/api/chaves")).status).toBe(404);
    expect((await admin(req("POST", { nome: "", pacotes: ["iso"] }), env, "a@b.c", "/api/chaves")).status).toBe(400);
  });

  it("chave restrita a algumas normas: guarda os títulos; todas as normas = pacote inteiro; título ou pacote estranho é recusado", async () => {
    const { DB, chaves } = banco();
    const env = { DB } as never;
    const criar = (documentos: unknown, pacotes = ["iso"]) => admin(req("POST", { nome: "n", pacotes, documentos }), env, "a@b.c", "/api/chaves");
    expect((await criar({ iso: ["ISO 27001", "NIST CSF", "ISO 27001"] })).status).toBe(200);
    expect(JSON.parse(chaves[0].documentos)).toEqual({ iso: ["ISO 27001", "NIST CSF"] });
    expect((await criar({ iso: ["ISO 27001", "ISO 27017", "NIST CSF"] })).status).toBe(200);
    expect(JSON.parse(chaves[1].documentos)).toEqual({});
    expect((await criar({ iso: ["Inventada"] })).status).toBe(400);
    expect((await criar({ outro: ["ISO 27001"] })).status).toBe(400);
    expect((await criar({ iso: [] })).status).toBe(400);
    expect(chaves).toHaveLength(2);
  });

  it("revoga chave; id desconhecido dá 404", async () => {
    const { DB, chaves } = banco();
    const env = { DB } as never;
    const { id } = (await (await admin(req("POST", { nome: "n", pacotes: ["iso"] }), env, "a@b.c", "/api/chaves")).json()) as { id: string };
    expect((await admin(req("DELETE"), env, "a@b.c", `/api/chaves/${id}`)).status).toBe(200);
    expect(chaves[0].ativo).toBe(0);
    expect((await admin(req("DELETE"), env, "a@b.c", `/api/chaves/${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("rotas", () => {
  const env = { ACCESS_TEAM: "t.cloudflareaccess.com", ACCESS_AUD: "aud", ADMIN_EMAILS: "a@b.c", ASSETS: { fetch: async () => new Response("pagina") } } as never;
  it("API sem token do Access dá 401; /health e a página respondem", async () => {
    expect((await worker.fetch(new Request("https://know/api/chaves"), env)).status).toBe(401);
    expect(await (await worker.fetch(new Request("https://know/health"), env)).text()).toBe("ok");
    expect(await (await worker.fetch(new Request("https://know/"), env)).text()).toBe("pagina");
  });
});

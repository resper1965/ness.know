import { describe, expect, it } from "vitest";
import { admin } from "../src/admin";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const ver = (DB: D1Database, metodo = "GET") => admin(new Request("https://know/api/fontes", { method: metodo }), { DB } as never, "adm@ness.com.br", "/api/fontes");

describe("GET /api/fontes (página Fontes do admin)", () => {
  it("lista todas as fontes do catálogo e as bases embutidas, com licença e estado", async () => {
    const DB = bancoTeste(...migracoes());
    const r = await ver(DB);
    expect(r.status).toBe(200);
    const fontes = (await r.json()) as { id: string; modo: string; licenca: string; fonte: string }[];
    const ids = fontes.map((f) => f.id);
    for (const id of ["kev", "feodo", "ransomware-live", "rfc", "mitre", "wazuh"]) expect(ids).toContain(id);
    expect(fontes.find((f) => f.id === "wazuh")).toMatchObject({ modo: "embutido", licenca: expect.stringContaining("GPLv2") });
    expect(fontes.every((f) => f.licenca && f.fonte)).toBe(true);
    const cat = (id: string) => (fontes.find((f) => f.id === id) as unknown as { categoria: string }).categoria;
    expect([cat("rfc"), cat("mitre"), cat("wazuh"), cat("learn")]).toEqual(["conhecimento", "conhecimento", "conhecimento", "conhecimento"]);
    expect([cat("kev"), cat("feodo"), cat("radar"), cat("metasploit")]).toEqual(["dado", "dado", "dado", "dado"]);
  });
  it("é só leitura: outros métodos não mudam nada e a rota não existe para POST", async () => {
    const DB = bancoTeste(...migracoes());
    const antes = (await DB.prepare("SELECT count(*) AS n FROM fontes").first<{ n: number }>())!.n;
    expect((await ver(DB, "POST")).status).toBe(404);
    expect((await DB.prepare("SELECT count(*) AS n FROM fontes").first<{ n: number }>())!.n).toBe(antes);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type EnvConhecimento, ingerir } from "../src/busca";
import { bancoTeste } from "./sqlite";

function ambiente(run: () => Promise<unknown>) {
  const DB = bancoTeste(readFileSync("migrations/0001_inicial.sql", "utf8"));
  const VETORES = { upsert: vi.fn(async () => ({ mutationId: "m" })), deleteByIds: vi.fn(async () => ({ mutationId: "m" })) };
  const env = { DB, AI: { run: vi.fn(run) }, ARQUIVOS: { put: vi.fn(async () => ({})), delete: vi.fn(async () => {}) }, VETORES } as unknown as EnvConhecimento;
  return { env, VETORES };
}
const arquivo = () => new File(["# Norma\n\n5.1 Escopo\nTexto da norma."], "norma.md", { type: "text/markdown" });
const alvo = { escopo: "pacote" as const, dono: "forense-digital" };

describe("ingerir", () => {
  it("grava documento, trechos e vetores, sem aviso", async () => {
    const { env, VETORES } = ambiente(async () => ({ data: [Array(1024).fill(0)] }));
    const r = await ingerir(env, alvo, { titulo: "Norma" }, arquivo(), "admin@ness.com.br");
    expect(r).toEqual({ id: r.id, trechos: 1 });
    expect(VETORES.upsert).toHaveBeenCalledOnce();
  });

  it("com o Workers AI fora, mantém o documento na busca textual e devolve o aviso (antes a carga dizia só ok)", async () => {
    const { env, VETORES } = ambiente(async () => {
      throw new Error("AI 429");
    });
    const r = await ingerir(env, alvo, { titulo: "Norma" }, arquivo(), "admin@ness.com.br");
    expect(r.trechos).toBe(1);
    expect(r.aviso).toContain("vetores não gravados (AI 429)");
    expect(VETORES.upsert).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT status FROM documentos WHERE id = ?").bind(r.id).first()).toEqual({ status: "ok" });
  });

  it("lote que falha no meio não deixa documento 'ok' pela metade: trechos e original saem", async () => {
    const { env } = ambiente(async () => ({ data: [] }));
    const batch = env.DB.batch.bind(env.DB);
    let n = 0;
    env.DB.batch = (async (s: D1PreparedStatement[]) => {
      if (++n === 2) throw new Error("D1 caiu");
      return batch(s);
    }) as typeof env.DB.batch;
    const longo = new File([Array.from({ length: 120 }, (_, i) => `${i}. ${"texto da norma ".repeat(80)}`).join("\n\n")], "longa.md", { type: "text/markdown" });
    await expect(ingerir(env, alvo, { titulo: "Longa" }, longo, "admin@ness.com.br")).rejects.toThrow("D1 caiu");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM documentos").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM trechos_fts").first()).toEqual({ n: 0 });
    expect(env.ARQUIVOS.delete).toHaveBeenCalledOnce();
  });
});

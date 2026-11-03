import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type EnvConhecimento, ingerir } from "../src/busca";
import { bancoTeste } from "./sqlite";

function ambiente(run: () => Promise<unknown>) {
  const DB = bancoTeste(readFileSync("migrations/0001_inicial.sql", "utf8"));
  const VETORES = { upsert: vi.fn(async () => ({ mutationId: "m" })), deleteByIds: vi.fn(async () => ({ mutationId: "m" })) };
  const env = { DB, AI: { run: vi.fn(run) }, ARQUIVOS: { put: vi.fn(async () => ({})) }, VETORES } as unknown as EnvConhecimento;
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
});

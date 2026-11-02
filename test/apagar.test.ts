import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { apagarDocumento, type EnvConhecimento } from "../src/busca";
import { bancoTeste } from "./sqlite";

const contagem = async (db: D1Database, sql: string) => ((await db.prepare(sql).first<{ n: number }>())?.n ?? 0);

function ambiente(deleteByIds: () => Promise<unknown>) {
  const DB = bancoTeste(
    readFileSync("migrations/0001_inicial.sql", "utf8"),
    "INSERT INTO documentos (id, escopo, dono, titulo, r2_key) VALUES ('d1', 'pacote', 'cp', 'Código Penal', 'pacote/cp/d1/cp.md')",
    "INSERT INTO trechos_fts (documento_id, escopo, dono, texto) VALUES ('d1', 'pacote', 'cp', 'Art. 154-A'), ('d1', 'pacote', 'cp', 'Art. 154-B')",
  );
  const ARQUIVOS = { delete: vi.fn(async () => {}) };
  const VETORES = { deleteByIds: vi.fn(deleteByIds) };
  return { env: { DB, ARQUIVOS, VETORES, AI: {} } as unknown as EnvConhecimento, ARQUIVOS, VETORES };
}

describe("apagarDocumento", () => {
  it("apaga vetores, trechos, documento e arquivo", async () => {
    const { env, ARQUIVOS, VETORES } = ambiente(async () => ({ mutationId: "m" }));
    expect(await apagarDocumento(env, "d1")).toBe(true);
    expect(VETORES.deleteByIds).toHaveBeenCalledWith(["d1:0", "d1:1"]);
    expect(await contagem(env.DB, "SELECT count(*) AS n FROM documentos")).toBe(0);
    expect(await contagem(env.DB, "SELECT count(*) AS n FROM trechos_fts")).toBe(0);
    expect(ARQUIVOS.delete).toHaveBeenCalledWith("pacote/cp/d1/cp.md");
  });

  it("com o Vectorize fora, falha e mantém o documento para tentar de novo (não deixa vetor órfão)", async () => {
    const { env, ARQUIVOS } = ambiente(async () => {
      throw new Error("Vectorize 503");
    });
    await expect(apagarDocumento(env, "d1")).rejects.toThrow("Vectorize 503");
    expect(await contagem(env.DB, "SELECT count(*) AS n FROM documentos")).toBe(1);
    expect(await contagem(env.DB, "SELECT count(*) AS n FROM trechos_fts")).toBe(2);
    expect(ARQUIVOS.delete).not.toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashToken } from "../src/mcp";
import { v1 } from "../src/v1";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const spec = JSON.parse(readFileSync("public/openapi-v1.json", "utf8")) as { paths: Record<string, Record<string, unknown>> };
const docs = readFileSync("public/docs.html", "utf8");
const llms = readFileSync("public/llms.txt", "utf8");

describe("OpenAPI do /v1", () => {
  it("descreve exatamente as 5 operações que a API tem", () => {
    const ops = Object.entries(spec.paths).flatMap(([c, ms]) => Object.keys(ms).map((m) => `${m.toUpperCase()} ${c}`));
    expect(ops.sort()).toEqual(["GET /v1/listas/{tipo}", "GET /v1/novidades", "GET /v1/saude", "POST /v1/cve", "POST /v1/ioc"]);
  });
  it("cada operação documentada existe na API (não cai no 'não encontrado'), e uma não documentada continua sem existir", async () => {
    const DB = bancoTeste(...migracoes());
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
    const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
      const r = await v1(new Request(`https://x${caminho}`, { method: metodo, headers: { authorization: "Bearer nesskb_os" }, body: corpo ? JSON.stringify(corpo) : undefined }), { DB, AI: {} as Ai }, caminho.split("?")[0]);
      return (await r.clone().json().catch(() => ({}))) as { erro?: string };
    };
    for (const [caminho, ms] of Object.entries(spec.paths))
      for (const m of Object.keys(ms)) {
        const c = caminho.replace("{tipo}", "ip");
        const corpo = m === "post" ? (c === "/v1/cve" ? { cves: ["CVE-2021-44228"] } : { valores: ["203.0.113.9"] }) : undefined;
        expect((await chamar(m.toUpperCase(), c, corpo)).erro, `${m} ${caminho}`).not.toBe("não encontrado");
      }
    expect((await chamar("DELETE", "/v1/saude")).erro).toBe("não encontrado");
  });
  it("a página e o llms.txt apontam para a especificação", () => {
    expect(docs).toContain("/openapi-v1.json");
    expect(llms).toContain("/openapi-v1.json");
  });
});

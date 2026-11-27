import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { MAX_HASHES_CIRCL } from "../src/fontes/circl";
import { hashToken } from "../src/mcp";
import { v1 } from "../src/v1";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T12:00:00.000Z");
const MD5 = "8ed4b4ed952526d89899e723f3488de4";
const SHA1 = "a".repeat(40);
const SHA256 = "b".repeat(64);
const CONHECIDO = { FileName: "kernel32.dll", FileSize: "2520", MD5: MD5.toUpperCase(), source: "NSRL", db: "nsrl_modern_rds", "hashlookup:trust": 50, ProductCode: { ProductName: "Cumulative Update KB4338817" } };

function rede(rotas: Record<string, () => Response>) {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", async function (this: unknown, url: string) {
    if (this !== undefined) throw new TypeError("Illegal invocation");
    chamadas.push(url);
    const k = Object.keys(rotas).find((x) => url === x);
    return k ? rotas[k]() : new Response("sem rota", { status: 404 });
  });
  return chamadas;
}
const ioc = async (DB: D1Database, valores: string[]) => {
  const r = await chamarFonte({ DB }, "ioc_consultar", { valores }, T);
  return JSON.parse(r!.content[0].text);
};
afterEach(() => vi.unstubAllGlobals());

describe("CIRCL hashlookup em ioc_consultar", () => {
  it("hash conhecido, desconhecido e com falha: cada um com o seu campo, sem derrubar os outros; segunda consulta vem do cache", async () => {
    const DB = bancoTeste(...migracoes());
    const c = rede({
      [`https://hashlookup.circl.lu/lookup/md5/${MD5}`]: () => Response.json(CONHECIDO),
      [`https://hashlookup.circl.lu/lookup/sha1/${SHA1}`]: () => new Response("não achei", { status: 404 }),
      [`https://hashlookup.circl.lu/lookup/sha256/${SHA256}`]: () => new Response("erro", { status: 500 }),
    });
    const j = await ioc(DB, [MD5, SHA1, SHA256, "203.0.113.9"]);
    const por = (v: string) => j.resultados.find((r: { valor: string }) => r.valor === v.toLowerCase());
    expect(por(MD5).hashlookup).toMatchObject({ conhecido: true, arquivo: "kernel32.dll", tamanho: 2520, origem: "NSRL", confianca: 50, produto: "Cumulative Update KB4338817" });
    expect(por(SHA1).hashlookup).toEqual({ conhecido: false });
    expect(por(SHA256).hashlookup).toMatchObject({ indisponivel: true });
    expect(por("203.0.113.9").hashlookup).toBeUndefined();
    expect(j.nota_hashlookup).toContain("não prova que o arquivo é seguro");
    expect(j.fontes.at(-1)).toMatchObject({ fonte: "CIRCL hashlookup (arquivos conhecidos)", frescor: "consulta ao vivo" });
    await ioc(DB, [MD5, SHA1]);
    expect(c.filter((u) => u.includes("/md5/") || u.includes("/sha1/"))).toHaveLength(2); // o cache valeu
  });
  it("no /v1/ioc (até 300 valores), só os primeiros 50 hashes distintos vão ao CIRCL; os outros avisam", async () => {
    const DB = bancoTeste(...migracoes());
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
    const c = rede({});
    const hashes = Array.from({ length: MAX_HASHES_CIRCL + 3 }, (_, i) => i.toString(16).padStart(40, "0"));
    const r = await v1(new Request("https://x/v1/ioc", { method: "POST", headers: { authorization: "Bearer nesskb_os" }, body: JSON.stringify({ valores: hashes }) }), { DB, AI: {} as Ai }, "/v1/ioc");
    const j = (await r.json()) as any;
    expect(c).toHaveLength(MAX_HASHES_CIRCL);
    expect(j.resultados.at(-1).hashlookup.aviso).toContain(`${MAX_HASHES_CIRCL} primeiros`);
  });
  it("sem hash na consulta, não chama o CIRCL", async () => {
    const DB = bancoTeste(...migracoes());
    const c = rede({});
    await ioc(DB, ["203.0.113.9", "exemplo.com"]);
    expect(c).toHaveLength(0);
  });
});

describe("CIRCL hashlookup em /v1/ioc", () => {
  it("mesmo campo e mesma nota", async () => {
    const DB = bancoTeste(...migracoes());
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
    rede({ [`https://hashlookup.circl.lu/lookup/md5/${MD5}`]: () => Response.json(CONHECIDO) });
    const r = await v1(new Request("https://x/v1/ioc", { method: "POST", headers: { authorization: "Bearer nesskb_os" }, body: JSON.stringify({ valores: [MD5] }) }), { DB, AI: {} as Ai }, "/v1/ioc");
    const j = (await r.json()) as any;
    expect(j.resultados[0].hashlookup.conhecido).toBe(true);
    expect(j.nota_hashlookup).toBeTruthy();
  });
});

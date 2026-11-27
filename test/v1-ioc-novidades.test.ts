import { describe, expect, it } from "vitest";
import { hashToken } from "../src/mcp";
import { MAX_IOC_LOTE, v1 } from "../src/v1";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T12:00:00.000Z");
const iso = (h: number) => new Date(T.getTime() + h * 3_600_000).toISOString();

async function ambiente() {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
  const kev = (cve: string, visto: string) => DB.prepare("INSERT INTO kev (cve, fornecedor, produto, nome, data_inclusao, primeiro_visto, ultimo_visto) VALUES (?, 'F', 'P', ?, '2026-11-26', ?, ?)").bind(cve, `Falha ${cve}`, visto, visto).run();
  await kev("CVE-2026-0001", iso(-5));
  await kev("CVE-2026-0002", iso(-1));
  await DB.prepare("INSERT INTO avisos (id, fonte, fornecedor, ref, titulo, url, primeiro_visto) VALUES ('msrc:2026-Nov', 'msrc', 'Microsoft', '2026-Nov', 'Nov Security Updates', 'https://msrc.microsoft.com/x', ?)").bind(iso(-1)).run();
  const ind = (valor: string, visto: string) =>
    DB.prepare("INSERT INTO indicadores (id, tipo, valor, fonte, primeiro_visto, ultimo_visto, expira_em) VALUES (?, 'ip', ?, 'feodo', ?, ?, ?)").bind(`feodo|ip|${valor}`, valor, visto, visto, iso(48)).run();
  await ind("203.0.113.9", iso(-1));
  await ind("203.0.113.10", iso(-10));
  await DB.prepare("INSERT INTO vitimas_ransomware (id, grupo, vitima, descoberta, primeiro_visto, ultimo_visto) VALUES ('v1', 'g', 'x', ?, ?, ?)").bind(iso(-1), iso(-1), iso(-1)).run();
  return { DB, AI: {} as Ai };
}
const pedir = (env: Awaited<ReturnType<typeof ambiente>>, caminho: string, init: RequestInit = {}, auth = true) =>
  v1(new Request(`https://x${caminho}`, { ...init, headers: { ...(auth ? { authorization: "Bearer nesskb_os" } : {}), "content-type": "application/json" } }), env, caminho.split("?")[0]);

describe("/v1/ioc", () => {
  it("consulta em lote: uma resposta por indicador, sem veredito, e exige chave", async () => {
    const env = await ambiente();
    const corpo = JSON.stringify({ valores: ["203.0.113.9", "198.51.100.1", "não é indicador"] });
    expect((await pedir(env, "/v1/ioc", { method: "POST", body: corpo }, false)).status).toBe(401);
    const r = await pedir(env, "/v1/ioc", { method: "POST", body: corpo });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { resultados: { valor: string; listado?: boolean; aviso?: string }[]; nota: string };
    expect(j.resultados).toHaveLength(3);
    expect(j.resultados[0]).toMatchObject({ valor: "203.0.113.9", listado: true });
    expect(j.resultados[1].aviso).toContain("não significa que seja seguro");
    expect(j.resultados[2].aviso).toContain("Formato não reconhecido");
    expect(j.nota).toContain("não traz veredito");
  });
  it("valida o corpo e o limite do lote", async () => {
    const env = await ambiente();
    expect((await pedir(env, "/v1/ioc", { method: "POST", body: "{}" })).status).toBe(400);
    expect((await pedir(env, "/v1/ioc", { method: "POST", body: JSON.stringify({ valores: Array(MAX_IOC_LOTE + 1).fill("203.0.113.9") }) })).status).toBe(400);
    expect((await pedir(env, "/v1/ioc", { method: "POST", body: JSON.stringify({ valores: Array(MAX_IOC_LOTE).fill("203.0.113.9") }) })).status).toBe(200);
  });
});

describe("/v1/novidades", () => {
  it("devolve só o que o ness.know viu depois do cursor e um cursor novo para a próxima leitura", async () => {
    const env = await ambiente();
    const j = (await (await pedir(env, `/v1/novidades?desde=${encodeURIComponent(iso(-3))}`)).json()) as any;
    expect(j.kev.map((k: { cve: string }) => k.cve)).toEqual(["CVE-2026-0002"]);
    expect(j.avisos).toHaveLength(1);
    expect(j.indicadores).toMatchObject({ novos: 1, por_fonte: { feodo: 1 } });
    expect(j.ransomware.novas_vitimas).toBe(1);
    expect(j.completo).toBe(true);
    expect(Date.parse(j.cursor)).toBeGreaterThan(Date.parse(iso(-1)));
    // Cursor no futuro e sem nada novo: lista vazia, sem erro.
    const vazio = (await (await pedir(env, `/v1/novidades?desde=${encodeURIComponent(new Date().toISOString())}`)).json()) as any;
    expect(vazio.kev).toEqual([]);
  });
  it("recusa data inválida ou no futuro", async () => {
    const env = await ambiente();
    expect((await pedir(env, "/v1/novidades?desde=ontem")).status).toBe(400);
    expect((await pedir(env, "/v1/novidades?desde=2999-01-01T00:00:00Z")).status).toBe(400);
  });
});

describe("/v1/saude", () => {
  it("lista as fontes e aponta as que pedem atenção (erro, pausada ou desatualizada)", async () => {
    const env = await ambiente();
    await env.DB.prepare("UPDATE fontes SET ultimo_erro = ?, erro_msg = 'feodo respondeu 500' WHERE id = 'feodo'").bind(iso(-1)).run();
    await env.DB.prepare("UPDATE fontes SET ativa = 0 WHERE id = 'urlhaus'").run();
    const j = (await (await pedir(env, "/v1/saude")).json()) as { ok: boolean; problemas: { id: string; motivo: string }[]; fontes: { id: string }[] };
    expect(j.ok).toBe(false);
    expect(j.problemas).toEqual(expect.arrayContaining([expect.objectContaining({ id: "feodo", motivo: "erro na última coleta" }), expect.objectContaining({ id: "urlhaus", motivo: "pausada" })]));
    expect(j.fontes.map((f) => f.id)).toContain("wazuh");
    expect((await pedir(env, "/v1/saude", {}, false)).status).toBe(401);
  });
});

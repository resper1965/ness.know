import { describe, expect, it } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { executarFontes } from "../src/fontes/motor";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T18:00:00.000Z");
const dias = (d: number, base = T) => new Date(base.getTime() + d * 86_400_000);
const URL_RECENT = "https://api-pro.ransomware.live/victims/recent";
const CHAVE = "chave-de-teste";

const v = (extra: Record<string, unknown>) => ({
  id: "id-x", discovered: "2026-11-26T16:20:17.846021+00:00", website: "www.exemplo.com", country: "US", activity: "Healthcare",
  description: "Descrição escrita pelo grupo com 237 GB de dados pessoais de funcionários.", post_url: "http://abcdefghijklmnop.onion/site/blog?uuid=1",
  permalink: "https://www.ransomware.live/id/abc", attackdate: "2026-11-26T00:00:00+00:00", victim: "Hospital Exemplo", group: "qilin", screenshot: "https://images.ransomware.live/x.png", ...extra,
});
const resposta = (victims: object[]) => ({ client: "alguem@exemplo.com", count: victims.length, order: "desc", victims });
const BASE = [
  v({ id: "a", victim: "Hospital Exemplo", group: "qilin", country: "BR", activity: "Healthcare", discovered: "2026-11-26T16:20:00+00:00" }),
  v({ id: "b", victim: "Banco Exemplo", group: "qilin", country: "BR", activity: "Financial Services", discovered: "2026-11-25T10:00:00+00:00", website: "" }),
  v({ id: "c", victim: "A**** S***", group: "akira", country: "", activity: "Not Found", discovered: "2026-11-20T10:00:00+00:00", website: "w**.a****.c**.u*" }),
  v({ id: "d", victim: "Escola Exemplo", group: "akira", country: "us", activity: "Education", discovered: "2026-10-01T10:00:00+00:00", permalink: "https://evil.example/id/d" }),
  v({ id: "a", victim: "Duplicada", group: "qilin" }), // mesmo id: a primeira vale
  v({ id: "ruim", victim: "", group: "qilin" }), // sem nome: descartada
];

/** fetch como o do Workers: recusa this definido. Guarda o cabeçalho enviado. */
function rede(corpo: unknown, status = 200) {
  const chamadas: { url: string; chave: string | null }[] = [];
  const buscar = (async function (this: unknown, url: string, init?: RequestInit) {
    if (this !== undefined) throw new TypeError("Illegal invocation");
    chamadas.push({ url, chave: new Headers(init?.headers).get("x-api-key") });
    return Response.json(corpo, { status });
  }) as typeof fetch;
  return { buscar, chamadas };
}
const um = async <U>(DB: D1Database, sql: string, ...b: unknown[]) => (await DB.prepare(sql).bind(...b).first<U>())!;
async function carregado(corpo: unknown = resposta(BASE)) {
  const DB = bancoTeste(...migracoes());
  await executarFontes({ DB, RANSOMWARE_LIVE_API_KEY: CHAVE }, { agora: T, buscar: rede(corpo).buscar, so: "ransomware-live" });
  return DB;
}
const ferr = async (DB: D1Database, args: Record<string, unknown>, agora = T) => {
  const r = await chamarFonte({ DB }, "ransomware_atividade", args, agora);
  return { erro: !!r?.isError, texto: r?.content[0].text ?? "", j: r && !r.isError ? JSON.parse(r.content[0].text) : null };
};

describe("coleta da Ransomware.live (API PRO)", () => {
  it("manda a chave só no cabeçalho X-API-KEY, guarda quem, onde e quando, e deixa de fora descrição, onion e screenshot", async () => {
    const DB = bancoTeste(...migracoes());
    const r = rede(resposta(BASE));
    await executarFontes({ DB, RANSOMWARE_LIVE_API_KEY: CHAVE }, { agora: T, buscar: r.buscar, so: "ransomware-live" });
    expect(r.chamadas).toEqual([{ url: URL_RECENT, chave: CHAVE }]);
    const linhas = (await DB.prepare("SELECT * FROM vitimas_ransomware ORDER BY id").all<Record<string, string | null>>()).results;
    expect(linhas.map((l) => l.id)).toEqual(["a", "b", "c", "d"]); // duplicada e sem nome ficaram de fora
    expect(linhas[0]).toMatchObject({ vitima: "Hospital Exemplo", grupo: "qilin", pais: "BR", setor: "Healthcare", dominio: "www.exemplo.com", descoberta: "2026-11-26T16:20:00.000Z", ataque: "2026-11-26T00:00:00.000Z", url: "https://www.ransomware.live/id/abc" });
    expect(linhas[1].dominio).toBeNull(); // vazio fica vazio
    expect(linhas[2]).toMatchObject({ vitima: "A**** S***", pais: null, setor: null, dominio: "w**.a****.c**.u*" }); // país e setor desconhecidos: vazios, não "Not Found"
    expect(linhas[3]).toMatchObject({ pais: "US", url: null }); // link de outro host não vira citação
    expect(JSON.stringify(linhas)).not.toMatch(/onion|screenshot|237 GB|alguem@exemplo/);
    expect(await um(DB, "SELECT itens, erro_msg FROM fontes WHERE id = 'ransomware-live'")).toEqual({ itens: 4, erro_msg: null });
  });

  it("sem a chave, resposta fora do formato ou erro da API: registra o erro e não toca no que já estava gravado", async () => {
    const DB = await carregado();
    const erroDe = async (env: object, corpo: unknown, status: number, agora: Date) => {
      await executarFontes({ DB, ...env }, { agora, buscar: rede(corpo, status).buscar, so: "ransomware-live" });
      return (await um<{ erro_msg: string }>(DB, "SELECT erro_msg FROM fontes WHERE id = 'ransomware-live'")).erro_msg;
    };
    expect(await erroDe({}, resposta(BASE), 200, dias(0.1))).toContain("RANSOMWARE_LIVE_API_KEY");
    expect(await erroDe({ RANSOMWARE_LIVE_API_KEY: CHAVE }, { message: "Invalid API key" }, 403, dias(0.2))).toContain("403");
    expect(await erroDe({ RANSOMWARE_LIVE_API_KEY: CHAVE }, { nada: true }, 200, dias(0.3))).toContain("fora do formato");
    expect(await erroDe({ RANSOMWARE_LIVE_API_KEY: CHAVE }, resposta([v({ victim: "", id: "" })]), 200, dias(0.4))).toContain("sem vítimas válidas");
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM vitimas_ransomware")).n).toBe(4);
  });

  it("nova coleta atualiza sem duplicar e guarda o primeiro_visto; histórico de 180 dias, depois apaga", async () => {
    const DB = await carregado();
    await executarFontes({ DB, RANSOMWARE_LIVE_API_KEY: CHAVE }, { agora: dias(0.1), buscar: rede(resposta(BASE)).buscar, so: "ransomware-live" });
    expect(await um(DB, "SELECT count(*) AS n, min(primeiro_visto) AS p, max(ultimo_visto) AS u FROM vitimas_ransomware")).toEqual({ n: 4, p: T.toISOString(), u: dias(0.1).toISOString() });
    const ids = async () => (await DB.prepare("SELECT id FROM vitimas_ransomware ORDER BY id").all<{ id: string }>()).results.map((x) => x.id);
    const purgar = (quando: string) => executarFontes({ DB }, { agora: new Date(quando), buscar: rede({}).buscar, so: "nenhuma" });
    await purgar("2027-03-01T00:00:00Z"); // corte em 02/09/2026: nada passou
    expect(await ids()).toEqual(["a", "b", "c", "d"]);
    await purgar("2027-04-01T00:00:00Z"); // corte em 02/10/2026: a vítima de 01/10 sai
    expect(await ids()).toEqual(["a", "b", "c"]);
    await purgar("2027-06-15T00:00:00Z"); // corte em 17/12/2026: as de novembro saem
    expect(await ids()).toEqual([]);
  });
});

describe("ransomware_atividade", () => {
  it("resumo por grupo, país e setor e lista das mais recentes, com atribuição e a nota de que são alegações", async () => {
    const DB = await carregado();
    const { j } = await ferr(DB, {});
    expect(j.total).toBe(3); // padrão: 30 dias; a de 01/10 fica fora
    expect(j.resumo.por_grupo).toEqual([{ nome: "qilin", n: 2 }, { nome: "akira", n: 1 }]);
    expect(j.resumo.por_pais).toEqual([{ nome: "BR", n: 2 }]); // país desconhecido não entra no resumo
    expect(j.vitimas.map((x: { vitima: string }) => x.vitima)).toEqual(["Hospital Exemplo", "Banco Exemplo", "A**** S***"]); // mais recentes primeiro
    expect(j.fontes[0]).toMatchObject({ fonte: "Ransomware.live (API PRO)", atribuicao: expect.stringContaining("Ransomware.live") });
    expect(j.nota).toContain("não são incidentes confirmados");
    expect(j.nota).toContain("uso interno da NESS");
  });
  it("filtros de grupo, setor, país e data; paginação; entrada inválida dá erro", async () => {
    const DB = await carregado();
    expect((await ferr(DB, { grupo: "AKI" })).j.total).toBe(1);
    expect((await ferr(DB, { setor: "financ" })).j.vitimas[0].vitima).toBe("Banco Exemplo");
    expect((await ferr(DB, { pais: "br" })).j.total).toBe(2);
    expect((await ferr(DB, { desde: "2026-09-01" })).j.total).toBe(4);
    expect((await ferr(DB, { desde: "2026-11-26" })).j.total).toBe(1);
    expect((await ferr(DB, { grupo: "%" })).j.total).toBe(0); // % vale literalmente
    expect((await ferr(DB, { pagina: 2 })).j).toMatchObject({ pagina: 2, vitimas: [] });
    expect((await ferr(DB, { pais: "BRA" })).erro).toBe(true);
    expect((await ferr(DB, { desde: "ontem" })).erro).toBe(true);
    const vazio = (await ferr(DB, { grupo: "nenhum" })).j;
    expect(vazio).toMatchObject({ total: 0, resumo: null });
    expect(vazio.aviso).toContain("Isso não significa que não haja");
  });
  it("fonte atrasada avisa; aparece em saude_fontes", async () => {
    const DB = await carregado();
    expect((await ferr(DB, {}, dias(1))).j.fontes[0].aviso).toContain("desatualizado");
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.find((f: { id: string }) => f.id === "ransomware-live")).toMatchObject({ exige_chave: true, ativa: true, itens: 4 });
  });
});

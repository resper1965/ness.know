import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { classificar } from "../src/fontes/ioc";
import { executarFontes } from "../src/fontes/motor";
import { hashToken } from "../src/mcp";
import { v1 } from "../src/v1";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-25T12:00:00.000Z");
const dias = (d: number, base = T) => new Date(base.getTime() + d * 86_400_000);
const horas = (h: number) => new Date(T.getTime() + h * 3_600_000);
const CHAVE = "chave-abusech-de-teste";
type Resp = unknown | ((url: string, init?: RequestInit) => Response);
function rede(rotas: Record<string, Resp>) {
  const chamadas: { url: string; auth: string | null; corpo: string }[] = [];
  // Como o fetch do Workers: se for chamado como método de outro objeto (this definido), dá "Illegal invocation".
  const buscar = (async function (this: unknown, url: string, init?: RequestInit) {
    if (this !== undefined) throw new TypeError("Illegal invocation: function called with incorrect `this` reference");
    chamadas.push({ url, auth: new Headers(init?.headers).get("auth-key"), corpo: String(init?.body ?? "") });
    const k = Object.keys(rotas).find((x) => url.startsWith(x));
    if (!k) return new Response("sem rota", { status: 404 });
    const r = rotas[k];
    if (typeof r === "function") return (r as (u: string, i?: RequestInit) => Response)(url, init);
    return typeof r === "string" ? new Response(r) : Response.json(r);
  }) as typeof fetch;
  return { buscar, chamadas };
}
const FEODO = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";
const TF = "https://threatfox-api.abuse.ch/api/v1/";
const UH = "https://urlhaus-api.abuse.ch/v1/urls/recent/";
const MB = "https://mb-api.abuse.ch/api/v1/";
const feodoJson = [{ ip_address: "162.243.103.246", port: 8080, status: "offline", as_number: 14061, first_seen: "2022-06-04 21:24:53", last_online: "2026-03-07", malware: "Emotet" }];
const threatfoxJson = {
  query_status: "ok",
  data: [
    { id: "1", ioc: "MidtownBrewing.NET", threat_type: "payload_delivery", ioc_type: "domain", malware_printable: "ClearFake", confidence_level: 90, first_seen: "2026-11-25 21:43:37 UTC", reference: null, tags: ["compromised", "etherhide"] },
    { id: "2", ioc: "203.0.113.7:443", threat_type: "botnet_cc", ioc_type: "ip:port", malware_printable: "Emotet", confidence_level: 75, first_seen: "2026-11-25 20:00:00 UTC", reference: "https://example.org/relatorio", tags: null },
    { id: "3", ioc: "http://evil.example/p.exe", threat_type: "payload_delivery", ioc_type: "url", malware_printable: "Unknown malware", confidence_level: 50, first_seen: "2026-11-25 19:00:00 UTC", tags: ["exe"] },
    { id: "4", ioc: "FB2F617A3E25F5541545579CAB16D7A933E522FC346D16C45E6F748101C5A525", threat_type: "payload", ioc_type: "sha256_hash", malware_printable: "Snoopy", confidence_level: 100, first_seen: "2026-11-25 18:00:00 UTC" },
    { id: "5", ioc: "AAAA", ioc_type: "sha3_384_hash", malware_printable: "x" },
    { id: "6", ioc: "evil.example\nalerta", ioc_type: "domain", malware_printable: "x" },
  ],
};
const urlhausJson = { query_status: "ok", urls: [{ id: 9, urlhaus_reference: "https://urlhaus.abuse.ch/url/9/", url: "http://203.0.113.7:54394/i", url_status: "online", host: "203.0.113.7", date_added: "2026-11-25 21:47:06 UTC", threat: "malware_download", tags: null }] };
const mbJson = { query_status: "ok", data: [{ sha256_hash: "c443cfdfb9f378164e9ba0a739115c2e15f78d0ee02396f494516e769a616fbb", md5_hash: "7c81efb04a0c3fe20141b52d9f759648", first_seen: "2026-11-25 21:35:38", signature: null, file_type: "macho", tags: ["EasyShell", "RAT"] }] };
const todas = { [FEODO]: feodoJson, [TF]: threatfoxJson, [UH]: urlhausJson, [MB]: mbJson };

const um = async <U>(DB: D1Database, sql: string, ...b: unknown[]) => (await DB.prepare(sql).bind(...b).first<U>())!;
const linhas = async <U>(DB: D1Database, sql: string, ...b: unknown[]) => (await DB.prepare(sql).bind(...b).all<U>()).results;
/** Banco com as migrações aplicadas. A 0018 deixa as três fontes do abuse.ch ativas (uso interno autorizado por escrito); o UPDATE garante o estado nos testes de coleta. */
async function comAbuseCh() {
  const DB = bancoTeste(...migracoes());
  await DB.prepare("UPDATE fontes SET ativa = 1 WHERE id IN ('threatfox', 'urlhaus', 'malwarebazaar')").run();
  return DB;
}
async function carregado() {
  const DB = await comAbuseCh();
  await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: T, buscar: rede(todas).buscar });
  return DB;
}
const ferr = async (DB: D1Database, nome: string, args: Record<string, unknown>, agora = horas(1)) => {
  const r = await chamarFonte({ DB }, nome, args, agora);
  return { erro: !!r?.isError, texto: r?.content[0].text ?? "", j: r && !r.isError ? JSON.parse(r.content[0].text) : null };
};

afterEach(() => vi.unstubAllGlobals());

describe("coleta dos indicadores", () => {
  it("normaliza os quatro formatos: tipo, valor, família, confiança desconhecida vazia, validade e referência", async () => {
    const DB = await carregado();
    const get = (fonte: string, valor: string) => um<Record<string, any>>(DB, "SELECT * FROM indicadores WHERE fonte = ? AND valor = ?", fonte, valor);
    expect(await get("feodo", "162.243.103.246")).toMatchObject({ tipo: "ip", familia: "Emotet", ameaca: "botnet_c2", confianca: null, data_fonte: "2022-06-04T21:24:53.000Z", expira_em: dias(3).toISOString(), expirado: 0 });
    expect(await get("threatfox", "midtownbrewing.net")).toMatchObject({ tipo: "dominio", familia: "ClearFake", confianca: 90, ameaca: "payload_delivery", data_fonte: "2026-11-25T21:43:37.000Z", expira_em: dias(7).toISOString() });
    expect(JSON.parse((await get("threatfox", "midtownbrewing.net")).tags)).toEqual(["compromised", "etherhide"]);
    expect(await get("threatfox", "203.0.113.7")).toMatchObject({ tipo: "ip", referencia: "https://example.org/relatorio" }); // porta tirada
    expect(await get("threatfox", "http://evil.example/p.exe")).toMatchObject({ tipo: "url", host: "evil.example", familia: "Unknown malware" });
    expect(await get("threatfox", "fb2f617a3e25f5541545579cab16d7a933e522fc346d16c45e6f748101c5a525")).toMatchObject({ tipo: "hash" }); // minúsculo
    expect(await get("urlhaus", "http://203.0.113.7:54394/i")).toMatchObject({ tipo: "url", host: "203.0.113.7", ameaca: "malware_download", familia: null, confianca: null });
    expect((await linhas(DB, "SELECT valor FROM indicadores WHERE fonte = 'malwarebazaar' ORDER BY valor")).map((x: any) => x.valor)).toEqual(["7c81efb04a0c3fe20141b52d9f759648", "c443cfdfb9f378164e9ba0a739115c2e15f78d0ee02396f494516e769a616fbb"]);
    // tipo de hash sem suporte e valor com quebra de linha são descartados
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE fonte = 'threatfox'")).n).toBe(4);
    expect((await um<{ itens: number; ultimo_sucesso: string }>(DB, "SELECT itens, ultimo_sucesso FROM fontes WHERE id = 'threatfox'")).itens).toBe(4);
  });

  it("manda a Auth-Key só no cabeçalho; sem a chave, o abuse.ch registra o erro e o Feodo segue", async () => {
    const DB = await comAbuseCh();
    const r = rede(todas);
    await executarFontes({ DB }, { agora: T, buscar: r.buscar });
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE fonte = 'feodo'")).n).toBe(1);
    expect((await um<{ erro_msg: string }>(DB, "SELECT erro_msg FROM fontes WHERE id = 'threatfox'")).erro_msg).toContain("ABUSECH_AUTH_KEY");
    expect(r.chamadas.filter((c) => c.url.startsWith(TF))).toHaveLength(0); // nem chamou
    const com = rede(todas);
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: horas(2), buscar: com.buscar });
    expect(com.chamadas.filter((c) => /threatfox|urlhaus|mb-api/.test(c.url)).every((c) => c.auth === CHAVE)).toBe(true);
    expect(com.chamadas.find((c) => c.url.startsWith(TF))!.corpo).toBe('{"query":"get_iocs","days":1}');
    expect(com.chamadas.find((c) => c.url.startsWith(MB))!.corpo).toBe("query=get_recent&selector=time");
    expect(com.chamadas.find((c) => c.url.startsWith(FEODO))!.auth).toBeNull(); // o Feodo não usa chave
  });

  it("resposta fora do formato não toca no que já estava gravado", async () => {
    const DB = await carregado();
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: horas(2), buscar: rede({ ...todas, [TF]: { query_status: "illegal_search_term" } }).buscar });
    expect((await um<{ erro_msg: string }>(DB, "SELECT erro_msg FROM fontes WHERE id = 'threatfox'")).erro_msg).toContain("illegal_search_term");
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE fonte = 'threatfox' AND expirado = 0")).n).toBe(4);
  });

  it("expiração: sem aparecer de novo, o indicador expira no prazo da fonte, continua 90 dias marcado e só então some; feodo sem mudança (304) renova o prazo", async () => {
    const DB = await carregado();
    const vivos = () => um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE expirado = 0").then((x) => x.n);
    expect(await vivos()).toBe(8);
    // 304 do Feodo: continua listado e o prazo anda; o resto não é renovado (feeds recentes que não trazem mais os itens)
    const vazios = { [TF]: { query_status: "no_result" }, [UH]: { query_status: "no_results", urls: [] }, [MB]: { query_status: "no_results" }, [FEODO]: () => new Response(null, { status: 304 }) };
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(6), buscar: rede(vazios).buscar });
    expect(await vivos()).toBe(8);
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(8), buscar: rede(vazios).buscar });
    expect(await vivos()).toBe(1); // só o do Feodo, renovado no dia 6 (vale até o dia 9)
    expect(await um<{ expirado: number }>(DB, "SELECT expirado FROM indicadores WHERE valor = 'midtownbrewing.net'")).toEqual({ expirado: 1 });
    // expirado fica no banco até 90 dias depois do prazo
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(7 + 89), buscar: rede(vazios).buscar });
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE valor = 'midtownbrewing.net'")).n).toBe(1);
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(7 + 91), buscar: rede(vazios).buscar });
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE valor = 'midtownbrewing.net'")).n).toBe(0);
  });

  it("indicador que volta a aparecer deixa de estar expirado e guarda o primeiro_visto", async () => {
    const DB = await carregado();
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(8), buscar: rede({ ...todas, [TF]: { query_status: "no_result" } }).buscar, so: "nenhuma" }); // só purga
    expect((await um<{ expirado: number }>(DB, "SELECT expirado FROM indicadores WHERE valor = 'midtownbrewing.net'")).expirado).toBe(1);
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(8), buscar: rede(todas).buscar, so: "threatfox" });
    expect(await um(DB, "SELECT expirado, primeiro_visto, ultimo_visto FROM indicadores WHERE valor = 'midtownbrewing.net'")).toEqual({ expirado: 0, primeiro_visto: T.toISOString(), ultimo_visto: dias(8).toISOString() });
  });
});

describe("fonte pausada (licença)", () => {
  it("a coleta pula a fonte, o selo diz que está pausada e os dados dela somem de consulta, novidades e exportação (voltam ao retomar)", async () => {
    const DB = await carregado();
    await DB.prepare("UPDATE fontes SET ativa = 0 WHERE id IN ('threatfox', 'urlhaus', 'malwarebazaar')").run();
    const r = rede(todas);
    await executarFontes({ DB, ABUSECH_AUTH_KEY: CHAVE }, { agora: dias(1), buscar: r.buscar });
    expect(r.chamadas.filter((c) => /threatfox|urlhaus|mb-api/.test(c.url))).toHaveLength(0); // nem chamou
    const j = (await ferr(DB, "ioc_consultar", { valores: ["203.0.113.7", "midtownbrewing.net"] }, dias(1))).j;
    expect(j.resultados[0]).toMatchObject({ valor: "203.0.113.7", registros: [], listado: false });
    expect(j.resultados[0].urls_no_host).toBeUndefined();
    expect(j.resultados[1].registros).toEqual([]);
    const pausada = j.fontes.find((f: { fonte: string }) => f.fonte === "ThreatFox (abuse.ch)");
    expect(pausada).toMatchObject({ frescor: "pausada" });
    expect(pausada.aviso).toContain("pausada");
    expect(j.fontes.find((f: { fonte: string }) => f.fonte === "Feodo Tracker (abuse.ch)").aviso).toBeUndefined();
    expect((await ferr(DB, "ioc_novidades", {}, dias(1))).j.total).toBe(1); // só o Feodo
    expect((await ferr(DB, "exportar_lista", { tipo: "url" }, dias(1))).j.total).toBe(0);
    expect((await ferr(DB, "exportar_lista", { tipo: "ip" }, dias(1))).j.conteudo).toBe("162.243.103.246");
    // retomar traz de volta o que ainda está na validade
    await DB.prepare("UPDATE fontes SET ativa = 1 WHERE id = 'threatfox'").run();
    expect((await ferr(DB, "ioc_consultar", { valores: ["midtownbrewing.net"] }, horas(2))).j.resultados[0].registros).toHaveLength(1);
  });

  it("as migrações levam as três do abuse.ch ao estado autorizado (ativas, com a licença citando a autorização) e o Feodo fica CC0", async () => {
    const DB = bancoTeste(...migracoes());
    const f = (id: string) => DB.prepare("SELECT ativa, licenca, termos_url FROM fontes WHERE id = ?").bind(id).first<{ ativa: number; licenca: string; termos_url: string }>();
    for (const id of ["threatfox", "urlhaus", "malwarebazaar"]) expect(await f(id)).toMatchObject({ ativa: 1, termos_url: "https://abuse.ch/terms-of-use/" });
    expect((await f("threatfox"))!.licenca).toContain("autorizado por escrito pelo abuse.ch");
    expect((await f("threatfox"))!.licenca).toContain("sem treino de IA");
    expect(await f("feodo")).toMatchObject({ ativa: 1 });
    expect((await f("feodo"))!.licenca).toContain("CC0");
  });
});

describe("classificar", () => {
  it("reconhece tipo, desfaz ofuscação, tira a porta e manda CVE para a outra ferramenta", () => {
    expect(classificar("203.0.113.7:443")).toEqual({ tipo: "ip", valor: "203.0.113.7" });
    expect(classificar("Evil[.]Example[.]com")).toEqual({ tipo: "dominio", valor: "evil.example.com" });
    expect(classificar("hxxp://evil[.]example/p.exe")).toEqual({ tipo: "url", valor: "http://evil.example/p.exe" });
    expect(classificar("7C81EFB04A0C3FE20141B52D9F759648")).toEqual({ tipo: "hash", valor: "7c81efb04a0c3fe20141b52d9f759648" });
    expect(classificar("cve-2024-3400")).toEqual({ tipo: "cve", valor: "CVE-2024-3400" });
    expect(classificar("999.1.1.1").tipo).toBeNull();
    expect(classificar("não é nada").tipo).toBeNull();
  });
});

describe("ioc_consultar", () => {
  it("mostra o que cada fonte lista, sem veredito, com URLs do host e o frescor de todas as fontes", async () => {
    const DB = await carregado();
    const { j } = await ferr(DB, "ioc_consultar", { valores: ["203.0.113.7", "hxxp://evil[.]example/p.exe", "desconhecido.example", "CVE-2024-3400", "???"] });
    const [ip, url, nada, cve, lixo] = j.resultados;
    expect(ip).toMatchObject({ valor: "203.0.113.7", tipo: "ip", listado: true });
    expect(ip.registros[0]).toMatchObject({ fonte: "threatfox", familia: "Emotet", confianca: 75, referencia: "https://example.org/relatorio", expirado: false });
    expect(ip.urls_no_host[0]).toMatchObject({ url: "http://203.0.113.7:54394/i", fonte: "urlhaus" });
    expect(url).toMatchObject({ tipo: "url", listado: true });
    expect(nada).toMatchObject({ tipo: "dominio", registros: [] });
    expect(nada.aviso).toContain("não significa que seja seguro");
    expect(cve.aviso).toContain("cve_consultar");
    expect(lixo.tipo).toBeNull();
    expect(j.resultados.every((r: any) => !("veredito" in r))).toBe(true);
    // a família Emotet também está no ATT&CK: liga ao software, sem afirmar mais que o nome
    expect(ip.mitre).toEqual([expect.objectContaining({ familia: "Emotet", id: "S0367", nome: "Emotet" })]);
    expect(url.mitre).toBeUndefined(); // "Unknown malware" não é software do ATT&CK
    expect(j.fontes.map((f: { fonte: string }) => f.fonte)).toEqual(["Feodo Tracker (abuse.ch)", "ThreatFox (abuse.ch)", "URLhaus (abuse.ch)", "MalwareBazaar (abuse.ch)", "DROP (Spamhaus)"]);
    expect(j.nota).toContain("não traz veredito");
  });

  it("fontes que divergem: mostra a divergência; expirado aparece marcado; fonte atrasada avisa", async () => {
    const DB = await carregado();
    await DB.prepare("INSERT INTO indicadores (id, tipo, valor, fonte, familia, confianca, tags, primeiro_visto, ultimo_visto, expira_em) VALUES ('feodo|ip|203.0.113.7','ip','203.0.113.7','feodo','Dridex',10,'[]',?,?,?)").bind(T.toISOString(), T.toISOString(), dias(3).toISOString()).run();
    const div = (await ferr(DB, "ioc_consultar", { valores: ["203.0.113.7"] })).j.resultados[0];
    expect(div.registros).toHaveLength(2);
    expect(div.divergencia).toContain("famílias diferentes");
    expect(div.divergencia).toContain("confiança de 10 a 75");
    expect(div.divergencia).toContain("sem escolher uma");
    const tarde = (await ferr(DB, "ioc_consultar", { valores: ["203.0.113.7"] }, dias(9))).j;
    expect(tarde.resultados[0].registros.every((r: { expirado: boolean }) => r.expirado)).toBe(true);
    expect(tarde.resultados[0].listado).toBe(false);
    expect(tarde.fontes.some((f: { aviso?: string }) => f.aviso?.includes("desatualizado"))).toBe(true);
  });

  it("valida a entrada: sem valores dá erro e o limite de 50 é avisado", async () => {
    const DB = await carregado();
    expect((await ferr(DB, "ioc_consultar", { valores: [] })).erro).toBe(true);
    const muitos = Array.from({ length: 60 }, (_, i) => `10.0.0.${i}`);
    const j = (await ferr(DB, "ioc_consultar", { valores: muitos })).j;
    expect(j.resultados).toHaveLength(50);
    expect(j.aviso_limite).toContain("50");
  });
});

describe("ioc_novidades", () => {
  it("lista o que entrou desde a data, com filtros de tipo e família e total", async () => {
    const DB = await carregado();
    expect((await ferr(DB, "ioc_novidades", {})).j.total).toBe(8);
    expect((await ferr(DB, "ioc_novidades", { tipo: "hash" })).j.total).toBe(3);
    const emotet = (await ferr(DB, "ioc_novidades", { familia: "emotet" })).j;
    expect(emotet.indicadores.map((i: { valor: string }) => i.valor).sort()).toEqual(["162.243.103.246", "203.0.113.7"]);
    expect((await ferr(DB, "ioc_novidades", { desde: "2026-11-26" }, horas(30))).j.total).toBe(0);
    expect((await ferr(DB, "ioc_novidades", { tipo: "cve" })).erro).toBe(true);
    expect((await ferr(DB, "ioc_novidades", { desde: "ontem" })).erro).toBe(true);
  });
});

describe("exportar_lista", () => {
  it("texto, csv e cdb; expirado fica de fora; confiança mínima exclui quem não informa; csv protege contra fórmula", async () => {
    const DB = await carregado();
    const ips = (await ferr(DB, "exportar_lista", { tipo: "ip" })).j;
    expect(ips).toMatchObject({ formato: "texto", total: 2, retornadas: 2 });
    expect(ips.conteudo.split("\n").sort()).toEqual(["162.243.103.246", "203.0.113.7"]);
    expect(ips.aviso_aplicacao).toContain("não bloqueia nada");
    const conf = (await ferr(DB, "exportar_lista", { tipo: "ip", confianca_min: 50 })).j;
    expect(conf.conteudo).toBe("203.0.113.7"); // o do Feodo não informa confiança: fica de fora
    const cdb = (await ferr(DB, "exportar_lista", { tipo: "ip", formato: "cdb", fonte: "threatfox" })).j;
    expect(cdb.conteudo).toBe("203.0.113.7:Emotet");
    await DB.prepare("INSERT INTO indicadores (id, tipo, valor, fonte, familia, tags, primeiro_visto, ultimo_visto, expira_em) VALUES ('feodo|ip|2001:db8::1','ip','2001:db8::1','feodo','=cmd','[]',?,?,?)").bind(T.toISOString(), T.toISOString(), dias(3).toISOString()).run();
    const v6 = (await ferr(DB, "exportar_lista", { tipo: "ip", formato: "cdb" })).j;
    expect(v6).toMatchObject({ omitidos: 1, retornadas: 2 });
    const csv = (await ferr(DB, "exportar_lista", { tipo: "ip", formato: "csv", fonte: "feodo" })).j.conteudo.split("\n");
    expect(csv[0]).toBe("valor,tipo,fonte,familia,confianca,ultimo_visto,expira_em");
    expect(csv.some((l: string) => l.includes(`"'=cmd"`))).toBe(true);
    expect((await ferr(DB, "exportar_lista", { tipo: "url", formato: "cdb" })).erro).toBe(true);
    expect((await ferr(DB, "exportar_lista", { tipo: "cve" })).erro).toBe(true);
    expect((await ferr(DB, "exportar_lista", { tipo: "ip", confianca_min: 500 })).erro).toBe(true);
    expect((await ferr(DB, "exportar_lista", { tipo: "ip", limite: 1 })).j).toMatchObject({ retornadas: 1, total: 3 });
    expect((await ferr(DB, "exportar_lista", { tipo: "ip", limite: 1 })).j.aviso_truncada).toContain("/v1/listas");
  });

  it("GET /v1/listas/{tipo}: exige chave, devolve a lista inteira com cabeçalhos de fonte e recusa tipo inválido", async () => {
    const DB = await carregado();
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
    const env = { DB, AI: {} as Ai };
    const pedir = (tipo: string, q = "", auth = true) => v1(new Request(`https://x/v1/listas/${tipo}${q}`, { headers: auth ? { authorization: "Bearer nesskb_os" } : {} }), env, `/v1/listas/${tipo}`);
    expect((await pedir("ip", "", false)).status).toBe(401);
    const r = await pedir("hash", "?formato=csv");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("x-total")).toBe("3");
    expect(r.headers.get("x-aviso")).toContain("nao bloqueia");
    expect((await r.text()).trim().split("\n")).toHaveLength(4); // cabeçalho + 3
    expect((await pedir("ip")).headers.get("content-type")).toContain("text/plain");
    expect((await pedir("cve")).status).toBe(400);
    expect((await pedir("ip", "?fonte=outra")).status).toBe(400);
  });
});

const DROP4 = "https://www.spamhaus.org/drop/drop_v4.json";
const DROP6 = "https://www.spamhaus.org/drop/drop_v6.json";
const redes4 = Array.from({ length: 120 }, (_, i) => ({ cidr: `${100 + (i % 100)}.${Math.floor(i / 100)}.0.0/16`, sblid: `SBL${1000 + i}`, rir: "ripencc" }));
redes4.push({ cidr: "203.0.113.0/24", sblid: "SBL999", rir: "apnic" }, { cidr: "198.51.0.0/16", sblid: "SBL998", rir: "arin" });
const redes6 = [{ cidr: "2001:db8:abcd::/48", sblid: "SBL777", rir: "ripencc" }];
const ndjson = (xs: object[], records = xs.length) => [...xs.map((x) => JSON.stringify(x)), JSON.stringify({ type: "metadata", timestamp: 1, size: 1, records, copyright: "(c) Spamhaus", terms: "https://www.spamhaus.org/drop/terms/" })].join("\n");
const dropRota = (v4 = redes4, v6 = redes6) => ({ [DROP4]: ndjson(v4), [DROP6]: ndjson(v6) });

describe("Spamhaus DROP (redes)", () => {
  it("coleta v4 e v6, guarda a faixa de cada rede e tira da lista o que saiu dela na hora (termos 4.2)", async () => {
    const DB = bancoTeste(...migracoes());
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE fonte = 'spamhaus-drop' AND tipo = 'rede'")).n).toBe(123);
    expect(await um(DB, "SELECT valor, ameaca, tags, ini, fim, expira_em FROM indicadores WHERE valor = '203.0.113.0/24'")).toMatchObject({ ameaca: "drop", tags: '["sbl:SBL999","rir:apnic"]', ini: "4:cb007100", fim: "4:cb0071ff", expira_em: dias(3).toISOString() });
    expect((await um<{ ini: string }>(DB, "SELECT ini FROM indicadores WHERE valor = '2001:db8:abcd::/48'")).ini).toBe("6:20010db8abcd00000000000000000000");
    expect((await um<{ itens: number; erro_msg: string | null }>(DB, "SELECT itens, erro_msg FROM fontes WHERE id = 'spamhaus-drop'"))).toEqual({ itens: 123, erro_msg: null });
    // 6 h depois a rede 198.51.0.0/16 saiu da lista: expira na hora, não em 3 dias
    await executarFontes({ DB }, { agora: horas(7), buscar: rede(dropRota(redes4.slice(0, -1))).buscar, so: "spamhaus-drop" });
    expect(await um(DB, "SELECT expirado, expira_em FROM indicadores WHERE valor = '198.51.0.0/16'")).toEqual({ expirado: 1, expira_em: horas(7).toISOString() });
    expect((await um<{ expirado: number }>(DB, "SELECT expirado FROM indicadores WHERE valor = '203.0.113.0/24'")).expirado).toBe(0);
  });

  it("arquivo cortado, linha estranha ou lista pequena demais não tocam no que já estava gravado", async () => {
    const DB = bancoTeste(...migracoes());
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    const falha = async (rotas: Record<string, unknown>, agora: Date) => {
      await executarFontes({ DB }, { agora, buscar: rede(rotas).buscar, so: "spamhaus-drop" });
      return (await um<{ erro_msg: string }>(DB, "SELECT erro_msg FROM fontes WHERE id = 'spamhaus-drop'")).erro_msg;
    };
    expect(await falha({ [DROP4]: ndjson(redes4, 9999), [DROP6]: ndjson(redes6) }, horas(7))).toContain("incompleto");
    expect(await falha({ [DROP4]: "<html>erro</html>", [DROP6]: ndjson(redes6) }, horas(14))).toContain("fora do formato");
    expect(await falha({ [DROP4]: ndjson(redes4.slice(0, 5)), [DROP6]: ndjson(redes6) }, horas(21))).toContain("suspeito");
    expect((await um<{ n: number }>(DB, "SELECT count(*) AS n FROM indicadores WHERE fonte = 'spamhaus-drop' AND expirado = 0")).n).toBe(123);
  });

  it("ioc_consultar: IP dentro de rede listada (v4 e v6), IP fora, CIDR que se sobrepõe; sem veredito", async () => {
    const DB = bancoTeste(...migracoes());
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    const { j } = await ferr(DB, "ioc_consultar", { valores: ["203.0.113.77", "203.0.114.1", "2001:db8:abcd:1::5", "2001:db9::1", "203.0.0.0/16", "198.51.100.0/24"] });
    const [dentro, fora, v6, v6fora, sobrepoe, contida] = j.resultados;
    expect(dentro).toMatchObject({ tipo: "ip", listado: true, redes: [{ rede: "203.0.113.0/24", fonte: "spamhaus-drop", ameaca: "drop", tags: ["sbl:SBL999", "rir:apnic"], expirado: false }] });
    expect(fora).toMatchObject({ listado: false });
    expect(fora.redes).toBeUndefined();
    expect(fora.aviso).toContain("não significa que seja seguro");
    expect(v6).toMatchObject({ listado: true, redes: [{ rede: "2001:db8:abcd::/48" }] });
    expect(v6fora.listado).toBe(false);
    expect(sobrepoe).toMatchObject({ tipo: "rede", listado: true });
    expect(sobrepoe.redes.map((r: { rede: string }) => r.rede)).toEqual(["203.0.113.0/24"]); // a /24 está dentro da /16 consultada
    expect(contida.redes.map((r: { rede: string }) => r.rede)).toEqual(["198.51.0.0/16"]); // a /24 consultada está dentro da /16 listada
    expect(j.resultados.every((r: Record<string, unknown>) => !("veredito" in r))).toBe(true);
    const selo = j.fontes.find((f: { fonte: string }) => f.fonte === "DROP (Spamhaus)");
    expect(selo.atribuicao).toContain("proíbem usar o nome Spamhaus em material comercial");
  });

  it("rede expirada ou de fonte pausada não aparece como listada", async () => {
    const DB = bancoTeste(...migracoes());
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    expect((await ferr(DB, "ioc_consultar", { valores: ["203.0.113.5"] }, dias(5))).j.resultados[0].redes[0].expirado).toBe(true);
    await DB.prepare("UPDATE fontes SET ativa = 0 WHERE id = 'spamhaus-drop'").run();
    expect((await ferr(DB, "ioc_consultar", { valores: ["203.0.113.5"] })).j.resultados[0].listado).toBe(false);
  });

  it("exportar_lista tipo rede: texto, csv e cdb (IPv6 omitido), com o aviso de licença; /v1/listas/rede leva o aviso no cabeçalho", async () => {
    const DB = bancoTeste(...migracoes());
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    const txt = (await ferr(DB, "exportar_lista", { tipo: "rede", limite: 2000 })).j;
    expect(txt).toMatchObject({ total: 123, retornadas: 123 });
    expect(txt.conteudo.split("\n")).toContain("203.0.113.0/24");
    expect(txt.aviso_licenca).toContain("uso interno");
    expect(txt.aviso_licenca).toContain("Não repasse a lista a terceiros");
    expect(txt.fontes.map((f: { fonte: string }) => f.fonte)).toEqual(["DROP (Spamhaus)"]);
    const cdb = (await ferr(DB, "exportar_lista", { tipo: "rede", formato: "cdb", limite: 2000 })).j;
    expect(cdb).toMatchObject({ omitidos: 1, retornadas: 122 }); // o IPv6 tem ':'
    expect(cdb.conteudo.split("\n")).toContain("203.0.113.0/24:spamhaus-drop");
    expect((await ferr(DB, "exportar_lista", { tipo: "rede", formato: "csv", limite: 1 })).j.conteudo).toContain('"rede","spamhaus-drop"');
    // /v1
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes) VALUES ('c1', 'ness.OS', ?, '[]')").bind(await hashToken("nesskb_os")).run();
    const r = await v1(new Request("https://x/v1/listas/rede", { headers: { authorization: "Bearer nesskb_os" } }), { DB, AI: {} as Ai }, "/v1/listas/rede");
    expect(r.status).toBe(200);
    expect(r.headers.get("x-aviso")).toContain("uso interno");
    expect(r.headers.get("x-total")).toBe("123");
  });

  it("o aviso de licença acompanha a origem: abuse.ch para ip, hash e url; DROP para rede; nenhum para o Feodo sozinho (CC0)", async () => {
    const DB = await carregado();
    const ip = (await ferr(DB, "exportar_lista", { tipo: "ip" })).j.aviso_licenca;
    expect(ip).toContain("abuse.ch");
    expect(ip).toContain("treinar ou melhorar modelo de IA");
    expect(ip).not.toContain("Spamhaus");
    expect((await ferr(DB, "exportar_lista", { tipo: "ip", fonte: "feodo" })).j.aviso_licenca).toBeUndefined();
    expect((await ferr(DB, "exportar_lista", { tipo: "hash", fonte: "malwarebazaar" })).j.aviso_licenca).toContain("abuse.ch");
    await executarFontes({ DB }, { agora: T, buscar: rede(dropRota()).buscar, so: "spamhaus-drop" });
    const r = (await ferr(DB, "exportar_lista", { tipo: "rede" })).j.aviso_licenca;
    expect(r).toContain("DROP");
    expect(r).not.toContain("abuse.ch");
  });
});

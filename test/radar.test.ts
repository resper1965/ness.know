import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-25T12:00:00.000Z");
const TOKEN = "token-radar-secreto-123";
const ok = (result: unknown) => Response.json({ success: true, errors: [], result });
const OUTAGES = { annotations: [{ dataSource: "ALL", description: "Queda <b>regional</b>", scope: "Multiple regions/cities", startDate: "2026-11-24T00:00:00Z", endDate: null, locations: ["BR"], asns: [15169], eventType: "OUTAGE", linkedUrl: "https://example.com/noticia", outage: { outageCause: "POWER_OUTAGE", outageType: "REGIONAL" } }, { startDate: "2026-11-23T00:00:00Z", locations: ["BR"], asns: [], linkedUrl: "javascript:alert(1)", outage: {} }] };
const HIJACKS = { asn_info: [], events: [{ id: 1, hijacker_asn: 64512, victim_asns: [15169], prefixes: ["192.0.2.0/24"], min_hijack_ts: "2026-11-25T10:00:00", on_going_count: 1, confidence_score: 4 }, { id: 2, hijacker_asn: 999, victim_asns: [888], prefixes: ["198.51.100.0/24"], min_hijack_ts: "2026-11-25T09:00:00", on_going_count: 0, confidence_score: 8 }] };

function rede(resp: (url: string, init: RequestInit) => Response) {
  const chamadas: { url: URL; auth: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url: new URL(url), auth: new Headers(init.headers).get("authorization") });
    return resp(url, init);
  });
  return chamadas;
}
const estado = async (args: Record<string, unknown>, env: { DB: D1Database; RADAR_API_TOKEN?: string }, agora = T) => {
  const r = await chamarFonte(env, "internet_estado", args, agora);
  return { erro: !!r?.isError, texto: r?.content[0].text ?? "", j: r && !r.isError ? JSON.parse(r.content[0].text) : null };
};

afterEach(() => vi.unstubAllGlobals());

describe("internet_estado", () => {
  it("sem token configurado: avisa e não chama o Radar", async () => {
    const chamadas = rede(() => ok({}));
    const { j } = await estado({ pais: "br" }, { DB: bancoTeste(...migracoes()) });
    expect(j).toMatchObject({ configurado: false, filtros: { pais: "BR" } });
    expect(j.aviso).toContain("RADAR_API_TOKEN");
    expect(chamadas).toHaveLength(0);
  });

  it("quedas por país: manda o token só no cabeçalho, filtra por país e janela de 7 dias, e limpa o resultado", async () => {
    const chamadas = rede(() => ok(OUTAGES));
    const { j, texto } = await estado({ pais: "br" }, { DB: bancoTeste(...migracoes()), RADAR_API_TOKEN: TOKEN });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url.pathname).toBe("/client/v4/radar/annotations/outages");
    expect(Object.fromEntries(chamadas[0].url.searchParams)).toMatchObject({ location: "BR", dateRange: "7d", format: "json" });
    expect(chamadas[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(j.quedas[0]).toMatchObject({ escopo: "Multiple regions/cities", paises: ["BR"], asns: [15169], causa: "POWER_OUTAGE", tipo: "REGIONAL", fim: null, descricao: "Queda regional", fonte_da_noticia: "https://example.com/noticia" });
    expect(j.quedas[1].fonte_da_noticia).toBeNull(); // só https
    expect(j.hijacks_bgp).toBeUndefined();
    expect(j.aviso_bgp).toContain("asn");
    expect(j.fontes[0]).toMatchObject({ fonte: "Cloudflare Radar", frescor: "consulta ao vivo" });
    expect(texto).not.toContain(TOKEN);
  });

  it("com asn: consulta também os sequestros de BGP e só fica com os que envolvem esse ASN, mesmo que a API devolva outros", async () => {
    const chamadas = rede((u) => ok(u.includes("/bgp/hijacks/") ? HIJACKS : OUTAGES));
    const { j } = await estado({ asn: "AS15169", desde: "2026-11-20" }, { DB: bancoTeste(...migracoes()), RADAR_API_TOKEN: TOKEN });
    expect(chamadas.map((c) => c.url.pathname).sort()).toEqual(["/client/v4/radar/annotations/outages", "/client/v4/radar/bgp/hijacks/events"]);
    const bgp = chamadas.find((c) => c.url.pathname.includes("hijacks"))!.url.searchParams;
    expect(bgp.get("involvedAsn")).toBe("15169");
    expect(bgp.get("dateStart")).toBe("2026-11-20T00:00:00Z");
    expect(bgp.get("dateRange")).toBeNull();
    expect(j.hijacks_bgp).toEqual([{ id: 1, hijacker_asn: 64512, vitimas: [15169], prefixos: ["192.0.2.0/24"], inicio: "2026-11-25T10:00:00", em_andamento: true, confianca: 4 }]);
    expect(j.aviso_bgp).toBeUndefined();
  });

  it("erro do Radar: avisa para não concluir que está tudo bem, registra o erro sem o token, não cacheia e se recupera", async () => {
    const DB = bancoTeste(...migracoes());
    let n = 0;
    rede(() => (n++ === 0 ? Response.json({ success: false, errors: [{ message: `token inválido ${TOKEN}` }] }, { status: 403 }) : ok(OUTAGES)));
    const env = { DB, RADAR_API_TOKEN: TOKEN };
    const falha = await estado({ pais: "BR" }, env);
    expect(falha.j).toMatchObject({ indisponivel: true });
    expect(falha.j.aviso).toContain("Não conclua");
    expect(falha.j.fontes[0].aviso).toContain("falhou");
    const gravado = (await DB.prepare("SELECT erro_msg FROM fontes WHERE id = 'radar'").first<{ erro_msg: string }>())!.erro_msg;
    expect(gravado).toContain("403");
    const recuperado = await estado({ pais: "BR" }, env, new Date(T.getTime() + 60_000));
    expect(recuperado.j.quedas).toHaveLength(2);
    expect(recuperado.j.indisponivel).toBeUndefined();
    let chamadas = 0;
    rede(() => (chamadas++, ok(OUTAGES)));
    await estado({ pais: "BR" }, env, new Date(T.getTime() + 2 * 60_000)); // dentro de 5 minutos: do cache
    expect(chamadas).toBe(0);
  });

  it("valida a entrada antes de qualquer chamada", async () => {
    const chamadas = rede(() => ok({}));
    const env = { DB: bancoTeste(...migracoes()), RADAR_API_TOKEN: TOKEN };
    for (const args of [{ pais: "BRA" }, { pais: "1" }, { asn: "abc" }, { asn: "15169; DROP" }, { desde: "ontem" }]) expect((await estado(args, env)).erro, JSON.stringify(args)).toBe(true);
    expect(chamadas).toHaveLength(0);
  });
});

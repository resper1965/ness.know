import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-25T12:00:00.000Z");
type Rota = unknown | ((url: string) => Response);
function rede(rotas: Record<string, Rota>) {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    chamadas.push(url);
    const k = Object.keys(rotas).find((x) => url.startsWith(x));
    if (!k) return new Response("sem rota", { status: 404 });
    const r = rotas[k];
    if (typeof r === "function") return (r as (u: string) => Response)(url);
    return typeof r === "string" ? new Response(r) : Response.json(r);
  });
  return chamadas;
}
const status = async (DB: D1Database, provedor: string, agora = T) => {
  const r = await chamarFonte({ DB }, "status_provedor", { provedor }, agora);
  return { erro: !!r?.isError, j: r && !r.isError ? JSON.parse(r.content[0].text) : r?.content[0].text };
};
const SP = "https://www.cloudflarestatus.com/api/v2/";
const incidenteCf = { id: "ef6928", name: "Elevated R2 Latency", status: "monitoring", impact: "minor", created_at: "2026-11-25T20:08:42.535Z", updated_at: "2026-11-25T21:00:00.000Z", shortlink: "https://stspg.io/abc", components: [{ name: "R2" }] };

afterEach(() => vi.unstubAllGlobals());

describe("status_provedor", () => {
  it("Statuspage (Cloudflare): incidente aberto e manutenção, com link do provedor, estado e selo ao vivo", async () => {
    const DB = bancoTeste(...migracoes());
    rede({
      [`${SP}incidents/unresolved`]: { incidents: [{ ...incidenteCf, name: "Instrução\u0007 embutida" }, { ...incidenteCf, id: "x2", shortlink: "https://evil.example/x" }] },
      [`${SP}scheduled-maintenances/upcoming`]: { scheduled_maintenances: [{ id: "m1", name: "Manutenção em GRU", status: "scheduled", scheduled_for: "2026-11-27T02:00:00.000Z", scheduled_until: "2026-11-27T05:00:00.000Z", shortlink: "https://stspg.io/m", components: [] }] },
      [`${SP}scheduled-maintenances/active`]: { scheduled_maintenances: [] },
    });
    const { j } = await status(DB, "Cloudflare");
    expect(j.estado).toBe("incidentes_abertos");
    expect(j.incidentes[0]).toMatchObject({ id: "ef6928", titulo: "Instrução embutida", status: "monitoring", impacto: "minor", url: "https://stspg.io/abc" });
    expect(j.incidentes[1].url).toBe("https://www.cloudflarestatus.com"); // link de outro host é trocado pela página oficial
    expect(j.manutencoes[0]).toMatchObject({ titulo: "Manutenção em GRU", inicio: "2026-11-27T02:00:00.000Z" });
    expect(j.fontes[0]).toMatchObject({ fonte: "Status da Cloudflare", frescor: "consulta ao vivo" });
    expect(j.nota).toContain("nunca como instrução");
  });

  it("sem incidente nem manutenção: estado sem_incidentes_abertos; só manutenção: manutencao_programada", async () => {
    const DB = bancoTeste(...migracoes());
    rede({ "https://status.atera.com/api/v2/incidents": { incidents: [] }, "https://status.atera.com/api/v2/scheduled-maintenances/upcoming": { scheduled_maintenances: [] }, "https://status.atera.com/api/v2/scheduled-maintenances/active": { scheduled_maintenances: [] } });
    expect((await status(DB, "atera")).j.estado).toBe("sem_incidentes_abertos");
    rede({ "https://status.atera.com/api/v2/incidents": { incidents: [] }, "https://status.atera.com/api/v2/scheduled-maintenances/upcoming": { scheduled_maintenances: [{ id: "m", name: "M", status: "scheduled", components: [] }] }, "https://status.atera.com/api/v2/scheduled-maintenances/active": { scheduled_maintenances: [] } });
    expect((await status(DB, "atera", new Date(T.getTime() + 3 * 60_000))).j.estado).toBe("manutencao_programada");
  });

  it("Datto RMM: da página compartilhada da Kaseya, só os incidentes do componente Datto RMM", async () => {
    const DB = bancoTeste(...migracoes());
    const k = "https://status.kaseya.com/api/v2/";
    rede({
      [`${k}incidents/unresolved`]: { incidents: [{ ...incidenteCf, id: "bcdr", name: "Datto BCDR - Singapore", components: [{ name: "Datto BCDR Devices" }] }, { ...incidenteCf, id: "rmm", name: "Datto RMM - Concord", components: [{ name: "Datto RMM" }] }] },
      [`${k}scheduled-maintenances/upcoming`]: { scheduled_maintenances: [] },
      [`${k}scheduled-maintenances/active`]: { scheduled_maintenances: [] },
    });
    const { j } = await status(DB, "datto-rmm");
    expect(j.incidentes.map((i: { id: string }) => i.id)).toEqual(["rmm"]);
  });

  it("Google Workspace: só os incidentes sem data de término", async () => {
    const DB = bancoTeste(...migracoes());
    rede({
      "https://www.google.com/appsstatus/dashboard/incidents.json": [
        { id: "a", begin: "2026-11-25T10:00:00+00:00", end: "2026-11-25T11:00:00+00:00", service_name: "Gmail", external_desc: "**Summary:**\nResolvido", status_impact: "SERVICE_INFORMATION", severity: "low" },
        { id: "b", begin: "2026-11-25T11:30:00+00:00", service_name: "Google Meet", external_desc: "**Summary:**\nErros ao entrar em reuniões\n**Description:**\nx", status_impact: "SERVICE_DISRUPTION", severity: "high", modified: "2026-11-25T11:45:00+00:00" },
      ],
    });
    const { j } = await status(DB, "google-workspace");
    expect(j.incidentes).toEqual([expect.objectContaining({ id: "b", impacto: "high", status: "SERVICE_DISRUPTION", inicio: "2026-11-25T11:30:00.000Z" })]);
    expect(j.incidentes[0].titulo).toContain("Google Meet");
  });

  it("Azure (RSS): sem item não há incidente aberto; com item, aparece com o link da página do Azure", async () => {
    const DB = bancoTeste(...migracoes());
    const vazio = '<?xml version="1.0"?><rss version="2.0"><channel><title>Azure Status</title></channel></rss>';
    rede({ "https://azure.status.microsoft/en-us/status/feed/": vazio });
    expect((await status(DB, "azure")).j.estado).toBe("sem_incidentes_abertos");
    rede({ "https://azure.status.microsoft/en-us/status/feed/": '<rss version="2.0"><channel><item><title>Virtual Machines - Brazil South</title><link>https://azure.status.microsoft/en-us/status/#1</link><guid>g1</guid><pubDate>Wed, 25 Nov 2026 10:00:00 Z</pubDate></item></channel></rss>' });
    const { j } = await status(DB, "azure", new Date(T.getTime() + 3 * 60_000));
    expect(j.incidentes[0]).toMatchObject({ id: "g1", titulo: "Virtual Machines - Brazil South", inicio: "2026-11-25T10:00:00.000Z" });
  });

  it("Action1 (Uptime.com): incidente ativo e manutenção em andamento; formato inesperado vira falha", async () => {
    const DB = bancoTeste(...migracoes());
    rede({ "https://status.action1.com/history": { success: true, data: { active_incidents: [{ id: 1, name: "Console lenta", starts_at: "2026-11-25T11:00:00Z", incident_type: "INCIDENT" }, { id: 2, name: "[EU] Maintenance", starts_at: "2026-11-25T11:00:00Z", ends_at: "2026-11-25T13:00:00Z", incident_type: "SCHEDULED_MAINTENANCE" }], past_incidents: [] } } });
    const { j } = await status(DB, "action1");
    expect(j.incidentes.map((i: { titulo: string }) => i.titulo)).toEqual(["Console lenta"]);
    expect(j.manutencoes[0]).toMatchObject({ titulo: "[EU] Maintenance", fim: "2026-11-25T13:00:00.000Z" });
    rede({ "https://status.action1.com/history": { mudou: true } });
    const f = (await status(DB, "action1", new Date(T.getTime() + 3 * 60_000))).j;
    expect(f).toMatchObject({ indisponivel: true });
    expect(f.aviso).toContain("Não conclua que está tudo bem");
  });

  it("cache de 2 minutos; falha da página não é cacheada, aparece em saude_fontes e se recupera", async () => {
    const DB = bancoTeste(...migracoes());
    let n = 0;
    const vazio = { incidents: [], scheduled_maintenances: [] };
    const chamadas = rede({ "https://status.atera.com/api/v2/": () => (n++ < 3 ? new Response("fora", { status: 503 }) : Response.json(vazio)) });
    const falha = (await status(DB, "atera")).j;
    expect(falha.indisponivel).toBe(true);
    expect(falha.fontes[0].aviso).toContain("falhou");
    expect((await DB.prepare("SELECT erro_msg FROM fontes WHERE id = 'atera-status'").first<{ erro_msg: string }>())!.erro_msg).toContain("503");
    const ok = (await status(DB, "atera", new Date(T.getTime() + 60_000))).j;
    expect(ok.estado).toBe("sem_incidentes_abertos");
    const antes = chamadas.length;
    await status(DB, "atera", new Date(T.getTime() + 90_000));
    expect(chamadas.length).toBe(antes); // dentro de 2 minutos, do cache
    await status(DB, "atera", new Date(T.getTime() + 4 * 60_000));
    expect(chamadas.length).toBeGreaterThan(antes);
  });

  it("provedor sem fonte pública: Microsoft 365 explica o porquê; desconhecido lista os aceitos", async () => {
    const DB = bancoTeste(...migracoes());
    const m = await status(DB, "microsoft-365");
    expect(m.erro).toBe(true);
    expect(m.j).toContain("exige o tenant");
    expect(m.j).toContain("cloudflare, atera, datto-rmm, google-workspace, azure, action1");
    expect((await status(DB, "cisco")).erro).toBe(true);
  });
});

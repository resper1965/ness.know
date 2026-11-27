import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarFonte } from "../src/fontes/ferramentas";
import { trechos } from "../src/fontes/rfc";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T12:00:00.000Z");
const META = { doc_id: "RFC4271", title: "A Border Gateway Protocol 4 (BGP-4)", authors: ["Y. Rekhter", "T. Li"], status: "DRAFT STANDARD", pub_date: "January 2006", abstract: "This document discusses the BGP.", obsoletes: ["RFC1771"], obsoleted_by: [], updated_by: ["RFC4724", "RFC6286"], errata_url: "https://www.rfc-editor.org/errata_search.php?rfc=4271" };
const TXT = "Table of Contents\n   6.5. Hold Timer Expired Error Handling .......................34\n\n1. Introduction\n\nThe Hold Timer is negotiated in the OPEN message.\nThe HoldTime MUST be zero or at least three seconds.\n\n" + "x\n".repeat(40) + "Another hold timer mention here.\n";
function rede(rotas: Record<string, () => Response>) {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    chamadas.push(url);
    const k = Object.keys(rotas).find((x) => url === x);
    return k ? rotas[k]() : new Response("não achei", { status: 404 });
  });
  return chamadas;
}
const rfc = async (DB: D1Database, args: Record<string, unknown>) => {
  const r = await chamarFonte({ DB }, "rfc_consultar", args, T);
  return { erro: !!r?.isError, j: r && !r.isError ? JSON.parse(r.content[0].text) : r?.content[0].text };
};
afterEach(() => vi.unstubAllGlobals());

describe("rfc_consultar", () => {
  it("metadados: título, status, atualizações, link e selo ao vivo; segunda consulta vem do cache", async () => {
    const DB = bancoTeste(...migracoes());
    const c = rede({ "https://www.rfc-editor.org/rfc/rfc4271.json": () => Response.json(META) });
    const a = await rfc(DB, { numero: 4271 });
    expect(a.j.resultado).toMatchObject({ id: "RFC 4271", titulo: "A Border Gateway Protocol 4 (BGP-4)", status: "DRAFT STANDARD", atualizada_por: ["RFC4724", "RFC6286"], url: "https://www.rfc-editor.org/rfc/rfc4271" });
    expect(a.j.aviso).toContain("atualizam");
    expect(a.j.fontes[0]).toMatchObject({ fonte: "RFCs do IETF (rfc-editor.org)", frescor: "consulta ao vivo" });
    await rfc(DB, { numero: "RFC 4271" });
    expect(c.length).toBe(1);
  });
  it("RFC obsoletado avisa qual consultar", async () => {
    const DB = bancoTeste(...migracoes());
    rede({ "https://www.rfc-editor.org/rfc/rfc1771.json": () => Response.json({ ...META, title: "BGP-4 (antigo)", obsoleted_by: ["RFC4271"], updated_by: [] }) });
    expect((await rfc(DB, { numero: 1771 })).j.aviso).toContain("obsoletado por RFC4271");
  });
  it("termo devolve trechos literais do texto oficial; termo ausente avisa", async () => {
    const DB = bancoTeste(...migracoes());
    rede({ "https://www.rfc-editor.org/rfc/rfc4271.json": () => Response.json(META), "https://www.rfc-editor.org/rfc/rfc4271.txt": () => new Response(TXT) });
    const r = (await rfc(DB, { numero: 4271, termo: "hold timer" })).j;
    expect(r.trechos).toHaveLength(2);
    expect(r.trechos[0]).toContain("The Hold Timer is negotiated in the OPEN message.");
    expect((await rfc(DB, { numero: 4271, termo: "zzzzz" })).j.aviso_trechos).toContain("não aparece");
  });
  it("RFC inexistente, número inválido e falha da fonte", async () => {
    const DB = bancoTeste(...migracoes());
    rede({ "https://www.rfc-editor.org/rfc/rfc9999.json": () => new Response("x", { status: 500 }) });
    expect((await rfc(DB, { numero: 1 })).j.aviso).toContain("não encontrado");
    expect((await rfc(DB, { numero: 9999 })).j).toMatchObject({ indisponivel: true });
    expect((await rfc(DB, { numero: "abc" })).erro).toBe(true);
    expect((await rfc(DB, { numero: 0 })).erro).toBe(true);
  });
  it("trechos: sem termo achado devolve vazio", () => {
    expect(trechos(TXT, "BGP")).toEqual([]);
  });
});

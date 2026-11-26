// API em lote para o ness.OS (somente leitura): mesma credencial nesskb_ do /mcp, outro formato. Conhecimento público: sem escopo por pacote.
import { clienteDe, type EnvMcp, recusar, tokenDe } from "./mcp";
import { consultarCves, MAX_CVES_LOTE } from "./fontes/ferramentas";
import { exportarLista, filtroLista } from "./fontes/ioc";

const erro = (m: string, status: number, h: Record<string, string> = {}) => Response.json({ erro: m }, { status, headers: h });

/** POST /v1/cve {cves: ["CVE-…"]} (até 500): KEV, EPSS e avisos de fabricante, sem NVD (que limita a taxa). */
export async function v1(req: Request, env: EnvMcp, caminho: string): Promise<Response> {
  const token = tokenDe(req);
  const cliente = token ? await clienteDe(token, env.DB) : null;
  if (!cliente) return recusar(req, env);
  if (env.LIMITE_MCP && !(await env.LIMITE_MCP.limit({ key: `v1:${cliente.id}` })).success) return erro("limite de requisições da chave excedido; tente de novo em instantes", 429, { "retry-after": "30" });
  if (caminho === "/v1/cve" && req.method === "POST") {
    const corpo = (await req.json().catch(() => null)) as { cves?: unknown } | null;
    if (!Array.isArray(corpo?.cves) || !corpo.cves.length) return erro("informe cves: lista de ids CVE", 400);
    if (corpo.cves.length > MAX_CVES_LOTE) return erro(`até ${MAX_CVES_LOTE} CVEs por chamada`, 400);
    return Response.json(await consultarCves(env, corpo.cves, { nvd: false }));
  }
  // Lista inteira de indicadores vigentes para o ness.OS aplicar pelo processo de aprovação dele; o ness.know não bloqueia nada.
  const lista = caminho.match(/^\/v1\/listas\/([a-z]+)$/);
  if (lista && req.method === "GET") {
    const q = new URL(req.url).searchParams;
    const f = filtroLista({ tipo: lista[1], fonte: q.get("fonte") ?? undefined, confianca_min: q.get("confianca_min") ?? undefined, formato: q.get("formato") ?? "texto" });
    if ("erro" in f) return erro(f.erro, 400);
    const r = await exportarLista(env.DB, f, 50_000, new Date());
    const corpo = r.linhas.join("\n") + (r.linhas.length ? "\n" : "");
    return new Response(corpo, {
      headers: {
        "content-type": f.formato === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        "x-total": String(r.total),
        "x-omitidos": String(r.omitidos),
        "x-gerado-em": new Date().toISOString(),
        "x-fontes": r.fontes.map((s) => `${s.fonte}: ${s.frescor}`).join("; ").replace(/[^\x20-\x7e]/g, "?"),
        "x-aviso": "O ness.know nao bloqueia nada; aplique pelo processo de aprovacao do ness.OS",
      },
    });
  }
  return erro("não encontrado", 404);
}

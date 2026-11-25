// API em lote para o ness.OS (somente leitura): mesma credencial nesskb_ do /mcp, outro formato. Conhecimento público: sem escopo por pacote.
import { clienteDe, type EnvMcp, recusar, tokenDe } from "./mcp";
import { consultarCves, MAX_CVES_LOTE } from "./fontes/ferramentas";

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
  return erro("não encontrado", 404);
}

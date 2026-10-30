// ness.KNOW: base de conhecimento por MCP (Streamable HTTP, sem sessão): outros projetos consultam os pacotes que lhes foram liberados.
// Autenticação por chave de API (Bearer), guardada só em hash na tabela `chaves`; /mcp fica fora do Cloudflare Access.
import { buscarEm, type EnvBusca } from "./busca";
import { correlacionar, MAX_DESTINOS, PACOTE_STRM } from "./strm";

export interface EnvMcp extends EnvBusca {
  /** Ajustes medidos com scripts/avaliar-busca.mjs: "1" liga o rerank; número troca a nota mínima da semântica. */
  BUSCA_RERANK?: string;
  BUSCA_MINIMO?: string;
}

/** Versões que este servidor implementa (HTTP sem sessão, só ferramentas). Pedido fora da lista recebe a mais nova. */
const VERSOES = ["2025-06-18", "2025-03-26"];

export interface Cliente {
  id: string;
  nome: string;
  pacotes: string[];
  /** Pacotes restritos a algumas normas: slug → títulos. Pacote fora do mapa vale inteiro. */
  documentos: Record<string, string[]>;
}

/** Lê o JSON {slug: [títulos]} da chave, descartando o que não for lista de textos. */
export function restricoesDe(json: string | null | undefined): Record<string, string[]> {
  try {
    const o = JSON.parse(json || "{}") as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (Array.isArray(v) ? [[k, v.filter((x): x is string => typeof x === "string")]] : [])));
  } catch {
    return {};
  }
}

export async function hashToken(token: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token novo: 32 bytes aleatórios em base64url, prefixado para ser reconhecível em vazamentos. */
export function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return `nesskb_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

async function clienteDe(req: Request, db: D1Database): Promise<Cliente | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const c = await db
    .prepare("SELECT id, nome, pacotes, documentos FROM chaves WHERE token_hash = ? AND ativo = 1")
    .bind(await hashToken(token))
    .first<{ id: string; nome: string; pacotes: string; documentos?: string }>();
  if (!c) return null;
  let pacotes: string[] = [];
  try {
    pacotes = (JSON.parse(c.pacotes) as unknown[]).filter((x): x is string => typeof x === "string");
  } catch {}
  return { id: c.id, nome: c.nome, pacotes, documentos: restricoesDe(c.documentos) };
}

const FERRAMENTAS = [
  {
    name: "listar_pacotes",
    description: "Lista os pacotes liberados (normas, leis, frameworks) em JSON: slug, nome, versão, instruções de uso e os documentos que esta chave enxerga, com versão. restrito: true indica que a chave vê só parte do pacote.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "buscar_conhecimento",
    description:
      "Busca por significado e por palavra nos documentos dos pacotes liberados (ISO, ABNT, NIST, CIS, ITIL, regulação). Funciona com pergunta em português para texto em inglês. Devolve JSON: trechos com documento, versão, seção ou cláusula e uma fonte (ref know-…) para citar.",
    inputSchema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "pergunta ou palavras-chave" },
        pacotes: { type: "array", items: { type: "string" }, description: "opcional: restringe a estes pacotes (slugs de listar_pacotes)" },
        limite: { type: "integer", description: "quantos trechos (1 a 20, padrão 8)" },
      },
      required: ["consulta"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "correlacionar",
    description:
      "Correspondência oficial entre frameworks (SCF STRM, NIST IR 8477). Dado um item de um framework (ex.: 8.16 da ISO 27002:2022, DE.CM-01 do NIST CSF 2.0), devolve os controles SCF ligados e os itens correspondentes nos frameworks de destino, com tipo de relação (igual, subconjunto, superconjunto, intersecao) e força de 0 a 10 do elo mais fraco. Ids dos frameworks: pacote scf-strm em listar_pacotes. Controles do Anexo A da ISO 27001 estão no framework da ISO 27002. Confirme o requisito com buscar_conhecimento antes de afirmar conformidade.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string", description: "código do item na origem (ex.: 8.16, DE.CM-01, 8.11); com de = scf, um controle SCF (ex.: MON-01)" },
        de: { type: "string", description: "id do framework de origem (ex.: general-iso-27002-2022) ou scf" },
        para: { type: "array", items: { type: "string" }, description: `ids dos frameworks de destino, até ${MAX_DESTINOS}` },
      },
      required: ["item", "de", "para"],
    },
    annotations: { readOnlyHint: true },
  },
];

type Resposta = { content: { type: "text"; text: string }[]; isError?: boolean };
const texto = (t: string, isError = false): Resposta => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

async function chamar(env: EnvMcp, cliente: Cliente, nome: string, args: Record<string, unknown>): Promise<Resposta> {
  if (nome === "listar_pacotes") {
    if (!cliente.pacotes.length) return texto(JSON.stringify({ pacotes: [] }));
    const marcas = cliente.pacotes.map(() => "?").join(", ");
    const [p, d] = await Promise.all([
      env.DB.prepare(`SELECT slug, nome, descricao, versao, instrucoes FROM pacotes WHERE slug IN (${marcas}) ORDER BY slug`)
        .bind(...cliente.pacotes)
        .all<{ slug: string; nome: string; descricao: string | null; versao: string | null; instrucoes: string }>(),
      env.DB.prepare(`SELECT dono, titulo, versao FROM documentos WHERE escopo = 'pacote' AND status = 'ok' AND dono IN (${marcas}) ORDER BY titulo`)
        .bind(...cliente.pacotes)
        .all<{ dono: string; titulo: string; versao: string | null }>(),
    ]);
    const frameworks = cliente.pacotes.includes(PACOTE_STRM)
      ? (await env.DB.prepare("SELECT id, nome, itens FROM strm_frameworks ORDER BY id").all<{ id: string; nome: string; itens: number }>()).results
      : [];
    const pacotes = p.results.map((x) => {
      const so = cliente.documentos[x.slug];
      const documentos = d.results.filter((y) => y.dono === x.slug && (!so || so.includes(y.titulo))).map((y) => ({ titulo: y.titulo, versao: y.versao }));
      return { ...x, ...(so ? { restrito: true } : {}), documentos, ...(x.slug === PACOTE_STRM ? { frameworks } : {}) };
    });
    return texto(JSON.stringify({ pacotes }, null, 1));
  }
  if (nome === "buscar_conhecimento") {
    const consulta = typeof args.consulta === "string" ? args.consulta.trim().slice(0, 2000) : "";
    if (!consulta) return texto("informe a consulta", true);
    // Só pacotes liberados: o filtro pedido nunca amplia o acesso.
    const pedidos = Array.isArray(args.pacotes) ? args.pacotes.filter((x): x is string => typeof x === "string") : [];
    const slugs = pedidos.length ? cliente.pacotes.filter((s) => pedidos.includes(s)) : cliente.pacotes;
    const limite = Math.min(Math.max(Math.floor(Number(args.limite)) || 8, 1), 20); // inteiro: vai para o LIMIT do SQLite
    const alvos = slugs.map((dono) => ({ escopo: "pacote" as const, dono, ...(cliente.documentos[dono] ? { titulos: cliente.documentos[dono] } : {}) }));
    const r = await buscarEm(env, alvos, consulta, { limite, rerank: env.BUSCA_RERANK === "1", minimo: env.BUSCA_MINIMO && Number.isFinite(Number(env.BUSCA_MINIMO)) ? Number(env.BUSCA_MINIMO) : undefined });
    if (!r.length) return texto(JSON.stringify({ trechos: [], aviso: "Nada encontrado nos pacotes liberados." })); // mesmo formato do resultado
    // JSON com uma fonte por trecho ({sistema, consulta, ref, coletado_em}): quem cita (ex.: ness.brain) confere a ref.
    const coletado_em = new Date().toISOString();
    const trechos = await Promise.all(
      r.map(async (t) => {
        const ref = `know-${(await hashToken(`${t.documento_id}|${t.trecho}`)).slice(0, 12)}`;
        return { ref, documento: t.titulo, versao: t.versao, secao: t.secao ?? null, trecho: t.trecho, fonte: { sistema: "ness.KNOW", consulta, ref, coletado_em } };
      }),
    );
    return texto(JSON.stringify({ trechos }, null, 1));
  }
  if (nome === "correlacionar") {
    if (!cliente.pacotes.includes(PACOTE_STRM)) return texto(`esta chave não libera o pacote ${PACOTE_STRM} (correspondência entre frameworks)`, true);
    const item = typeof args.item === "string" ? args.item.slice(0, 60) : "";
    const de = typeof args.de === "string" ? args.de.slice(0, 120) : "";
    const para = Array.isArray(args.para) ? args.para.filter((x): x is string => typeof x === "string").slice(0, MAX_DESTINOS) : [];
    if (!item.trim() || !de || !para.length) return texto("informe item, de e para (ids em listar_pacotes, pacote scf-strm)", true);
    const r = await correlacionar(env.DB, item, de, para);
    if ("erro" in r) return texto(r.erro, true);
    return texto(JSON.stringify({ ...r, fonte: { sistema: "ness.KNOW", base: `SCF STRM ${r.versao_scf ?? ""}`.trim(), consulta: `${de} ${item}`, coletado_em: new Date().toISOString() } }, null, 1));
  }
  return texto(`ferramenta desconhecida: ${nome}`, true);
}

const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const rpcErro = (id: unknown, code: number, message: string, status = 200) => Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

export async function mcp(req: Request, env: EnvMcp): Promise<Response> {
  if (req.method !== "POST") return new Response("use POST", { status: 405, headers: { allow: "POST" } });
  const cliente = await clienteDe(req, env.DB);
  if (!cliente) return rpcErro(null, -32001, "token inválido", 401);
  const m = (await req.json().catch(() => null)) as { id?: unknown; method?: unknown; params?: Record<string, unknown> } | null;
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.method !== "string") return rpcErro(null, -32600, "requisição inválida", 400);
  if (m.id === undefined) return new Response(null, { status: 202 }); // notificação (ex.: notifications/initialized)

  switch (m.method) {
    case "initialize":
      await env.DB.prepare("UPDATE chaves SET usado_em = datetime('now') WHERE id = ?").bind(cliente.id).run();
      return rpc(m.id, {
        protocolVersion: VERSOES.includes(String(m.params?.protocolVersion)) ? m.params?.protocolVersion : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: { name: "ness.KNOW", version: "1.0.0" },
        instructions: "ness.KNOW: base de normas e frameworks curada pela ness. Use buscar_conhecimento e cite documento, versão e seção.",
      });
    case "ping":
      return rpc(m.id, {});
    case "tools/list":
      return rpc(m.id, { tools: FERRAMENTAS });
    case "tools/call": {
      const nome = typeof m.params?.name === "string" ? m.params.name : "";
      const args = m.params?.arguments && typeof m.params.arguments === "object" ? (m.params.arguments as Record<string, unknown>) : {};
      try {
        return rpc(m.id, await chamar(env, cliente, nome, args));
      } catch (e) {
        console.error("mcp", nome, String(e));
        return rpc(m.id, texto("falha ao consultar a base", true));
      }
    }
    default:
      return rpcErro(m.id, -32601, `método não suportado: ${m.method}`);
  }
}

// OAuth 2.1 do /mcp, para clientes MCP que não aceitam chave colada (ness.work): descoberta (RFC 9728 e 8414), registro dinâmico
// (RFC 7591, cliente público) e código de autorização com PKCE S256. Quem autoriza é a pessoa, logada pelo Cloudflare Access em
// /oauth/authorize, numa tela de consentimento. O token é uma chave nesskb_ comum em `chaves`, da própria pessoa: mesma revogação
// no painel, mesmo limite e mesma contagem de uso; o escopo vem de acesso_regras a cada chamada (escopo.ts).
// Estrutura copiada de resper1965/ness-brain (cloudflare/src/mcp-oauth.ts), em produção com o ness.work.
// ponytail: sem refresh token, chave de 30 dias | limite: o cliente reconecta a cada 30 dias, com a pessoa presente | gatilho: reclamação de reconexão ou agente rodando sem pessoa (emitir refresh token) | dono: diretoria@ness.com.br
import { hashToken, novoToken } from "./mcp";

export interface EnvOauth {
  DB: D1Database;
  /** Registros por IP e no total, por minuto. Sem o binding, não há limite (testes e wrangler dev). */
  LIMITE_REGISTRO_IP?: RateLimit;
  LIMITE_REGISTRO?: RateLimit;
}

export const VALIDADE_DIAS = 30;
const PRAZO_PEDIDO_MS = 10 * 60_000;
const PRAZO_CODIGO_MS = 60_000;
/** Cliente registrado que nunca virou chave e não tem pedido em andamento: some depois disto. Cliente com chave (mesmo vencida) fica. */
const DIAS_CLIENTE_ABANDONADO = 30;

/** UTC "AAAA-MM-DD HH:MM:SS", o formato de chaves.expira_em (comparado com datetime('now')). */
const sqlData = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const emMs = (sql: string) => Date.parse(`${sql.replace(" ", "T")}Z`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Corpo de formulário ilegível vira null (o chamador responde 400), em vez de derrubar a requisição. */
const lerForm = (req: Request) => req.formData().catch(() => null);

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
const falha = (codigo: string, descricao: string, status = 400) => json({ error: codigo, error_description: descricao }, status);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const aleatorio = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n)));

export function metadados(caminho: string, origem: string): Response | null {
  if (caminho === "/.well-known/oauth-protected-resource" || caminho === "/.well-known/oauth-protected-resource/mcp")
    return json({ resource: `${origem}/mcp`, authorization_servers: [origem], bearer_methods_supported: ["header"] });
  if (caminho === "/.well-known/oauth-authorization-server" || caminho === "/.well-known/oauth-authorization-server/mcp")
    return json({
      issuer: origem,
      authorization_endpoint: `${origem}/oauth/authorize`,
      token_endpoint: `${origem}/oauth/token`,
      registration_endpoint: `${origem}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  return null;
}

/** https, ou http só em loopback (cliente local); sem fragmento, sem credencial embutida. */
export function redirectValido(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 500) return false;
  try {
    const x = new URL(u);
    if (x.hash || x.username || x.password) return false;
    return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname));
  } catch {
    return false;
  }
}

/**
 * O registro é público, então o que ninguém usa se acumula: códigos e pedidos vencidos, e clientes que nunca foram autorizados.
 * Roda a cada registro válido, sem cron; falha aqui não impede o registro.
 */
async function limpar(db: D1Database): Promise<void> {
  try {
    await db.prepare("DELETE FROM oauth_codigos WHERE expira_em < datetime('now')").run();
    await db
      .prepare(
        `DELETE FROM oauth_clientes WHERE criado_em < datetime('now', '-${DIAS_CLIENTE_ABANDONADO} days')
         AND client_id NOT IN (SELECT cliente_oauth FROM chaves WHERE cliente_oauth IS NOT NULL)
         AND client_id NOT IN (SELECT client_id FROM oauth_codigos)`,
      )
      .run();
  } catch (e) {
    console.warn("oauth: limpeza não feita", String(e));
  }
}

export async function registrar(req: Request, env: EnvOauth): Promise<Response> {
  if (req.method !== "POST") return falha("invalid_request", "use POST", 405);
  // Cota por origem antes de tudo; a global só conta registro válido, para um curioso não esgotar a de todos.
  const ip = req.headers.get("cf-connecting-ip") ?? "sem-ip";
  if (env.LIMITE_REGISTRO_IP && !(await env.LIMITE_REGISTRO_IP.limit({ key: ip })).success) return falha("temporarily_unavailable", "muitos registros desta origem; tente em instantes", 429);
  const c = (await req.json().catch(() => null)) as unknown;
  if (!c || typeof c !== "object" || Array.isArray(c)) return falha("invalid_client_metadata", "o corpo deve ser um objeto JSON");
  const { redirect_uris, client_name } = c as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(redirect_uris) ? redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectValido)) return falha("invalid_redirect_uri", "de 1 a 5 redirect_uris https (http só em localhost)");
  if (env.LIMITE_REGISTRO && !(await env.LIMITE_REGISTRO.limit({ key: "global" })).success) return falha("temporarily_unavailable", "muitos registros agora; tente em instantes", 429);
  await limpar(env.DB);
  const nome = (typeof client_name === "string" && client_name.trim() ? client_name.trim() : "Cliente MCP").slice(0, 80);
  const client_id = `oa-${aleatorio(12)}`;
  await env.DB.prepare("INSERT INTO oauth_clientes (client_id, nome, redirect_uris) VALUES (?, ?, ?)").bind(client_id, nome, JSON.stringify(uris)).run();
  return json({ client_id, client_name: nome, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }, 201);
}

const voltar = (redirect: string, params: Record<string, string | null>) => {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
};

const pagina = (corpo: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar ao ness.know</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1326;color:#f1f5f9;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5}button{font:inherit;padding:.6rem 1.2rem;border:0;margin-right:.5rem;cursor:pointer}.sim{background:#00ade8;color:#0b1326}.nao{background:#1e2d52;color:#f1f5f9}code{color:#00ade8}</style></head><body>${corpo}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

/** GET mostra o consentimento; POST (o botão) confirma e devolve o código ao cliente. `pessoa` vem do Access. */
export async function autorizar(req: Request, env: EnvOauth, pessoa: string, agora = Date.now()): Promise<Response> {
  if (req.method === "POST") {
    const f = await lerForm(req);
    if (!f) return pagina("<p>Pedido inválido.</p>", 400);
    const id = String(f.get("pedido") ?? "");
    const p = await env.DB.prepare("SELECT client_id, pessoa, redirect_uri, estado, expira_em FROM oauth_codigos WHERE id = ? AND hash_codigo IS NULL").bind(id).first<{ client_id: string; pessoa: string; redirect_uri: string; estado: string | null; expira_em: string }>();
    // O id só existe na página servida a esta pessoa: um POST forjado de outro site não o conhece (CSRF).
    if (!p || p.pessoa !== pessoa || emMs(p.expira_em) <= agora) return pagina("<p>Pedido vencido ou inválido. Volte ao aplicativo e conecte de novo.</p>", 400);
    if (f.get("decisao") !== "sim") {
      await env.DB.prepare("DELETE FROM oauth_codigos WHERE id = ?").bind(id).run();
      return voltar(p.redirect_uri, { error: "access_denied", state: p.estado });
    }
    const codigo = aleatorio();
    await env.DB.prepare("UPDATE oauth_codigos SET hash_codigo = ?, expira_em = ? WHERE id = ?").bind(await hashToken(codigo), sqlData(agora + PRAZO_CODIGO_MS), id).run();
    return voltar(p.redirect_uri, { code: codigo, state: p.estado });
  }
  const q = new URL(req.url).searchParams;
  const cli = await env.DB.prepare("SELECT nome, redirect_uris FROM oauth_clientes WHERE client_id = ?").bind(q.get("client_id") ?? "").first<{ nome: string; redirect_uris: string }>();
  const redirect = q.get("redirect_uri") ?? "";
  // Sem cliente ou com redirect fora da lista, não se redireciona para lugar nenhum (open redirect).
  if (!cli || !(JSON.parse(cli.redirect_uris) as string[]).includes(redirect)) return pagina("<p>Cliente ou endereço de retorno não reconhecido.</p>", 400);
  const estado = q.get("state");
  if (q.get("response_type") !== "code") return voltar(redirect, { error: "unsupported_response_type", state: estado });
  const desafio = q.get("code_challenge") ?? "";
  if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(desafio)) return voltar(redirect, { error: "invalid_request", error_description: "PKCE S256 obrigatório", state: estado });
  const id = aleatorio();
  await env.DB.prepare("INSERT INTO oauth_codigos (id, client_id, pessoa, redirect_uri, desafio, estado, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, q.get("client_id"), pessoa, redirect, desafio, estado, sqlData(agora + PRAZO_PEDIDO_MS))
    .run();
  return pagina(`<h1>Conectar ao ness.know</h1>
<p><strong>${esc(cli.nome)}</strong> (<code>${esc(new URL(redirect).host)}</code>) quer consultar o ness.know como <strong>${esc(pessoa)}</strong>.</p>
<p>Acesso de leitura às normas e leis que a ness. liberou para você, por ${VALIDADE_DIAS} dias. Um administrador pode revogar a qualquer momento.</p>
<form method="post"><input type="hidden" name="pedido" value="${esc(id)}"><button class="sim" name="decisao" value="sim">Autorizar</button><button class="nao" name="decisao" value="nao">Recusar</button></form>`);
}

/** UUID determinístico por cliente e pessoa: reautorizar atualiza a mesma chave, e a rota de revogar (que casa UUID) a encontra. */
async function idDaChave(clientId: string, pessoa: string): Promise<string> {
  const h = await hashToken(`${clientId}|${pessoa}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Troca o código por uma chave nesskb_ da pessoa, uma por cliente (reautorizar substitui a anterior). */
export async function token(req: Request, env: EnvOauth, agora = Date.now()): Promise<Response> {
  if (req.method !== "POST") return falha("invalid_request", "use POST", 405);
  const f = await lerForm(req);
  if (!f) return falha("invalid_request", "corpo application/x-www-form-urlencoded esperado");
  if (f.get("grant_type") !== "authorization_code") return falha("unsupported_grant_type", "só authorization_code");
  const hash = await hashToken(String(f.get("code") ?? ""));
  const p = await env.DB.prepare("SELECT client_id, pessoa, redirect_uri, desafio, expira_em FROM oauth_codigos WHERE hash_codigo = ?").bind(hash).first<{ client_id: string; pessoa: string; redirect_uri: string; desafio: string; expira_em: string }>();
  if (!p || emMs(p.expira_em) <= agora) return falha("invalid_grant", "código inválido, usado ou vencido");
  // Confere tudo antes de consumir: quem não tem o verifier não consegue queimar o código de quem tem.
  if (p.client_id !== f.get("client_id") || p.redirect_uri !== f.get("redirect_uri")) return falha("invalid_grant", "client_id ou redirect_uri diferentes do pedido");
  const verificador = new TextEncoder().encode(String(f.get("code_verifier") ?? ""));
  if (b64(new Uint8Array(await crypto.subtle.digest("SHA-256", verificador))) !== p.desafio) return falha("invalid_grant", "code_verifier não confere");
  // Uso único: só um DELETE apaga a linha; uma troca concorrente com o mesmo código não acha nada.
  if (!(await env.DB.prepare("DELETE FROM oauth_codigos WHERE hash_codigo = ?").bind(hash).run()).meta.changes) return falha("invalid_grant", "código já usado");
  const cli = await env.DB.prepare("SELECT nome FROM oauth_clientes WHERE client_id = ?").bind(p.client_id).first<{ nome: string }>();
  const nome = cli?.nome ?? "Cliente MCP";
  const chave = novoToken();
  const expira = sqlData(agora + VALIDADE_DIAS * 86_400_000);
  const r = await env.DB.prepare(
    `INSERT INTO chaves (id, nome, token_hash, pacotes, documentos, criado_por, expira_em, pessoa, cliente_oauth) VALUES (?, ?, ?, '[]', '{}', ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET token_hash = excluded.token_hash, expira_em = excluded.expira_em WHERE chaves.ativo = 1`,
  )
    .bind(await idDaChave(p.client_id, p.pessoa), `${nome} (OAuth)`.slice(0, 100), await hashToken(chave), p.pessoa, expira, p.pessoa, p.client_id)
    .run();
  // Revogada no painel continua revogada: reautorizar não reativa.
  if (!r.meta.changes) return falha("invalid_grant", "esta conexão foi revogada por um administrador do ness.know");
  await env.DB.prepare("INSERT INTO auditoria (ator, acao, detalhe) VALUES (?, 'oauth.conceder', ?)").bind(p.pessoa, `${nome} (${p.client_id}); vence em ${expira.slice(0, 10)}`).run();
  return json({ access_token: chave, token_type: "Bearer", expires_in: VALIDADE_DIAS * 86_400 });
}

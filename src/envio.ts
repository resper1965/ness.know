// Envio de conteúdo pela própria empresa: com uma chave de envio (Bearer nessup_…, só o hash fica no banco), ela lista, envia e apaga
// documentos do SEU pacote, e de nenhum outro. Fora do Access. A chave do /mcp só lê e esta só grava: são tabelas e prefixos diferentes.
import { apagarDocumento, type EnvConhecimento, ingerir, LIMITE_ARQUIVO } from "./busca";
import { hashToken } from "./mcp";

export interface EnvEnvio extends EnvConhecimento {
  /** Falhas de autenticação por IP (a mesma do /mcp). Sem o binding, não há limite. */
  LIMITE_AUTH?: RateLimit;
  /** Chamadas por chave de envio. Sem o binding, não há limite. */
  LIMITE_ENVIO?: RateLimit;
}

const erro = (e: string, status = 400, headers?: HeadersInit) => Response.json({ erro: e }, { status, headers });

/** Token novo: 32 bytes aleatórios em base64url, com prefixo próprio para ser reconhecível em vazamentos. */
export function novoTokenEnvio(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return `nessup_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/**
 * Recebe o arquivo de um formulário e o grava no pacote: confere tamanho e cota, indexa e substitui o documento de mesmo título.
 * É a mesma regra para o administrador e para a chave de envio da empresa.
 */
export async function enviarDocumento(env: EnvConhecimento, slug: string, f: FormData | null, autor: string): Promise<Response> {
  const db = env.DB;
  const arquivo = f?.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return erro("envie o campo 'arquivo'");
  if (arquivo.size > LIMITE_ARQUIVO) return erro("arquivo maior que 15 MB");
  const m = (k: string) => (typeof f?.get(k) === "string" ? String(f.get(k)).trim().slice(0, 300) || undefined : undefined);
  const titulo = m("titulo") ?? arquivo.name;
  // Cota: recarregar o mesmo título substitui o anterior e não conta de novo.
  const cota = (await db.prepare("SELECT cota_documentos AS c FROM pacotes WHERE slug = ?").bind(slug).first<{ c: number | null }>())?.c;
  if (cota != null) {
    const usados = (await db.prepare("SELECT count(DISTINCT titulo) AS n FROM documentos WHERE escopo = 'pacote' AND dono = ? AND titulo != ?").bind(slug, titulo).first<{ n: number }>())?.n ?? 0;
    if (usados >= cota) return erro(`cota de ${cota} documentos do pacote atingida`, 422);
  }
  const r = await ingerir(env, { escopo: "pacote", dono: slug }, { titulo, tipo: m("tipo"), fonte: m("fonte"), versao: m("versao"), vigencia: m("vigencia") }, arquivo, autor);
  if (r.erro) return Response.json(r, { status: 422 });
  // Recarregar o mesmo título substitui a versão anterior: rodar o carregador de novo não duplica trechos.
  const antigos = await db.prepare("SELECT id FROM documentos WHERE escopo = 'pacote' AND dono = ? AND titulo = ? AND id != ?").bind(slug, titulo, r.id).all<{ id: string }>();
  for (const a of antigos.results) await apagarDocumento(env, a.id);
  return Response.json({ ...r, substituidos: antigos.results.length });
}

const auditar = (db: D1Database, ator: string, acao: string, detalhe: string) => db.prepare("INSERT INTO auditoria (ator, acao, detalhe) VALUES (?, ?, ?)").bind(ator, acao, detalhe).run();

/** API da empresa: /api/envio/documentos (GET lista, POST envia) e /api/envio/documentos/:id (DELETE). */
export async function envio(req: Request, env: EnvEnvio, caminho: string): Promise<Response> {
  const db = env.DB;
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const chave = token
    ? await db
        .prepare("SELECT id, nome, pacote FROM chaves_envio WHERE token_hash = ? AND ativo = 1 AND (expira_em IS NULL OR expira_em > datetime('now'))")
        .bind(await hashToken(token))
        .first<{ id: string; nome: string; pacote: string }>()
    : null;
  if (!chave) {
    if (env.LIMITE_AUTH && !(await env.LIMITE_AUTH.limit({ key: req.headers.get("cf-connecting-ip") ?? "sem-ip" })).success) return erro("muitas tentativas; tente de novo em instantes", 429, { "retry-after": "30" });
    return erro("chave de envio inválida, vencida ou revogada", 401);
  }
  if (env.LIMITE_ENVIO && !(await env.LIMITE_ENVIO.limit({ key: chave.id })).success) return erro("limite de requisições da chave excedido; tente de novo em instantes", 429, { "retry-after": "30" });
  const pacote = await db.prepare("SELECT slug, nome, cota_documentos FROM pacotes WHERE slug = ?").bind(chave.pacote).first<{ slug: string; nome: string; cota_documentos: number | null }>();
  if (!pacote) return erro("o pacote desta chave não existe mais", 404);
  await db.prepare("UPDATE chaves_envio SET usado_em = datetime('now') WHERE id = ? AND (usado_em IS NULL OR usado_em < datetime('now', '-1 hour'))").bind(chave.id).run().catch(() => {});
  const ator = `envio:${chave.nome}`;

  if (caminho === "/api/envio/documentos" && req.method === "GET") {
    const documentos = (await db.prepare("SELECT id, titulo, tipo, versao, vigencia, status, erro, criado_em FROM documentos WHERE escopo = 'pacote' AND dono = ? ORDER BY titulo").bind(pacote.slug).all()).results;
    const usados = (await db.prepare("SELECT count(DISTINCT titulo) AS n FROM documentos WHERE escopo = 'pacote' AND dono = ?").bind(pacote.slug).first<{ n: number }>())?.n ?? 0;
    return Response.json({ pacote: { nome: pacote.nome, cota_documentos: pacote.cota_documentos, usados }, documentos });
  }
  if (caminho === "/api/envio/documentos" && req.method === "POST") {
    const r = await enviarDocumento(env, pacote.slug, await req.formData().catch(() => null), ator);
    if (r.ok) {
      const corpo = (await r.clone().json().catch(() => ({}))) as { id?: string };
      const titulo = corpo.id ? (await db.prepare("SELECT titulo FROM documentos WHERE id = ?").bind(corpo.id).first<{ titulo: string }>())?.titulo : "";
      await auditar(db, ator, "envio.enviar", `${pacote.slug}: ${titulo ?? ""}`.slice(0, 300));
    }
    return r;
  }
  const d = caminho.match(/^\/api\/envio\/documentos\/([0-9a-f-]{36})$/);
  if (d && req.method === "DELETE") {
    // Só documento deste pacote: o id de outro pacote responde como inexistente.
    const doc = await db.prepare("SELECT titulo FROM documentos WHERE id = ? AND escopo = 'pacote' AND dono = ?").bind(d[1], pacote.slug).first<{ titulo: string }>();
    if (!doc || !(await apagarDocumento(env, d[1]))) return erro("documento não encontrado", 404);
    await auditar(db, ator, "envio.apagar", `${pacote.slug}: ${doc.titulo}`.slice(0, 300));
    return Response.json({ ok: true });
  }
  return erro("não encontrado", 404);
}

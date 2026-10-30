// API de administração (atrás do Access, só ADMIN_EMAILS): chaves de API, pacotes, documentos, busca de teste e revetorização.
import { apagarDocumento, buscarEm, type EnvConhecimento, ingerir, LIMITE_ARQUIVO, revetorizar } from "./busca";
import { hashToken, novoToken } from "./mcp";

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
type Valido<T> = { ok: true; v: T } | { ok: false; erro: string };
const txt = (x: unknown, max = 200) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const erro = (e: string, status = 400) => Response.json({ erro: e }, { status });

async function corpo(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

export function validarPacote(b: Record<string, unknown>): Valido<{ slug: string; nome: string; descricao: string | null; instrucoes: string; versao: string | null }> {
  const slug = txt(b.slug, 63).toLowerCase();
  const nome = txt(b.nome);
  if (!SLUG.test(slug)) return { ok: false, erro: "slug inválido" };
  if (!nome) return { ok: false, erro: "nome obrigatório" };
  return { ok: true, v: { slug, nome, descricao: txt(b.descricao, 1000) || null, instrucoes: txt(b.instrucoes, 20000), versao: txt(b.versao, 50) || null } };
}

/** Slugs válidos, sem repetição. */
const slugsDe = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string" && SLUG.test(s)))] : []);

async function pacotesQueExistem(db: D1Database, slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const r = await db.prepare(`SELECT slug FROM pacotes WHERE slug IN (${slugs.map(() => "?").join(", ")})`).bind(...slugs).all<{ slug: string }>();
  return r.results.map((x) => x.slug);
}

export async function admin(req: Request, env: EnvConhecimento, email: string, caminho: string): Promise<Response> {
  const db = env.DB;
  const rota = `${req.method} ${caminho}`;

  if (rota === "GET /api/eu") return Response.json({ email });

  // Chaves de API: o token aparece uma vez, na criação; no banco fica só o hash.
  if (rota === "GET /api/chaves") return Response.json((await db.prepare("SELECT id, nome, pacotes, ativo, criado_por, criado_em, usado_em FROM chaves ORDER BY ativo DESC, nome").all()).results);
  if (rota === "POST /api/chaves") {
    const b = await corpo(req);
    const nome = txt(b.nome, 100);
    const pacotes = slugsDe(b.pacotes);
    if (!nome || !pacotes.length) return erro("nome e pacotes obrigatórios");
    const existem = await pacotesQueExistem(db, pacotes);
    const faltam = pacotes.filter((p) => !existem.includes(p));
    if (faltam.length) return erro(`pacote não existe: ${faltam.join(", ")}`, 404);
    const id = crypto.randomUUID();
    const token = novoToken();
    await db.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, criado_por) VALUES (?, ?, ?, ?, ?)").bind(id, nome, await hashToken(token), JSON.stringify(pacotes), email).run();
    return Response.json({ id, nome, pacotes, token });
  }
  const ch = caminho.match(/^\/api\/chaves\/([0-9a-f-]{36})$/);
  if (ch && req.method === "DELETE") {
    const r = await db.prepare("UPDATE chaves SET ativo = 0 WHERE id = ?").bind(ch[1]).run();
    return r.meta.changes ? Response.json({ ok: true }) : erro("chave não encontrada", 404);
  }

  // Pacotes e documentos.
  if (rota === "GET /api/pacotes")
    return Response.json(
      (
        await db
          .prepare(
            "SELECT p.slug, p.nome, p.descricao, p.versao, p.atualizado_em, (SELECT count(*) FROM documentos d WHERE d.escopo = 'pacote' AND d.dono = p.slug AND d.status = 'ok') AS documentos FROM pacotes p ORDER BY p.slug",
          )
          .all()
      ).results,
    );
  if (rota === "POST /api/pacotes") {
    const r = validarPacote(await corpo(req));
    if (!r.ok) return erro(r.erro);
    await db
      .prepare(
        "INSERT INTO pacotes (slug, nome, descricao, instrucoes, versao) VALUES (?, ?, ?, ?, ?) ON CONFLICT (slug) DO UPDATE SET nome = excluded.nome, descricao = excluded.descricao, instrucoes = excluded.instrucoes, versao = excluded.versao, atualizado_em = datetime('now')",
      )
      .bind(r.v.slug, r.v.nome, r.v.descricao, r.v.instrucoes, r.v.versao)
      .run();
    return Response.json({ slug: r.v.slug });
  }
  const pd = caminho.match(/^\/api\/pacotes\/([a-z0-9-]+)\/documentos$/);
  if (pd && req.method === "GET")
    return Response.json(
      (await db.prepare("SELECT id, titulo, tipo, versao, vigencia, fonte, status, erro, criado_em FROM documentos WHERE escopo = 'pacote' AND dono = ? ORDER BY titulo").bind(pd[1]).all()).results,
    );
  if (pd && req.method === "POST") {
    if (!(await pacotesQueExistem(db, [pd[1]])).length) return erro("pacote não existe", 404);
    const f = await req.formData().catch(() => null);
    const arquivo = f?.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size) return erro("envie o campo 'arquivo'");
    if (arquivo.size > LIMITE_ARQUIVO) return erro("arquivo maior que 15 MB");
    const m = (k: string) => (typeof f?.get(k) === "string" ? String(f.get(k)).trim().slice(0, 300) || undefined : undefined);
    const titulo = m("titulo") ?? arquivo.name;
    const r = await ingerir(env, { escopo: "pacote", dono: pd[1] }, { titulo, tipo: m("tipo"), fonte: m("fonte"), versao: m("versao"), vigencia: m("vigencia") }, arquivo, email);
    if (r.erro) return Response.json(r, { status: 422 });
    // Recarregar o mesmo título substitui a versão anterior: rodar o carregador de novo não duplica trechos.
    const antigos = await db.prepare("SELECT id FROM documentos WHERE escopo = 'pacote' AND dono = ? AND titulo = ? AND id != ?").bind(pd[1], titulo, r.id).all<{ id: string }>();
    for (const a of antigos.results) await apagarDocumento(env, a.id);
    return Response.json({ ...r, substituidos: antigos.results.length });
  }
  const doc = caminho.match(/^\/api\/documentos\/([0-9a-f-]{36})$/);
  if (doc && req.method === "DELETE") return (await apagarDocumento(env, doc[1])) ? Response.json({ ok: true }) : erro("documento não encontrado", 404);

  // Busca crua, para a tela de teste e para medir (scripts/avaliar-busca.mjs): origem, seção e nota de cada trecho.
  if (rota === "POST /api/busca") {
    const b = await corpo(req);
    const consulta = txt(b.consulta, 2000);
    if (!consulta) return erro("consulta obrigatória");
    const pedidos = slugsDe(b.pacotes);
    const slugs = pedidos.length ? pedidos : (await db.prepare("SELECT slug FROM pacotes").all<{ slug: string }>()).results.map((x) => x.slug);
    const modo = b.modo === "textual" || b.modo === "semantica" ? b.modo : "hibrida";
    const limite = Math.min(Math.max(Math.floor(Number(b.limite)) || 10, 1), 20);
    const r = await buscarEm(env, slugs.map((dono) => ({ escopo: "pacote" as const, dono })), consulta, {
      limite,
      modo,
      rerank: b.rerank === true,
      minimo: typeof b.minimo === "number" ? b.minimo : undefined,
      pesoTextual: typeof b.peso_textual === "number" ? b.peso_textual : undefined,
    });
    return Response.json(r.map((t) => ({ titulo: t.titulo, versao: t.versao, secao: t.secao ?? null, origem: t.origem, nota: t.nota, trecho: t.trecho })));
  }

  if (rota === "POST /api/vetores") {
    if (!env.VETORES) return erro("índice de vetores não configurado");
    return Response.json(await revetorizar(env, txt((await corpo(req)).apos, 36)));
  }

  return erro("não encontrado", 404);
}

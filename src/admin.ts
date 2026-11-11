// API de administração (atrás do Access, só ADMIN_EMAILS): chaves de API, pacotes, documentos, busca de teste e revetorização.
import { apagarDocumento, buscarEm, type EnvConhecimento, ingerir, LIMITE_ARQUIVO, revetorizar } from "./busca";
import { listaDe } from "./escopo";
import { hashToken, novoToken, restricoesDe } from "./mcp";
import { normasExistem, validarSkill } from "./skills";

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

/** Validade da chave (UTC, "AAAA-MM-DD HH:MM:SS"): `dias` a partir de agora ou `expira_em` AAAA-MM-DD (vale até o fim do dia). Nenhum dos dois = não expira. */
export function validade(b: Record<string, unknown>, agora = Date.now()): Valido<string | null> {
  const { dias, expira_em } = b;
  if (dias === undefined && expira_em === undefined) return { ok: true, v: null };
  if (dias !== undefined && expira_em !== undefined) return { ok: false, erro: "use dias ou expira_em, não os dois" };
  if (dias !== undefined) {
    if (!Number.isInteger(dias) || (dias as number) < 1 || (dias as number) > 3650) return { ok: false, erro: "dias: inteiro de 1 a 3650" };
    return { ok: true, v: new Date(agora + (dias as number) * 86_400_000).toISOString().slice(0, 19).replace("T", " ") };
  }
  const d = typeof expira_em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expira_em) ? expira_em : "";
  const fim = d ? Date.parse(`${d}T23:59:59Z`) : NaN;
  if (Number.isNaN(fim)) return { ok: false, erro: "expira_em: data AAAA-MM-DD" };
  if (fim <= agora) return { ok: false, erro: "expira_em precisa ser uma data futura" };
  return { ok: true, v: `${d} 23:59:59` };
}

/** Slugs válidos, sem repetição. */
const slugsDe = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string" && SLUG.test(s)))] : []);

async function pacotesQueExistem(db: D1Database, slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const r = await db.prepare(`SELECT slug FROM pacotes WHERE slug IN (${slugs.map(() => "?").join(", ")})`).bind(...slugs).all<{ slug: string }>();
  return r.results.map((x) => x.slug);
}

/**
 * Restrição por norma: {slug: [títulos]}, só para pacotes da chave, com títulos que existem no pacote. Lista com todas as
 * normas do pacote vira "pacote inteiro" (sem restrição), para incluir normas carregadas depois.
 */
export async function validarRestricoes(db: D1Database, pacotes: string[], bruto: unknown): Promise<Valido<Record<string, string[]>>> {
  const pedido = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? restricoesDe(JSON.stringify(bruto)) : {};
  const v: Record<string, string[]> = {};
  for (const [slug, lista] of Object.entries(pedido)) {
    if (!pacotes.includes(slug)) return { ok: false, erro: `restrição para pacote fora da chave: ${slug}` };
    const titulos = [...new Set(lista.map((t) => t.trim()).filter(Boolean))];
    if (!titulos.length) return { ok: false, erro: `escolha ao menos uma norma de ${slug}, ou tire o pacote da chave` };
    const existem = (await db.prepare("SELECT DISTINCT titulo FROM documentos WHERE escopo = 'pacote' AND dono = ? AND status = 'ok'").bind(slug).all<{ titulo: string }>()).results.map((x) => x.titulo);
    const faltam = titulos.filter((t) => !existem.includes(t));
    if (faltam.length) return { ok: false, erro: `norma não existe em ${slug}: ${faltam.join(", ")}` };
    if (titulos.length < existem.length) v[slug] = titulos;
  }
  return { ok: true, v };
}

const auditar = (db: D1Database, ator: string, acao: string, detalhe: string) => db.prepare("INSERT INTO auditoria (ator, acao, detalhe) VALUES (?, ?, ?)").bind(ator, acao, detalhe).run();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pacotes e restrições de uma regra de acesso, já conferidos contra o que existe. */
async function regraDe(db: D1Database, b: Record<string, unknown>): Promise<Valido<{ pacotes: string[]; documentos: Record<string, string[]> }>> {
  const pacotes = slugsDe(b.pacotes);
  const existem = await pacotesQueExistem(db, pacotes);
  const faltam = pacotes.filter((p) => !existem.includes(p));
  if (faltam.length) return { ok: false, erro: `pacote não existe: ${faltam.join(", ")}` };
  const r = await validarRestricoes(db, pacotes, b.documentos);
  return r.ok ? { ok: true, v: { pacotes, documentos: r.v } } : r;
}

export async function admin(req: Request, env: EnvConhecimento, email: string, caminho: string): Promise<Response> {
  const db = env.DB;
  const rota = `${req.method} ${caminho}`;

  if (rota === "GET /api/eu") return Response.json({ email });

  // Chaves de API: o token aparece uma vez, na criação; no banco fica só o hash.
  if (rota === "GET /api/chaves") return Response.json((await db.prepare("SELECT id, nome, pacotes, documentos, ativo, criado_por, criado_em, usado_em, expira_em, pessoa, cliente_oauth, CASE WHEN pessoa IS NULL THEN 'agente' ELSE 'oauth' END AS origem, (SELECT coalesce(sum(chamadas), 0) FROM uso_chaves u WHERE u.chave_id = chaves.id AND u.dia >= date('now', '-30 days')) AS chamadas_30d FROM chaves ORDER BY ativo DESC, nome").all()).results);
  if (rota === "POST /api/chaves") {
    const b = await corpo(req);
    const nome = txt(b.nome, 100);
    const pacotes = slugsDe(b.pacotes);
    if (!nome || !pacotes.length) return erro("nome e pacotes obrigatórios");
    const existem = await pacotesQueExistem(db, pacotes);
    const faltam = pacotes.filter((p) => !existem.includes(p));
    if (faltam.length) return erro(`pacote não existe: ${faltam.join(", ")}`, 404);
    const r = await validarRestricoes(db, pacotes, b.documentos);
    if (!r.ok) return erro(r.erro);
    const val = validade(b);
    if (!val.ok) return erro(val.erro);
    const id = crypto.randomUUID();
    const token = novoToken();
    await db
      .prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, documentos, criado_por, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, nome, await hashToken(token), JSON.stringify(pacotes), JSON.stringify(r.v), email, val.v)
      .run();
    return Response.json({ id, nome, pacotes, documentos: r.v, expira_em: val.v, token });
  }
  const ch = caminho.match(/^\/api\/chaves\/([0-9a-f-]{36})$/);
  if (ch && req.method === "DELETE") {
    const r = await db.prepare("UPDATE chaves SET ativo = 0 WHERE id = ?").bind(ch[1]).run();
    if (r.meta.changes) await auditar(db, email, "chave.revogar", ch[1]);
    return r.meta.changes ? Response.json({ ok: true }) : erro("chave não encontrada", 404);
  }

  // Acesso por pessoa (chaves emitidas por OAuth): "padrão para todos" e regras por e-mail. Vale já na próxima chamada, sem reemitir chave.
  if (rota === "GET /api/acesso") {
    const linhas = (await db.prepare("SELECT tipo, sujeito, pacotes, documentos, criado_por, criado_em FROM acesso_regras ORDER BY tipo, sujeito").all<{ tipo: string; sujeito: string; pacotes: string; documentos: string; criado_por: string | null; criado_em: string }>()).results;
    const forma = (r: (typeof linhas)[number]) => ({ pacotes: listaDe(r.pacotes), documentos: restricoesDe(r.documentos), criado_por: r.criado_por, criado_em: r.criado_em });
    const padrao = linhas.find((r) => r.tipo === "padrao");
    return Response.json({
      padrao: padrao ? forma(padrao) : { pacotes: [], documentos: {}, criado_por: null, criado_em: null },
      pessoas: linhas.filter((r) => r.tipo === "pessoa").map((r) => ({ email: r.sujeito, ...forma(r) })),
    });
  }
  const ac = caminho.match(/^\/api\/acesso\/(padrao|pessoa\/([^/]+))$/);
  if (ac && req.method === "PUT") {
    const tipo = ac[2] === undefined ? "padrao" : "pessoa";
    const sujeito = tipo === "padrao" ? "" : decodeURIComponent(ac[2]).trim().toLowerCase().slice(0, 200);
    if (tipo === "pessoa" && !EMAIL.test(sujeito)) return erro("e-mail inválido");
    const r = await regraDe(db, await corpo(req));
    if (!r.ok) return erro(r.erro, r.erro.startsWith("pacote não existe") ? 404 : 400);
    await db
      .prepare("INSERT INTO acesso_regras (tipo, sujeito, pacotes, documentos, criado_por) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tipo, sujeito) DO UPDATE SET pacotes = excluded.pacotes, documentos = excluded.documentos, criado_por = excluded.criado_por, criado_em = datetime('now')")
      .bind(tipo, sujeito, JSON.stringify(r.v.pacotes), JSON.stringify(r.v.documentos), email)
      .run();
    await auditar(db, email, "acesso.definir", `${tipo === "padrao" ? "padrão" : sujeito}: ${r.v.pacotes.join(", ") || "nenhum pacote"}`);
    return Response.json({ ok: true });
  }
  if (ac && ac[2] !== undefined && req.method === "DELETE") {
    const sujeito = decodeURIComponent(ac[2]).trim().toLowerCase();
    const r = await db.prepare("DELETE FROM acesso_regras WHERE tipo = 'pessoa' AND sujeito = ?").bind(sujeito).run();
    if (r.meta.changes) await auditar(db, email, "acesso.remover", sujeito);
    return r.meta.changes ? Response.json({ ok: true }) : erro("regra não encontrada", 404);
  }
  if (rota === "GET /api/auditoria") return Response.json((await db.prepare("SELECT quando, ator, acao, detalhe FROM auditoria ORDER BY id DESC LIMIT 100").all()).results);

  // Pacotes e documentos.
  if (rota === "GET /api/pacotes")
    return Response.json(
      (
        await db
          .prepare(
            "SELECT p.slug, p.nome, p.descricao, p.versao, p.atualizado_em, p.cota_documentos, (SELECT count(*) FROM documentos d WHERE d.escopo = 'pacote' AND d.dono = p.slug AND d.status = 'ok') AS documentos, (SELECT json_group_array(titulo) FROM (SELECT d.titulo FROM documentos d WHERE d.escopo = 'pacote' AND d.dono = p.slug AND d.status = 'ok' ORDER BY d.titulo)) AS titulos FROM pacotes p ORDER BY p.slug",
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
  const pc = caminho.match(/^\/api\/pacotes\/([a-z0-9-]+)\/cota$/);
  if (pc && req.method === "PUT") {
    const c = (await corpo(req)).cota_documentos;
    if (c !== null && (!Number.isInteger(c) || (c as number) < 1 || (c as number) > 100000)) return erro("cota_documentos: inteiro de 1 a 100000, ou null para sem limite");
    const r = await db.prepare("UPDATE pacotes SET cota_documentos = ? WHERE slug = ?").bind(c, pc[1]).run();
    if (!r.meta.changes) return erro("pacote não existe", 404);
    await auditar(db, email, "pacote.cota", `${pc[1]}: ${c ?? "sem limite"}`);
    return Response.json({ ok: true });
  }
  // Saída de uma empresa: apaga o pacote e todos os documentos (arquivo, trechos e vetores). Recusa enquanto algo ainda o usa.
  const pe = caminho.match(/^\/api\/pacotes\/([a-z0-9-]+)$/);
  if (pe && req.method === "DELETE") {
    const slug = pe[1];
    if (!(await pacotesQueExistem(db, [slug])).length) return erro("pacote não existe", 404);
    const usa = (sql: string) => db.prepare(sql).bind(slug).all<Record<string, string>>().then((r) => r.results);
    const [chaves, regras, skills] = await Promise.all([
      usa("SELECT id, nome FROM chaves WHERE ativo = 1 AND EXISTS (SELECT 1 FROM json_each(chaves.pacotes) WHERE value = ?)"),
      usa("SELECT tipo, sujeito FROM acesso_regras WHERE EXISTS (SELECT 1 FROM json_each(acesso_regras.pacotes) WHERE value = ?)"),
      usa("SELECT nome FROM skills WHERE EXISTS (SELECT 1 FROM json_each(skills.normas) WHERE key = ?)"),
    ]);
    if (chaves.length || regras.length || skills.length)
      return Response.json({ erro: "o pacote ainda é usado: revogue as chaves, tire-o das regras de acesso e das skills antes de excluir", chaves, regras, skills }, { status: 409 });
    const docs = (await db.prepare("SELECT id FROM documentos WHERE escopo = 'pacote' AND dono = ?").bind(slug).all<{ id: string }>()).results;
    for (const d of docs) await apagarDocumento(env, d.id); // se um falhar, o erro sobe e o pacote fica: basta repetir
    await db.prepare("DELETE FROM pacotes WHERE slug = ?").bind(slug).run();
    await auditar(db, email, "pacote.excluir", `${slug}: ${docs.length} documentos`);
    return Response.json({ ok: true, documentos: docs.length });
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
    // Cota: recarregar o mesmo título substitui o anterior e não conta de novo.
    const cota = (await db.prepare("SELECT cota_documentos AS c FROM pacotes WHERE slug = ?").bind(pd[1]).first<{ c: number | null }>())?.c;
    if (cota != null) {
      const usados = (await db.prepare("SELECT count(DISTINCT titulo) AS n FROM documentos WHERE escopo = 'pacote' AND dono = ? AND titulo != ?").bind(pd[1], titulo).first<{ n: number }>())?.n ?? 0;
      if (usados >= cota) return erro(`cota de ${cota} documentos do pacote atingida`, 422);
    }
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

  // STRM em produção, só leitura: base de scripts/conferir-strm.mjs (conferência contra as planilhas da versão anterior).
  if (rota === "GET /api/strm/frameworks")
    return Response.json((await db.prepare("SELECT f.id, f.nome, f.versao_scf, f.itens, (SELECT count(*) FROM strm s WHERE s.framework = f.id) AS ligacoes FROM strm_frameworks f ORDER BY f.id").all()).results);
  const st = caminho.match(/^\/api\/strm\/([^/]+)$/);
  if (st && req.method === "GET") {
    const linhas = (await db.prepare("SELECT item, item_nome, relacao, forca, scf FROM strm WHERE framework = ? ORDER BY rowid").bind(decodeURIComponent(st[1])).all()).results;
    return linhas.length ? Response.json(linhas) : erro("framework não encontrado", 404);
  }

  // Skills: procedimentos que o agente segue ao usar as normas (ver docs/skills-plano.md).
  if (rota === "GET /api/skills")
    return Response.json((await db.prepare("SELECT nome, descricao, normas, buscas, versao, atualizado_em, length(corpo) AS tamanho FROM skills ORDER BY nome").all()).results);
  if (rota === "POST /api/skills") {
    const r = validarSkill(await corpo(req));
    if (!r.ok) return erro(r.erro);
    const falta = await normasExistem(db, r.v.normas);
    if (falta) return erro(falta);
    await db
      .prepare(
        "INSERT INTO skills (nome, descricao, normas, buscas, corpo, versao) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (nome) DO UPDATE SET descricao = excluded.descricao, normas = excluded.normas, buscas = excluded.buscas, corpo = excluded.corpo, versao = excluded.versao, atualizado_em = datetime('now')",
      )
      .bind(r.v.nome, r.v.descricao, JSON.stringify(r.v.normas), JSON.stringify(r.v.buscas), r.v.corpo, r.v.versao)
      .run();
    return Response.json({ nome: r.v.nome });
  }
  const sk = caminho.match(/^\/api\/skills\/([a-z0-9-]+)$/);
  if (sk && req.method === "DELETE") {
    const r = await db.prepare("DELETE FROM skills WHERE nome = ?").bind(sk[1]).run();
    return r.meta.changes ? Response.json({ ok: true }) : erro("skill não encontrada", 404);
  }

  return erro("não encontrado", 404);
}

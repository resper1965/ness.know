// Ransomware.live (API PRO): vítimas anunciadas em sites de vazamento dos grupos de ransomware. São alegações dos criminosos, não incidentes confirmados.
// Coleta em lote de hora em hora (o limite deles é 60 chamadas por minuto e o dado é cacheado por 30 minutos). Guarda quem, onde e quando; não guarda a descrição
// escrita pelo grupo (pode trazer dados do vazamento) nem o endereço onion do post.
import { type Adaptador, baixar, gravarEmLotes, hostOk, limpar, selo, type Selo } from "./base";
import { dataIso } from "./indicadores";

export const RETENCAO_VITIMAS_DIAS = 180;
const UM_DIA = 86_400_000;
const PAGINA = 20;
const NOTA = "Alegações publicadas por grupos criminosos em sites de vazamento: não são incidentes confirmados e o nome de uma vítima não prova que o ambiente de um cliente foi afetado. Dados da Ransomware.live, para uso interno da NESS: não os repasse a terceiros e cite a fonte. Cruzar com os clientes é papel do ness.OS.";

const setorOk = (v: unknown) => {
  const s = limpar(v, 80);
  return s && !/^(not found|unknown|n\/a)$/i.test(s) ? s : null;
};

/** Vítimas recentes (as 100 mais novas). Uma chamada por hora cobre o fluxo diário com folga. */
export const ransomwareLive: Adaptador = async (c) => {
  const chave = c.env.RANSOMWARE_LIVE_API_KEY;
  if (!chave) throw new Error("RANSOMWARE_LIVE_API_KEY não configurada no Worker (chave da API PRO em my.ransomware.live)");
  const r = await baixar(c.buscar, c.fonte.url, null, { "x-api-key": chave, accept: "application/json" });
  const j = (await r?.json().catch(() => null)) as { victims?: unknown } | null;
  if (!j || !Array.isArray(j.victims)) throw new Error("resposta da Ransomware.live fora do formato esperado");
  const t = c.agora.toISOString();
  const stmts: D1PreparedStatement[] = [];
  const vistos = new Set<string>();
  for (const v of j.victims as any[]) {
    const id = limpar(v?.id, 200);
    const grupo = limpar(v?.group, 80);
    const vitima = limpar(v?.victim, 200);
    const descoberta = dataIso(v?.discovered);
    if (!id || !grupo || !vitima || !descoberta || vistos.has(id)) continue;
    vistos.add(id);
    const pais = /^[A-Za-z]{2}$/.test(String(v?.country ?? "")) ? String(v.country).toUpperCase() : null;
    stmts.push(
      c.db
        .prepare(
          `INSERT INTO vitimas_ransomware (id, grupo, vitima, dominio, pais, setor, descoberta, ataque, url, primeiro_visto, ultimo_visto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET grupo = excluded.grupo, vitima = excluded.vitima, dominio = excluded.dominio, pais = excluded.pais, setor = excluded.setor,
             descoberta = excluded.descoberta, ataque = excluded.ataque, url = excluded.url, ultimo_visto = excluded.ultimo_visto`,
        )
        .bind(id, grupo, vitima, limpar(v?.website, 200) || null, pais, setorOk(v?.activity), descoberta, dataIso(v?.attackdate), hostOk(v?.permalink, ["www.ransomware.live"]) ? String(v.permalink).slice(0, 300) : null, t, t),
    );
  }
  if (!stmts.length) throw new Error("Ransomware.live sem vítimas válidas na resposta");
  await gravarEmLotes(c.db, stmts);
  return { alterado: true, itens: stmts.length };
};

const curinga = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
const top = async (db: D1Database, coluna: "grupo" | "pais" | "setor", cond: string, binds: unknown[]) =>
  (await db.prepare(`SELECT ${coluna} AS nome, count(*) AS n FROM vitimas_ransomware WHERE ${cond} AND ${coluna} IS NOT NULL GROUP BY ${coluna} ORDER BY n DESC, nome LIMIT 10`).bind(...binds).all<{ nome: string; n: number }>()).results;

export async function ransomwareAtividade(db: D1Database, args: Record<string, unknown>, agora: Date): Promise<{ erro: string } | Record<string, unknown>> {
  const onde: string[] = [];
  const binds: unknown[] = [];
  const grupo = typeof args.grupo === "string" ? args.grupo.trim().slice(0, 80) : "";
  const setor = typeof args.setor === "string" ? args.setor.trim().slice(0, 80) : "";
  if (grupo) (onde.push("grupo LIKE ? ESCAPE '\\'"), binds.push(curinga(grupo)));
  if (setor) (onde.push("setor LIKE ? ESCAPE '\\'"), binds.push(curinga(setor)));
  if (args.pais !== undefined && args.pais !== null && args.pais !== "") {
    const pais = String(args.pais).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(pais)) return { erro: "pais deve ter 2 letras (ISO 3166-1, ex.: BR)" };
    onde.push("pais = ?");
    binds.push(pais);
  }
  let desde = new Date(agora.getTime() - 30 * UM_DIA).toISOString();
  if (args.desde !== undefined && args.desde !== null && args.desde !== "") {
    const ms = typeof args.desde === "string" ? Date.parse(args.desde) : NaN;
    if (!Number.isFinite(ms)) return { erro: "desde deve ser uma data (AAAA-MM-DD)" };
    desde = new Date(ms).toISOString();
  }
  onde.push("descoberta >= ?");
  binds.push(desde);
  const cond = onde.join(" AND ");
  const pagina = Math.max(Math.floor(Number(args.pagina)) || 1, 1);
  const total = (await db.prepare(`SELECT count(*) AS n FROM vitimas_ransomware WHERE ${cond}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const vitimas = (await db.prepare(`SELECT grupo, vitima, dominio, pais, setor, descoberta, ataque, url FROM vitimas_ransomware WHERE ${cond} ORDER BY descoberta DESC, id LIMIT ${PAGINA} OFFSET ${(pagina - 1) * PAGINA}`).bind(...binds).all()).results;
  const fonte = (await selo(db, "ransomware-live", agora)) as Selo;
  return {
    desde,
    filtros: { grupo: grupo || null, setor: setor || null, pais: args.pais ? String(args.pais).toUpperCase() : null },
    total,
    resumo: total ? { por_grupo: await top(db, "grupo", cond, binds), por_pais: await top(db, "pais", cond, binds), por_setor: await top(db, "setor", cond, binds) } : null,
    pagina,
    por_pagina: PAGINA,
    vitimas,
    ...(total ? {} : { aviso: "Nenhuma vítima com esses filtros na base local (os dados cobrem os últimos 180 dias, a partir da entrada em operação da coleta). Isso não significa que não haja." }),
    fontes: [fonte],
    nota: NOTA,
  };
}

export const purgarVitimas = (db: D1Database, agora: Date) =>
  db.prepare("DELETE FROM vitimas_ransomware WHERE descoberta < ?").bind(new Date(agora.getTime() - RETENCAO_VITIMAS_DIAS * UM_DIA).toISOString());

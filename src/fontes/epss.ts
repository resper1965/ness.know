// EPSS (FIRST): probabilidade de exploração. Guarda só os CVEs que estão no KEV (o arquivo diário tem ~400 mil linhas); os outros vêm da API ao vivo, com cache.
import { type Adaptador, baixar, gravarEmLotes } from "./base";

export const epss: Adaptador = async ({ db, fonte, buscar }) => {
  const r = await baixar(buscar, fonte.url);
  if (!r?.body) throw new Error("EPSS sem conteúdo");
  const csv = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
  const linhas = csv.split("\n");
  const cab = linhas[0]?.match(/score_date:([^,\s]+)/)?.[1];
  if (!cab || linhas[1]?.trim() !== "cve,epss,percentile") throw new Error("arquivo do EPSS fora do formato esperado");
  if (cab === fonte.versao) return { alterado: false, itens: fonte.itens };
  const doKev = new Set((await db.prepare("SELECT cve FROM kev").all<{ cve: string }>()).results.map((x) => x.cve));
  if (!doKev.size) throw new Error("KEV ainda não carregado: o EPSS espera o catálogo");
  const stmts: D1PreparedStatement[] = [];
  for (let i = 2; i < linhas.length; i++) {
    const [cve, score, percentil] = linhas[i].split(",");
    if (!doKev.has(cve)) continue;
    const s = Number(score);
    const p = Number(percentil);
    if (!Number.isFinite(s) || !Number.isFinite(p)) continue;
    stmts.push(
      db
        .prepare("INSERT INTO epss (cve, score, percentil, data_modelo) VALUES (?, ?, ?, ?) ON CONFLICT (cve) DO UPDATE SET score = excluded.score, percentil = excluded.percentil, data_modelo = excluded.data_modelo")
        .bind(cve, s, p, cab),
    );
  }
  await gravarEmLotes(db, stmts);
  return { alterado: true, itens: stmts.length, versao: cab };
};

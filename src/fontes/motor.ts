// Motor das fontes externas: o cron chama executarFontes a cada 15 minutos; cada fonte roda quando vence a própria frequência.
// Download condicional (ETag ou versão), regravação só quando muda, e toda resposta leva fonte, versão, data e frescor.
import { avisosFortinet, avisosMsrc } from "./avisos";
import { type Adaptador, type EnvFontes, type Fonte, limpar } from "./base";
import { epss } from "./epss";
import { feodo, malwarebazaar, threatfox, urlhaus } from "./indicadores";
import { kev } from "./kev";

/** Uma linha em `fontes` + um adaptador aqui = fonte nova (docs/fontes.md). */
export const ADAPTADORES: Record<string, Adaptador> = { kev, epss, msrc: avisosMsrc, fortinet: avisosFortinet, feodo, threatfox, urlhaus, malwarebazaar };

const RETENCAO_DIAS = 90;
const TOLERANCIA_MS = 5 * 60_000; // o cron não cai no segundo exato

export async function executarFontes(env: EnvFontes, opcoes: { agora?: Date; buscar?: typeof fetch; so?: string } = {}): Promise<void> {
  const db = env.DB;
  const buscar = opcoes.buscar ?? fetch;
  const fontes = (await db.prepare("SELECT * FROM fontes WHERE ativa = 1 ORDER BY ordem, id").all<Fonte>()).results;
  for (const fonte of fontes) {
    if (opcoes.so && fonte.id !== opcoes.so) continue;
    const agora = opcoes.agora ?? new Date();
    const vence = !fonte.ultima_tentativa || agora.getTime() - Date.parse(fonte.ultima_tentativa) >= fonte.frequencia_min * 60_000 - TOLERANCIA_MS;
    const adaptador = ADAPTADORES[fonte.id];
    if (!vence || !adaptador) continue;
    const inicio = agora.toISOString();
    try {
      const r = await adaptador({ env, db, fonte, buscar, agora });
      await db.batch([
        db
          .prepare("UPDATE fontes SET ultima_tentativa = ?, ultimo_sucesso = ?, ultimo_erro = NULL, erro_msg = NULL, versao = ?, detalhe = ?, etag = ?, itens = ? WHERE id = ?")
          .bind(inicio, inicio, r.versao ?? fonte.versao, r.detalhe ?? fonte.detalhe, r.etag ?? fonte.etag, r.itens, fonte.id),
        db.prepare("INSERT INTO coletas (fonte, inicio, fim, status, alterado, itens) VALUES (?, ?, ?, 'ok', ?, ?)").bind(fonte.id, inicio, new Date().toISOString(), r.alterado ? 1 : 0, r.itens),
      ]);
    } catch (e) {
      const msg = limpar(e instanceof Error ? e.message : e, 300);
      console.error("fonte", fonte.id, msg);
      await db
        .batch([
          db.prepare("UPDATE fontes SET ultima_tentativa = ?, ultimo_erro = ?, erro_msg = ? WHERE id = ?").bind(inicio, inicio, msg, fonte.id),
          db.prepare("INSERT INTO coletas (fonte, inicio, fim, status, erro) VALUES (?, ?, ?, 'erro', ?)").bind(fonte.id, inicio, new Date().toISOString(), msg),
        ])
        .catch(() => {});
    }
  }
  await purgar(db, opcoes.agora ?? new Date());
}

/** Histórico de 90 dias: o que saiu da fonte fica marcado e só depois é apagado. */
export async function purgar(db: D1Database, agora: Date): Promise<void> {
  const corte = new Date(agora.getTime() - RETENCAO_DIAS * 86_400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM coletas WHERE inicio < ?").bind(corte),
    db.prepare("DELETE FROM kev WHERE removido_em IS NOT NULL AND removido_em < ?").bind(corte),
    db.prepare("DELETE FROM cache WHERE expira_em < ?").bind(agora.toISOString()),
    // Indicador que passou do prazo ou saiu da fonte fica marcado como expirado; só some 90 dias depois.
    db.prepare("UPDATE indicadores SET expirado = 1 WHERE expirado = 0 AND expira_em < ?").bind(agora.toISOString()),
    db.prepare("DELETE FROM indicadores WHERE expirado = 1 AND expira_em < ?").bind(corte),
  ]);
}


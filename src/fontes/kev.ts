// CISA KEV: catálogo de vulnerabilidades exploradas (domínio público). Baixa condicional, compara a versão do catálogo e só regrava se mudou.
import { type Adaptador, baixar, gravarEmLotes, limpar } from "./base";

interface ItemKev {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  forensicTriage?: string;
  notes?: string;
  cwes?: string[];
}
export interface CatalogoKev {
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: ItemKev[];
}

const CVE = /^CVE-\d{4}-\d{4,}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Confere o feed contra os campos obrigatórios do schema publicado pela CISA (draft-07) antes de tocar no banco.
 * shortcut: validação escrita à mão para os campos que o catálogo usa, sem ajv (peso no Worker); se a CISA mudar o schema, o teste com o feed real avisa.
 */
export function validarKev(j: unknown): CatalogoKev {
  const c = j as Partial<CatalogoKev> | null;
  if (!c || typeof c.catalogVersion !== "string" || typeof c.dateReleased !== "string" || !Array.isArray(c.vulnerabilities)) throw new Error("feed do KEV fora do schema: faltam catalogVersion, dateReleased ou vulnerabilities");
  if (c.count !== c.vulnerabilities.length) throw new Error(`feed do KEV inconsistente: count ${c.count} e ${c.vulnerabilities.length} itens`);
  if (!c.vulnerabilities.length) throw new Error("feed do KEV vazio");
  for (const v of c.vulnerabilities) {
    if (!CVE.test(String(v?.cveID)) || !v.vendorProject || !v.product || !v.vulnerabilityName || !DATA.test(String(v.dateAdded))) throw new Error(`item do KEV fora do schema: ${limpar(JSON.stringify(v), 120)}`);
  }
  return c as CatalogoKev;
}

export const kev: Adaptador = async ({ db, fonte, buscar, agora }) => {
  const r = await baixar(buscar, fonte.url, fonte.etag);
  if (!r) return { alterado: false, itens: fonte.itens };
  const cat = validarKev(await r.json().catch(() => null));
  const etag = r.headers.get("etag");
  // Mesma versão e mesma data de lançamento: nada a regravar.
  if (cat.catalogVersion === fonte.versao && cat.dateReleased === fonte.detalhe) return { alterado: false, itens: cat.count, etag };
  const t = agora.toISOString();
  const stmts = cat.vulnerabilities.map((v) =>
    db
      .prepare(
        `INSERT INTO kev (cve, fornecedor, produto, nome, descricao, data_inclusao, prazo, acao, ransomware, triagem_forense, notas, cwes, primeiro_visto, ultimo_visto, removido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (cve) DO UPDATE SET fornecedor = excluded.fornecedor, produto = excluded.produto, nome = excluded.nome, descricao = excluded.descricao,
           data_inclusao = excluded.data_inclusao, prazo = excluded.prazo, acao = excluded.acao, ransomware = excluded.ransomware, triagem_forense = excluded.triagem_forense,
           notas = excluded.notas, cwes = excluded.cwes, ultimo_visto = excluded.ultimo_visto, removido_em = NULL`,
      )
      .bind(
        v.cveID,
        limpar(v.vendorProject, 200),
        limpar(v.product, 200),
        limpar(v.vulnerabilityName, 400),
        limpar(v.shortDescription, 1200),
        v.dateAdded,
        DATA.test(String(v.dueDate)) ? v.dueDate : null,
        limpar(v.requiredAction, 800),
        v.knownRansomwareCampaignUse === "Known" ? "Known" : "Unknown",
        limpar(v.forensicTriage, 20) || null,
        limpar(v.notes, 800),
        JSON.stringify((v.cwes ?? []).map((x) => limpar(x, 20)).filter(Boolean)),
        t,
        t,
      ),
  );
  await gravarEmLotes(db, stmts);
  // O que saiu do catálogo fica marcado (90 dias), não apagado na hora.
  await db.prepare("UPDATE kev SET removido_em = ? WHERE ultimo_visto <> ? AND removido_em IS NULL").bind(t, t).run();
  return { alterado: true, itens: cat.count, versao: cat.catalogVersion, detalhe: cat.dateReleased, etag };
};

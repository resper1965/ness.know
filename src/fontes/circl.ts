// CIRCL hashlookup: "este hash é de um arquivo conhecido?" (NSRL e outras bases de arquivos legítimos). Ao vivo, sem chave.
// Licença: dados CC-BY; a página do serviço diz que podem ser usados comercial e não comercialmente, com referência a circl.lu/services/hashlookup/.
// Atenção: achar o hash NÃO diz que o arquivo é seguro nem que é malicioso; não achar também não diz nada.
import { limpar, registrarConsulta, selo, type Selo, viaCache } from "./base";

const BASE = "https://hashlookup.circl.lu/lookup";
const FONTE = "circl-hashlookup";
export const MAX_HASHES_CIRCL = 50;
const SIMULTANEAS = 5;
const NOTA_CIRCL = "CIRCL hashlookup lista arquivos CONHECIDOS (como os da NSRL). Estar na lista não prova que o arquivo é seguro (malware também pode ter hash de arquivo comum), e não estar não prova que é malicioso. Dados CC-BY: cite o CIRCL.";

export interface HashConhecido {
  conhecido: boolean;
  arquivo?: string | null;
  tamanho?: number | null;
  origem?: string | null;
  base?: string | null;
  confianca?: number | null;
  produto?: string | null;
}

const algoritmo = (h: string) => ({ 32: "md5", 40: "sha1", 64: "sha256" } as Record<number, string>)[h.length];

async function consultar(buscar: typeof fetch, hash: string): Promise<HashConhecido> {
  const r = await buscar(`${BASE}/${algoritmo(hash)}/${hash}`, { headers: { accept: "application/json", "user-agent": "ness.know (+https://know.ness.com.br)" }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return { conhecido: false };
  if (!r.ok) throw new Error(`hashlookup.circl.lu respondeu ${r.status}`);
  const j = (await r.json()) as Record<string, any>;
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("resposta fora do formato esperado");
  const tam = Number(j.FileSize);
  const conf = Number(j["hashlookup:trust"]);
  return {
    conhecido: true,
    arquivo: j.FileName ? limpar(j.FileName, 150) : null,
    tamanho: Number.isFinite(tam) ? tam : null,
    origem: j.source ? limpar(j.source, 60) : null,
    base: j.db ? limpar(j.db, 60) : null,
    confianca: Number.isFinite(conf) ? conf : null,
    produto: j.ProductCode?.ProductName ? limpar(j.ProductCode.ProductName, 120) : null,
  };
}

/** Consulta os hashes (MD5, SHA-1 ou SHA-256) no CIRCL, com cache de 24 h. Falha de um hash não derruba os outros. */
export async function hashesConhecidos(db: D1Database, hashes: string[], agora: Date, buscar: typeof fetch): Promise<{ porHash: Map<string, HashConhecido | { indisponivel: true }>; naoConsultados: string[]; fonte: Selo | null }> {
  const unicos = [...new Set(hashes.map((h) => h.toLowerCase()).filter((h) => /^[0-9a-f]+$/.test(h) && algoritmo(h)))];
  const alvo = unicos.slice(0, MAX_HASHES_CIRCL);
  const porHash = new Map<string, HashConhecido | { indisponivel: true }>();
  const t = agora.toISOString();
  let erro: string | undefined;
  for (let i = 0; i < alvo.length; i += SIMULTANEAS) {
    await Promise.all(
      alvo.slice(i, i + SIMULTANEAS).map(async (h) => {
        try {
          porHash.set(h, await viaCache(db, `circl:${h}`, 24 * 60, agora, () => consultar(buscar, h)));
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
          console.warn("circl hashlookup", h, erro);
          porHash.set(h, { indisponivel: true });
        }
      }),
    );
  }
  if (alvo.length) await registrarConsulta(db, FONTE, t, erro, alvo.length - [...porHash.values()].filter((v) => "indisponivel" in v).length);
  return { porHash, naoConsultados: unicos.slice(MAX_HASHES_CIRCL), fonte: alvo.length ? await selo(db, FONTE, agora) : null };
}

/** Acrescenta a cada resultado de hash o campo `hashlookup` (CIRCL). */
export async function enriquecerHashes(db: D1Database, resultados: any[], agora: Date, buscar: typeof fetch): Promise<{ fontes: Selo[]; aviso?: string }> {
  const hashes = resultados.filter((r) => r.tipo === "hash").map((r) => String(r.valor));
  if (!hashes.length) return { fontes: [] };
  const { porHash, naoConsultados, fonte } = await hashesConhecidos(db, hashes, agora, buscar);
  for (const r of resultados) {
    if (r.tipo !== "hash") continue;
    const k = String(r.valor).toLowerCase();
    const x = porHash.get(k);
    if (x) r.hashlookup = "indisponivel" in x ? { indisponivel: true, aviso: "O CIRCL não respondeu agora; não conclua nada deste hash por essa fonte." } : x;
    else if (naoConsultados.includes(k)) r.hashlookup = { indisponivel: true, aviso: `Só os ${MAX_HASHES_CIRCL} primeiros hashes distintos vão ao CIRCL por chamada.` };
  }
  return { fontes: fonte ? [fonte] : [], aviso: NOTA_CIRCL };
}

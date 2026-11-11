// Escopo de uma pessoa no /mcp (chave emitida por OAuth): regras "padrão para todos" + regras dela, avaliadas a cada chamada.

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

export const listaDe = (json: string | null | undefined): string[] => {
  try {
    return (JSON.parse(json || "[]") as unknown[]).filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
};

/** União das regras: pacote liberado inteiro por alguma regra vale inteiro; senão, vale a união dos títulos listados. */
export async function escopoDe(db: D1Database, pessoa: string): Promise<{ pacotes: string[]; documentos: Record<string, string[]> }> {
  const regras = (
    await db
      .prepare("SELECT pacotes, documentos FROM acesso_regras WHERE tipo = 'padrao' OR (tipo = 'pessoa' AND sujeito = ?)")
      .bind(pessoa.toLowerCase())
      .all<{ pacotes: string; documentos: string }>()
  ).results;
  const inteiros = new Set<string>();
  const titulos = new Map<string, Set<string>>();
  for (const r of regras) {
    const restritos = restricoesDe(r.documentos);
    for (const slug of listaDe(r.pacotes)) {
      if (restritos[slug]) titulos.set(slug, new Set([...(titulos.get(slug) ?? []), ...restritos[slug]]));
      else inteiros.add(slug);
    }
  }
  const pacotes = [...new Set([...inteiros, ...titulos.keys()])].sort();
  const documentos = Object.fromEntries([...titulos].filter(([slug]) => !inteiros.has(slug)).map(([slug, t]) => [slug, [...t]]));
  return { pacotes, documentos };
}

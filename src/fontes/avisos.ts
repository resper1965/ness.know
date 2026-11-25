// Avisos de segurança de fabricante: Microsoft (atualizações mensais do MSRC) e Fortinet (PSIRT). Só título, resumo curto, CVEs e link.
import { type Adaptador, baixar, gravarEmLotes, limpar } from "./base";

interface Aviso {
  fonte: string;
  fornecedor: string;
  ref: string;
  titulo: string;
  resumo: string | null;
  url: string;
  cves: string[];
  publicado_em: string | null;
  atualizado_em: string | null;
}

async function gravar(db: D1Database, avisos: Aviso[], agora: Date): Promise<void> {
  const t = agora.toISOString();
  await gravarEmLotes(
    db,
    avisos.map((a) =>
      db
        .prepare(
          `INSERT INTO avisos (id, fonte, fornecedor, ref, titulo, resumo, url, cves, publicado_em, atualizado_em, primeiro_visto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET titulo = excluded.titulo, resumo = excluded.resumo, url = excluded.url, cves = excluded.cves, publicado_em = excluded.publicado_em, atualizado_em = excluded.atualizado_em`,
        )
        .bind(`${a.fonte}:${a.ref}`, a.fonte, a.fornecedor, a.ref, a.titulo, a.resumo, a.url, JSON.stringify(a.cves), a.publicado_em, a.atualizado_em, t),
    ),
  );
}

export const avisosMsrc: Adaptador = async ({ db, fonte, buscar, agora }) => {
  const r = await baixar(buscar, fonte.url, null, { accept: "application/json" });
  const j = (await r?.json().catch(() => null)) as { value?: { ID?: string; DocumentTitle?: string; InitialReleaseDate?: string; CurrentReleaseDate?: string }[] } | null;
  if (!j || !Array.isArray(j.value)) throw new Error("resposta do MSRC fora do formato esperado");
  // Só as atualizações mensais de segurança; o MSRC lista também notas de versão de outros produtos.
  const avisos: Aviso[] = j.value
    .filter((x) => x.ID && /^\d{4}-[A-Za-z]{3}$/.test(x.ID) && /Security Updates$/.test(x.DocumentTitle ?? ""))
    .map((x) => ({
      fonte: "msrc",
      fornecedor: "Microsoft",
      ref: x.ID as string,
      titulo: limpar(x.DocumentTitle, 200),
      resumo: null,
      url: `https://msrc.microsoft.com/update-guide/releaseNote/${x.ID}`,
      cves: [],
      publicado_em: x.InitialReleaseDate ?? null,
      atualizado_em: x.CurrentReleaseDate ?? null,
    }));
  if (!avisos.length) throw new Error("MSRC sem atualizações de segurança na resposta");
  const versao = avisos.map((a) => a.atualizado_em ?? "").sort().at(-1) || null;
  if (versao && versao === fonte.versao) return { alterado: false, itens: fonte.itens };
  await gravar(db, avisos, agora);
  return { alterado: true, itens: avisos.length, versao };
};

const campo = (item: string, tag: string) => item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") ?? "";

export const avisosFortinet: Adaptador = async ({ db, fonte, buscar, agora }) => {
  const r = await baixar(buscar, fonte.url, fonte.etag);
  if (!r) return { alterado: false, itens: fonte.itens };
  const xml = await r.text();
  const avisos: Aviso[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const url = limpar(campo(item, "link"), 300);
    const ref = url.match(/(FG-IR-\d{2}-\d+)/)?.[1];
    if (!ref || !url.startsWith("https://")) continue;
    const desc = campo(item, "description");
    const data = Date.parse(campo(item, "pubDate"));
    avisos.push({
      fonte: "fortinet",
      fornecedor: "Fortinet",
      ref,
      titulo: limpar(campo(item, "title"), 300),
      resumo: limpar(desc, 500) || null,
      url,
      cves: [...new Set(desc.match(/CVE-\d{4}-\d{4,}/g) ?? [])],
      publicado_em: Number.isFinite(data) ? new Date(data).toISOString() : null,
      atualizado_em: null,
    });
  }
  if (!avisos.length) throw new Error("feed da Fortinet sem avisos no formato esperado");
  await gravar(db, avisos, agora);
  return { alterado: true, itens: avisos.length, etag: r.headers.get("etag") };
};

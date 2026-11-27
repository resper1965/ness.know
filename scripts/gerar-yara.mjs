#!/usr/bin/env node
// Gera a base enxuta de regras YARA do signature-base (Neo23x0) para consulta por nome da regra, família de malware ou termo.
// Guarda só METADADOS (nome, descrição curta, autor, data, nota, referência, arquivo); `strings:` e `condition:` NÃO são copiados.
// Licença: Detection Rule License (DRL) 1.1 no repositório, MAS algumas regras trazem outra licença no campo `license` (CC BY-NC, OGL,
// Volexity, CAPE...). Só entram as regras sem campo `license` ou com DRL 1.1; as demais são contadas e deixadas de fora.
//
// Uso: node scripts/gerar-yara.mjs <pasta-do-repositorio-signature-base> <commit> [saida.json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ATRIBUICAO = "Regras YARA do signature-base (Neo23x0, github.com/Neo23x0/signature-base) e dos autores de cada regra, sob a Detection Rule License (DRL) 1.1. Só entram regras sem licença própria ou com DRL 1.1. Aqui só metadados; o autor acompanha cada regra e o arquivo original é a fonte.";
const aparar = (s, max) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const valor = (bloco, chave) => bloco.match(new RegExp(`^\\s*${chave}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m"))?.[1];
const DRL = /Detection Rule License/i;

/** @returns {{ regras: object[], excluidas: number }} */
export function lerArquivo(texto, arquivo) {
  const regras = [];
  let excluidas = 0;
  const partes = texto.replace(/\r/g, "").split(/^(?=(?:(?:private|global)\s+)*rule\s+\w+)/m);
  for (const p of partes) {
    const cab = p.match(/^(?:(?:private|global)\s+)*rule\s+(\w+)\s*(?::\s*([^{]+?))?\s*\{/);
    if (!cab) continue;
    const meta = p.match(/\bmeta\s*:([\s\S]*?)(?=\n\s*(?:strings|condition)\s*:)/)?.[1] ?? "";
    const lic = valor(meta, "license");
    if (lic && !DRL.test(lic)) {
      excluidas++;
      continue;
    }
    const r = { nome: cab[1], arquivo };
    const tags = (cab[2] ?? "").split(/\s+/).filter(Boolean);
    if (tags.length) r.tags = tags.slice(0, 8);
    const desc = valor(meta, "description");
    if (desc) r.desc = aparar(desc, 200);
    const autor = valor(meta, "author");
    r.autor = autor ? aparar(autor, 120) : null;
    const data = valor(meta, "date");
    if (data && /^\d{4}-\d{2}-\d{2}/.test(data)) r.data = data.slice(0, 10);
    const nota = Number(meta.match(/^\s*score\s*=\s*(\d+)/m)?.[1]);
    if (Number.isFinite(nota)) r.nota = nota;
    const ref = valor(meta, "reference");
    if (ref && /^https:\/\//.test(ref)) r.ref = ref.slice(0, 300);
    regras.push(r);
  }
  return { regras, excluidas };
}

export function gerar(repo, commit, geradoEm = new Date().toISOString()) {
  const pasta = join(repo, "yara");
  const regras = [];
  let excluidas = 0;
  for (const f of readdirSync(pasta).filter((n) => n.endsWith(".yar")).sort()) {
    const r = lerArquivo(readFileSync(join(pasta, f), "utf8"), `yara/${f}`);
    regras.push(...r.regras);
    excluidas += r.excluidas;
  }
  return { meta: { versao: commit.slice(0, 10), commit, gerado_em: geradoEm, fonte: "signature-base (Neo23x0)", url: "https://github.com/Neo23x0/signature-base", licenca: "DRL 1.1", excluidas_por_licenca: excluidas, atribuicao: ATRIBUICAO }, regras };
}

if (process.argv[1]?.endsWith("gerar-yara.mjs")) {
  const [repo, commit, saida = "src/fontes/dados/yara.json"] = process.argv.slice(2);
  if (!repo || !commit) (console.error("uso: node scripts/gerar-yara.mjs <pasta-do-repositorio-signature-base> <commit> [saida.json]"), process.exit(1));
  const d = gerar(repo, commit);
  writeFileSync(saida, JSON.stringify(d));
  console.log(`${d.regras.length} regras (${d.meta.excluidas_por_licenca} fora por licença própria) -> ${saida}`);
}

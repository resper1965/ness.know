#!/usr/bin/env node
// Gera a base enxuta de regras Sigma (SigmaHQ) para consulta por id, técnica ATT&CK ou termo.
// Guarda só METADADOS (id, título, nível, status, autor, produto, técnicas, arquivo); a lógica de detecção (`detection:`) não é copiada.
// Licença: Detection Rule License (DRL) 1.1. Uso comercial permitido; o autor da regra precisa acompanhar o que mostra a regra, por isso o campo `autor` vai junto.
//
// Uso: node scripts/gerar-sigma.mjs <pasta-do-repositorio-sigma> <commit> [saida.json]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const ATRIBUICAO = "Regras Sigma © SigmaHQ e dos autores de cada regra, sob a Detection Rule License (DRL) 1.1 (github.com/SigmaHQ/sigma). Aqui só metadados; o autor acompanha cada regra e o arquivo original é a fonte.";
const PASTAS = ["rules", "rules-emerging-threats", "rules-threat-hunting", "rules-compliance"];

const aparar = (s, max) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const sem = (v) => String(v ?? "").trim().replace(/^["']|["']$/g, "");

/** Lê só as chaves de topo que interessam; ignora `detection:` e o resto. */
export function lerRegra(yml, arquivo) {
  const linhas = yml.replace(/\r/g, "").split("\n");
  const r = { arquivo };
  let chave = null;
  let bloco = [];
  const fecha = () => {
    if (chave === "tags") r.tags = bloco.filter((l) => /^\s*-\s+/.test(l)).map((l) => sem(l.replace(/^\s*-\s+/, "")));
    else if (chave === "logsource") {
      for (const l of bloco) {
        const m = l.match(/^\s+(product|category|service):\s*(.+)$/);
        if (m) r[m[1]] = sem(m[2]);
      }
    } else if (chave === "description" && bloco.length) r.description = r.description ? r.description : bloco.map((l) => l.trim()).join(" ");
  };
  for (const l of linhas) {
    const m = l.match(/^([a-z_]+):\s*(.*)$/);
    if (m) {
      fecha();
      chave = m[1];
      bloco = [];
      const v = m[2].trim();
      if (["title", "id", "author"].includes(chave)) r[chave] = sem(v);
      else if (["status", "level", "date", "modified"].includes(chave)) r[chave] = sem(v.replace(/\s+#.*$/, "")); // valor curto seguido de comentário do autor
      else if (chave === "description" && v && !/^[>|]/.test(v)) r.description = sem(v);
    } else if (chave) bloco.push(l);
  }
  fecha();
  if (!r.id || !r.title) return null;
  const tags = r.tags ?? [];
  const mitre = [...new Set(tags.map((t) => t.match(/^attack\.(t\d{4}(?:\.\d{3})?)$/i)?.[1]?.toUpperCase()).filter(Boolean))];
  const taticas = [...new Set(tags.map((t) => t.match(/^attack\.([a-z-]+)$/)?.[1]).filter((t) => t && !/^t\d/.test(t)))];
  const cves = [...new Set(tags.map((t) => t.match(/^cve\.(\d{4}-\d{4,})$/i)?.[1]).filter(Boolean).map((c) => `CVE-${c}`))];
  const out = { id: r.id, titulo: aparar(r.title, 160), nivel: r.level ?? null, status: r.status ?? null, autor: aparar(r.author, 120) || null, arquivo };
  if (r.description) out.desc = aparar(r.description, 220);
  if (r.product) out.produto = r.product;
  if (r.category) out.categoria = r.category;
  if (r.service) out.servico = r.service;
  if (mitre.length) out.mitre = mitre;
  if (taticas.length) out.taticas = taticas;
  if (cves.length) out.cves = cves;
  const data = (r.modified || r.date || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) out.data = data;
  return out;
}

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((n) => {
    const p = join(pasta, n);
    return statSync(p).isDirectory() ? arquivos(p) : n.endsWith(".yml") ? [p] : [];
  });
}

export function gerar(repo, commit, geradoEm = new Date().toISOString()) {
  const regras = [];
  for (const pasta of PASTAS) {
    let fs;
    try {
      fs = arquivos(join(repo, pasta)).sort();
    } catch {
      continue;
    }
    for (const f of fs) {
      const r = lerRegra(readFileSync(f, "utf8"), relative(repo, f).replaceAll("\\", "/"));
      if (r) regras.push(r);
    }
  }
  return { meta: { versao: commit.slice(0, 10), commit, gerado_em: geradoEm, fonte: "SigmaHQ", url: "https://github.com/SigmaHQ/sigma", licenca: "DRL 1.1", atribuicao: ATRIBUICAO }, regras };
}

if (process.argv[1]?.endsWith("gerar-sigma.mjs")) {
  const [repo, commit, saida = "src/fontes/dados/sigma.json"] = process.argv.slice(2);
  if (!repo || !commit) (console.error("uso: node scripts/gerar-sigma.mjs <pasta-do-repositorio-sigma> <commit> [saida.json]"), process.exit(1));
  const d = gerar(repo, commit);
  writeFileSync(saida, JSON.stringify(d));
  console.log(`${d.regras.length} regras -> ${saida}`);
}

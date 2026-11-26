#!/usr/bin/env node
// Gera a base enxuta de regras e decoders do Wazuh a partir do ruleset oficial (github.com/wazuh/wazuh, pasta ruleset/).
// Guarda só metadados (id, nível, descrição, grupos, dependências, MITRE, CVE, arquivo); não copia a lógica de detecção das regras (match/regex).
// Licença do ruleset: GPLv2 ("Created by Wazuh, Inc."); a base cita a origem, o commit e a licença em cada resposta.
//
// Uso: node scripts/gerar-wazuh.mjs <pasta-ruleset> <tag> <commit> [saida.json]
//   ex.: node scripts/gerar-wazuh.mjs ../wazuh/ruleset v4.14.11 8305693... src/fontes/dados/wazuh.json
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ATRIBUICAO = "Regras e decoders © Wazuh, Inc., distribuídos sob GPLv2 (github.com/wazuh/wazuh, pasta ruleset/). Aqui só metadados; o arquivo XML original é a fonte.";
const sem = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
const txt = (s, max) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const tags = (corpo, tag) => [...corpo.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1].trim());
const lista = (v) => v.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
const uniq = (v) => [...new Set(v)];

/** @param {string} xml @param {string} arquivo */
export function regras(xml, arquivo) {
  const out = [];
  for (const m of sem(xml).matchAll(/<rule\s+([^>]*)>([\s\S]*?)<\/rule>/g)) {
    const a = m[1];
    const id = a.match(/\bid="(\d+)"/)?.[1];
    if (!id) continue;
    const c = m[2];
    const mitre = uniq(lista(tags(tags(c, "mitre").join(" "), "id")));
    const cves = uniq([...c.matchAll(/<info\s+type="cve">([^<]+)<\/info>/g)].map((x) => (/^CVE-/i.test(x[1].trim()) ? x[1].trim().toUpperCase() : `CVE-${x[1].trim()}`)));
    const r = { id: Number(id), nivel: Number(a.match(/\blevel="(\d+)"/)?.[1] ?? 0), desc: txt(tags(c, "description")[0], 300), arquivo };
    const grupos = uniq(lista(tags(c, "group")));
    if (grupos.length) r.grupos = grupos;
    const decoded = tags(c, "decoded_as");
    if (decoded.length) r.decoder = decoded[0];
    const sid = lista(tags(c, "if_sid")).map(Number).filter(Number.isFinite);
    if (sid.length) r.se_sid = sid;
    const ig = lista(tags(c, "if_group"));
    if (ig.length) r.se_grupo = ig;
    if (mitre.length) r.mitre = mitre;
    if (cves.length) r.cves = cves;
    const freq = a.match(/\bfrequency="(\d+)"/)?.[1];
    const tf = a.match(/\btimeframe="(\d+)"/)?.[1];
    if (freq) r.frequencia = Number(freq);
    if (tf) r.janela_s = Number(tf);
    if (/\boverwrite="yes"/.test(a)) r.sobrescreve = true;
    out.push(r);
  }
  return out;
}

export function decoders(xml, arquivo) {
  const out = [];
  for (const m of sem(xml).matchAll(/<decoder\s+([^>]*)>([\s\S]*?)<\/decoder>/g)) {
    const nome = m[1].match(/\bname="([^"]+)"/)?.[1];
    if (!nome) continue;
    const c = m[2];
    const d = { nome, arquivo };
    const pai = tags(c, "parent")[0];
    if (pai) d.pai = pai;
    const prog = tags(c, "program_name")[0];
    if (prog) d.programa = txt(prog, 120);
    const tipo = tags(c, "type")[0];
    if (tipo) d.tipo = tipo;
    const campos = uniq(lista(tags(c, "order")));
    if (campos.length) d.campos = campos;
    const pre = tags(c, "prematch")[0];
    if (pre) d.prematch = txt(pre, 160);
    out.push(d);
  }
  return out;
}

export function gerar(pasta, tag, commit, geradoEm = new Date().toISOString()) {
  const ler = (sub) => readdirSync(join(pasta, sub)).filter((f) => f.endsWith(".xml")).sort();
  const rs = ler("rules").flatMap((f) => regras(readFileSync(join(pasta, "rules", f), "utf8"), f));
  const ds = ler("decoders").flatMap((f) => decoders(readFileSync(join(pasta, "decoders", f), "utf8"), f));
  rs.sort((a, b) => a.id - b.id);
  return { meta: { versao: tag, commit, gerado_em: geradoEm, fonte: "Wazuh ruleset", url: "https://github.com/wazuh/wazuh/tree/" + tag + "/ruleset", licenca: "GPLv2", atribuicao: ATRIBUICAO }, regras: rs, decoders: ds };
}

if (process.argv[1]?.endsWith("gerar-wazuh.mjs")) {
  const [pasta, tag, commit, saida = "src/fontes/dados/wazuh.json"] = process.argv.slice(2);
  if (!pasta || !tag || !commit) {
    console.error("uso: node scripts/gerar-wazuh.mjs <pasta-ruleset> <tag> <commit> [saida.json]");
    process.exit(1);
  }
  const d = gerar(pasta, tag, commit);
  writeFileSync(saida, JSON.stringify(d));
  console.log(`${d.regras.length} regras, ${d.decoders.length} decoders -> ${saida}`);
}

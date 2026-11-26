#!/usr/bin/env node
// Gera a base enxuta do MITRE ATT&CK (Enterprise) a partir do STIX oficial. O STIX tem ~55 MB e não cabe no Worker; a base enxuta
// (técnicas, grupos, software, mitigações e detecções, com textos curtos) vai no repositório e é revisada em PR a cada release do ATT&CK.
//
// Uso: node scripts/gerar-attack.mjs [stix.json | url] [saida.json]
//   padrão de entrada: https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json
//   padrão de saída:   src/fontes/dados/attack-enterprise.json
// Depois: revise o diff, rode `npm test` e faça o PR. O deploy publica a base nova.
import { readFileSync, writeFileSync } from "node:fs";

export const URL_STIX = "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json";
const ATRIBUICAO = "© The MITRE Corporation. Este trabalho é reproduzido e distribuído com a permissão da MITRE (attack.mitre.org/resources/legal-and-branding/terms-of-use/).";

/** Texto do STIX para leitura corrida: sem citações, links em markdown viram o texto e marcação de código sai. */
export function limpo(s, max) {
  const t = String(s ?? "")
    .replace(/\(Citation:[^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1")
    .replace(/<\/?code>/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const vivo = (o) => o && !o.revoked && !o.x_mitre_deprecated;
const ext = (o) => (o.external_references ?? []).find((r) => r.source_name === "mitre-attack");
const ordenar = (xs, chave) => [...xs].sort((a, b) => String(chave(a)).localeCompare(String(chave(b)), "en", { numeric: true }));

/** @param {any} stix @param {{ commit?: string | null, geradoEm?: string }} [opcoes] */
export function extrair(stix, { commit = null, geradoEm = new Date().toISOString() } = {}) {
  const objs = stix.objects ?? [];
  const porId = new Map(objs.map((o) => [o.id, o]));
  const vivos = objs.filter(vivo);
  const colecao = objs.find((o) => o.type === "x-mitre-collection");
  const idDe = (ref) => {
    const o = porId.get(ref);
    return o && vivo(o) ? ext(o)?.external_id : undefined;
  };

  const taticas = {};
  for (const o of vivos.filter((o) => o.type === "x-mitre-tactic")) taticas[o.x_mitre_shortname] = { id: ext(o)?.external_id, nome: o.name, url: ext(o)?.url };

  const tecnicas = new Map();
  for (const o of vivos.filter((o) => o.type === "attack-pattern" && ext(o)?.external_id)) {
    const id = ext(o).external_id;
    tecnicas.set(o.id, {
      id,
      nome: o.name,
      desc: limpo(o.description, 1200),
      taticas: (o.kill_chain_phases ?? []).filter((k) => k.kill_chain_name === "mitre-attack").map((k) => k.phase_name),
      plataformas: o.x_mitre_platforms ?? [],
      sub_de: o.x_mitre_is_subtechnique ? id.split(".")[0] : null,
      url: ext(o).url,
      mitigacoes: [],
      deteccao: [],
    });
  }

  const grupos = new Map();
  for (const o of vivos.filter((o) => o.type === "intrusion-set" && ext(o)?.external_id)) grupos.set(o.id, { id: ext(o).external_id, nome: o.name, aliases: (o.aliases ?? []).filter((a) => a !== o.name), desc: limpo(o.description, 700), tecnicas: [], software: [], url: ext(o).url });
  const software = new Map();
  for (const o of vivos.filter((o) => (o.type === "malware" || o.type === "tool") && ext(o)?.external_id)) software.set(o.id, { id: ext(o).external_id, nome: o.name, aliases: (o.x_mitre_aliases ?? []).filter((a) => a !== o.name), tipo: o.type === "malware" ? "malware" : "ferramenta", desc: limpo(o.description, 700), tecnicas: [], url: ext(o).url });
  const mitigacoes = {};
  for (const o of vivos.filter((o) => o.type === "course-of-action" && ext(o)?.external_id)) mitigacoes[ext(o).external_id] = { nome: o.name, desc: limpo(o.description, 500) };

  // Estratégias de detecção (a partir do ATT&CK v18): o texto de detecção fica nas análises ligadas a cada estratégia.
  const estrategias = new Map();
  for (const o of vivos.filter((o) => o.type === "x-mitre-detection-strategy")) {
    const analise = (o.x_mitre_analytic_refs ?? []).map((r) => porId.get(r)).find((a) => vivo(a));
    estrategias.set(o.id, { id: ext(o)?.external_id ?? null, nome: o.name, analise: limpo(analise?.description, 400) });
  }

  for (const r of vivos.filter((o) => o.type === "relationship")) {
    const t = tecnicas.get(r.target_ref);
    if (r.relationship_type === "uses") {
      const g = grupos.get(r.source_ref);
      const s = software.get(r.source_ref);
      if (t && g) g.tecnicas.push(t.id);
      else if (t && s) s.tecnicas.push(t.id);
      else if (g && software.has(r.target_ref)) g.software.push(software.get(r.target_ref).id);
    } else if (r.relationship_type === "mitigates" && t) {
      const m = idDe(r.source_ref);
      if (m && mitigacoes[m]) t.mitigacoes.push([m, limpo(r.description, 300)]);
    } else if (r.relationship_type === "detects" && t && estrategias.has(r.source_ref)) {
      t.deteccao.push(estrategias.get(r.source_ref));
    }
  }

  const unicos = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return {
    meta: {
      dominio: "enterprise-attack",
      versao: colecao?.x_mitre_version ?? null,
      modificado: colecao?.modified ?? null,
      fonte: "https://github.com/mitre-attack/attack-stix-data",
      commit,
      gerado_em: geradoEm,
      atribuicao: ATRIBUICAO,
      url: "https://attack.mitre.org/",
    },
    taticas,
    tecnicas: ordenar([...tecnicas.values()], (t) => t.id),
    grupos: ordenar([...grupos.values()].map((g) => ({ ...g, tecnicas: unicos(g.tecnicas), software: unicos(g.software) })), (g) => g.id),
    software: ordenar([...software.values()].map((s) => ({ ...s, tecnicas: unicos(s.tecnicas) })), (s) => s.id),
    mitigacoes,
  };
}

async function main() {
  const [entrada = URL_STIX, saida = "src/fontes/dados/attack-enterprise.json"] = process.argv.slice(2);
  const texto = /^https:\/\//.test(entrada) ? await (await fetch(entrada)).text() : readFileSync(entrada, "utf8");
  const dados = extrair(JSON.parse(texto), { commit: process.env.ATTACK_COMMIT ?? null });
  writeFileSync(saida, JSON.stringify(dados));
  console.log(`ATT&CK ${dados.meta.versao}: ${dados.tecnicas.length} técnicas, ${dados.grupos.length} grupos, ${dados.software.length} software, ${Object.keys(dados.mitigacoes).length} mitigações → ${saida}`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();

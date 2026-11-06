#!/usr/bin/env node
// Confere o STRM carregado no ness.know contra as planilhas da versão anterior (lacuna 3.1 de docs/lacunas.md).
// Só lê: pede à API de admin os frameworks e as ligações do que está em produção e compara com a pasta de planilhas.
//
// Uso: node scripts/conferir-strm.mjs <pasta-das-planilhas-2026.1> <url-do-app> [--limite 2] [--amostra 30] [--frameworks 27002-2022,csf-2,txramp]
//      node scripts/conferir-strm.mjs --sem-anterior <url-do-app> [--amostra 30] [--frameworks ...]
//   --sem-anterior: sem as planilhas da versão anterior, só lista os frameworks de produção (frameworks vazios ou com poucos itens
//   aparecem como FALHA) e imprime a amostra para conferir à mão contra os PDFs do SCF (scf-strm-<id>.pdf). É uma conferência mais fraca.
// Autenticação: token do Cloudflare Access do admin (`cloudflared access login <url>` antes).
// Sai com código 1 se um framework comum perde mais itens que o limite (%) ou se um framework da versão anterior sumiu.
import { execFileSync } from "node:child_process";
import { amostrar, comparar, escolher } from "./strm-conferir.mjs";
import { lerPasta } from "./strm-xlsx.mjs";

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args.splice(i, 2)[1] : padrao;
};
const semAnterior = args.includes("--sem-anterior") && args.splice(args.indexOf("--sem-anterior"), 1).length > 0;
const limite = Number(opcao("limite", 2));
const nAmostra = Number(opcao("amostra", 30));
const trechos = opcao("frameworks", "27002-2022,csf-2,txramp").split(",").map((s) => s.trim()).filter(Boolean);
const [pasta, url] = semAnterior ? [null, args[0]] : args;
if ((!pasta && !semAnterior) || !url) {
  console.error("uso: node scripts/conferir-strm.mjs <pasta-das-planilhas-2026.1> <url-do-app> [--limite 2] [--amostra 30] [--frameworks a,b]\n     node scripts/conferir-strm.mjs --sem-anterior <url-do-app> [--amostra 30] [--frameworks a,b]");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();
const pedir = async (caminho) => {
  const r = await fetch(`${url}${caminho}`, { headers: { "cf-access-token": token } });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.json().catch(() => ({}))).erro ?? ""}`);
  return r.json();
};

let antigas = [];
if (!semAnterior) {
  console.log(`Lendo as planilhas de ${pasta} ...`);
  antigas = await lerPasta(pasta);
  console.log(`${antigas.length} frameworks na versão anterior. Lendo o que está em produção ...`);
} else console.log("Sem versão anterior: conferência mais fraca. Lendo o que está em produção ...");
const lista = await pedir("/api/strm/frameworks");
const novas = [];
for (const f of lista) {
  const linhas = await pedir(`/api/strm/${encodeURIComponent(f.id)}`);
  novas.push({ id: f.id, nome: f.nome, ligacoes: linhas.map((l) => ({ item: l.item, itemNome: l.item_nome, relacao: l.relacao, forca: l.forca, scf: l.scf })) });
}
console.log(`${novas.length} frameworks em produção.\n`);

const r = comparar(antigas, novas, { limite });
if (semAnterior) {
  const poucos = novas.filter((p) => new Set(p.ligacoes.map((l) => l.item)).size < 3);
  for (const p of poucos) console.log(`FALHA ${p.id}: só ${new Set(p.ligacoes.map((l) => l.item)).size} item(ns), ${p.ligacoes.length} ligação(ões)`);
  const itens = novas.map((p) => new Set(p.ligacoes.map((l) => l.item)).size).sort((a, b) => a - b);
  console.log(`${novas.length} frameworks; itens por framework: mínimo ${itens[0]}, mediana ${itens[Math.floor(itens.length / 2)]}, máximo ${itens[itens.length - 1]}.`);
  r.falhas = poucos.length;
}
const pct = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
if (!semAnterior) for (const c of r.comuns.filter((x) => x.falha || x.aviso || x.novos.length || x.perdidos.length)) {
  console.log(`${c.falha ? "FALHA " : c.aviso ? "aviso " : "      "}${c.id}: itens ${c.itensAntes} → ${c.itensDepois} (perdeu ${c.perdidos.length}, ${c.perdaPct.toFixed(1)}%), ligações ${c.ligacoesAntes} → ${c.ligacoesDepois} (${pct(c.varLigacoesPct)})`);
  if (c.perdidos.length) console.log(`        perdidos: ${c.perdidos.slice(0, 12).join(", ")}${c.perdidos.length > 12 ? " ..." : ""}`);
}
if (!semAnterior) {
const ok = r.comuns.filter((x) => !x.falha && !x.aviso && !x.novos.length && !x.perdidos.length).length;
console.log(`\n${ok} de ${r.comuns.length} frameworks comuns sem diferença de itens.`);
for (const x of r.renomeados) console.log(`renomeado: ${x.de} → ${x.para} (${(x.similar * 100).toFixed(0)}% dos itens iguais)`);
if (r.sumidos.length) console.log(`FALHA: só na versão anterior (sumiram, sem framework parecido em produção): ${r.sumidos.join(", ")}`);
const renomeadosPara = new Set(r.renomeados.map((x) => x.para));
const novos = r.soNovo.filter((id) => !renomeadosPara.has(id));
if (novos.length) console.log(`Só em produção (${novos.length} novos): ${novos.join(", ")}`);
}

console.log(`\nAmostra para conferir à mão (${nAmostra} itens por framework${semAnterior ? "" : '; "antes" usa os controles SCF da versão anterior, que foram renumerados'}):`);
for (const a of amostrar(escolher(novas, trechos), antigas, nAmostra)) {
  console.log(`\n== ${a.id}${semAnterior ? `  (confira em scf-strm-${a.id}.pdf)` : ""}`);
  for (const i of a.itens) console.log(`${i.item}${i.nome ? ` (${i.nome})` : ""}\n   produção: ${i.depois.join("; ")}${semAnterior ? "" : `\n   antes:    ${i.antes ? i.antes.join("; ") || "(item não existia)" : "(framework novo)"}`}`);
}
console.log(r.falhas ? `\n${r.falhas} falha(s). Confira as linhas FALHA acima.` : "\nSem falhas.");
process.exit(r.falhas ? 1 : 0);

#!/usr/bin/env node
// Confere o STRM carregado no ness.know contra as planilhas da versão anterior (lacuna 3.1 de docs/lacunas.md).
// Só lê: pede à API de admin os frameworks e as ligações do que está em produção e compara com a pasta de planilhas.
//
// Uso: node scripts/conferir-strm.mjs <pasta-das-planilhas-2026.1> <url-do-app> [--limite 2] [--amostra 30] [--frameworks 27002-2022,csf-2,txramp]
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
const limite = Number(opcao("limite", 2));
const nAmostra = Number(opcao("amostra", 30));
const trechos = opcao("frameworks", "27002-2022,csf-2,txramp").split(",").map((s) => s.trim()).filter(Boolean);
const [pasta, url] = args;
if (!pasta || !url) {
  console.error("uso: node scripts/conferir-strm.mjs <pasta-das-planilhas-2026.1> <url-do-app> [--limite 2] [--amostra 30] [--frameworks a,b]");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();
const pedir = async (caminho) => {
  const r = await fetch(`${url}${caminho}`, { headers: { "cf-access-token": token } });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.json().catch(() => ({}))).erro ?? ""}`);
  return r.json();
};

console.log(`Lendo as planilhas de ${pasta} ...`);
const antigas = await lerPasta(pasta);
console.log(`${antigas.length} frameworks na versão anterior. Lendo o que está em produção ...`);
const lista = await pedir("/api/strm/frameworks");
const novas = [];
for (const f of lista) {
  const linhas = await pedir(`/api/strm/${encodeURIComponent(f.id)}`);
  novas.push({ id: f.id, nome: f.nome, ligacoes: linhas.map((l) => ({ item: l.item, itemNome: l.item_nome, relacao: l.relacao, forca: l.forca, scf: l.scf })) });
}
console.log(`${novas.length} frameworks em produção.\n`);

const r = comparar(antigas, novas, { limite });
const pct = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
for (const c of r.comuns.filter((x) => x.falha || x.aviso || x.novos.length || x.perdidos.length)) {
  console.log(`${c.falha ? "FALHA " : c.aviso ? "aviso " : "      "}${c.id}: itens ${c.itensAntes} → ${c.itensDepois} (perdeu ${c.perdidos.length}, ${c.perdaPct.toFixed(1)}%), ligações ${c.ligacoesAntes} → ${c.ligacoesDepois} (${pct(c.varLigacoesPct)})`);
  if (c.perdidos.length) console.log(`        perdidos: ${c.perdidos.slice(0, 12).join(", ")}${c.perdidos.length > 12 ? " ..." : ""}`);
}
const ok = r.comuns.filter((x) => !x.falha && !x.aviso && !x.novos.length && !x.perdidos.length).length;
console.log(`\n${ok} de ${r.comuns.length} frameworks comuns sem diferença de itens.`);
if (r.soAntigo.length) console.log(`FALHA: só na versão anterior (sumiram): ${r.soAntigo.join(", ")}`);
if (r.soNovo.length) console.log(`Só em produção (novos): ${r.soNovo.join(", ")}`);

console.log(`\nAmostra para conferir à mão (${nAmostra} itens por framework; "antes" usa os controles SCF da versão anterior, que foram renumerados):`);
for (const a of amostrar(escolher(novas, trechos), antigas, nAmostra)) {
  console.log(`\n== ${a.id}`);
  for (const i of a.itens) console.log(`${i.item}${i.nome ? ` (${i.nome})` : ""}\n   depois: ${i.depois.join("; ")}\n   antes:  ${i.antes ? i.antes.join("; ") || "(item não existia)" : "(framework novo)"}`);
}
console.log(r.falhas ? `\n${r.falhas} falha(s). Confira as linhas FALHA acima.` : "\nSem falhas.");
process.exit(r.falhas ? 1 : 0);

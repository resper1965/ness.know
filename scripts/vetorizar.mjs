#!/usr/bin/env node
// Gera os vetores (busca semântica) dos documentos já carregados. Pode rodar de novo: só sobrescreve.
//
// Uso: node scripts/vetorizar.mjs <url-do-app>
// Autenticação: token do Cloudflare Access do admin (`cloudflared access login <url>` antes).
import { execFileSync } from "node:child_process";

const [url] = process.argv.slice(2);
if (!url) {
  console.error("uso: node scripts/vetorizar.mjs <url-do-app>");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();

let apos = "";
let total = 0;
do {
  const r = await fetch(`${url}/api/vetores`, { method: "POST", headers: { "cf-access-token": token, "content-type": "application/json" }, body: JSON.stringify({ apos }) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${corpo.erro ?? ""}`);
  for (const f of corpo.feitos) console.log(`ok  ${f.id}: ${f.trechos} trechos`);
  total += corpo.feitos.length;
  apos = corpo.proximo;
} while (apos);
console.log(`${total} documento(s) vetorizado(s)`);

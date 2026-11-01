#!/usr/bin/env node
// Carrega um pacote de conhecimento (pasta fora deste repositório) na plataforma.
//
// Uso: node scripts/carregar-pacote.mjs <pasta-do-pacote> <url-do-app> [--sincronizar]
//   ex.: node scripts/carregar-pacote.mjs ../pacotes/seguranca-conformidade https://know.ness.com.br
// --sincronizar: depois da carga, apaga do pacote as normas cujo título não está em documentos.json (ex.: revogadas).
//   Não use em pastas de acréscimo (-nist, -cis): apagaria as normas do pacote base.
//
// A pasta tem:
//   pacote.json      {"slug", "nome", "descricao", "versao"}
//   instrucoes.md    como o agente deve usar o pacote (a "skill")
//   documentos.json  [{"arquivo", "titulo", "tipo", "versao", "vigencia", "fonte"}]
//   os arquivos listados em documentos.json
//
// Autenticação: token do Cloudflare Access do admin (`cloudflared access login <url>` antes).
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sincronizar = process.argv.includes("--sincronizar");
const [pasta, url] = process.argv.slice(2).filter((a) => a !== "--sincronizar");
if (!pasta || !url) {
  console.error("uso: node scripts/carregar-pacote.mjs <pasta-do-pacote> <url-do-app> [--sincronizar]");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();
const cabecalho = { "cf-access-token": token };

async function chamar(caminho, init) {
  const r = await fetch(`${url}${caminho}`, { ...init, headers: { ...cabecalho, ...(init.headers ?? {}) } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${corpo.erro ?? ""}`);
  return corpo;
}

const pacote = JSON.parse(await readFile(join(pasta, "pacote.json"), "utf8"));
const instrucoes = await readFile(join(pasta, "instrucoes.md"), "utf8").catch(() => "");
await chamar("/api/pacotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...pacote, instrucoes }) });
console.log(`pacote ${pacote.slug} gravado`);

const documentos = JSON.parse(await readFile(join(pasta, "documentos.json"), "utf8"));
let ok = 0;
for (const d of documentos) {
  const form = new FormData();
  form.set("arquivo", new Blob([await readFile(join(pasta, d.arquivo))]), basename(d.arquivo));
  for (const k of ["titulo", "tipo", "versao", "vigencia", "fonte"]) if (d[k]) form.set(k, String(d[k]));
  try {
    const r = await chamar(`/api/pacotes/${pacote.slug}/documentos`, { method: "POST", body: form });
    console.log(`ok  ${d.titulo ?? d.arquivo}: ${r.trechos} trechos`);
    ok++;
  } catch (e) {
    console.log(`ERRO ${d.titulo ?? d.arquivo}: ${e.message}`);
  }
}
if (sincronizar) {
  const titulos = new Set(documentos.map((d) => d.titulo ?? basename(d.arquivo)));
  const falhou = documentos.length - ok;
  // Com erro na carga, um título pode faltar no pacote por falha e não por saída do manifesto: não apaga nada.
  if (falhou) console.log(`sincronização não feita: ${falhou} documento(s) com erro na carga`);
  else
    for (const d of await chamar(`/api/pacotes/${pacote.slug}/documentos`, {}))
      if (!titulos.has(d.titulo)) {
        await chamar(`/api/documentos/${d.id}`, { method: "DELETE" });
        console.log(`apagado ${d.titulo}`);
      }
}
console.log("Para liberar o pacote a um cliente, gere ou recrie a chave na interface (aba Chaves de API).");

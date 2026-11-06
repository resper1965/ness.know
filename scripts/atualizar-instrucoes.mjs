#!/usr/bin/env node
// Troca só as instruções de um pacote que já existe, sem recarregar os documentos.
//
// Uso: node scripts/atualizar-instrucoes.mjs <slug> <arquivo-com-o-texto.md> <url-do-app>
//   ex.: node scripts/atualizar-instrucoes.mjs gestao-servicos-ti docs/instrucoes/gestao-servicos-ti.md https://know.ness.com.br
// Lê nome, descrição e versão atuais em GET /api/pacotes e envia POST /api/pacotes com o texto novo. Não toca nos documentos.
// Autenticação: token do Cloudflare Access do admin (o script o pede ao cloudflared; não imprime).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Corpo do POST /api/pacotes: os campos atuais do pacote com as instruções novas. Texto vazio é recusado. */
export function montarCorpo(pacote, texto) {
  const instrucoes = String(texto ?? "").trim();
  if (!instrucoes) throw new Error("arquivo de instruções vazio");
  return {
    slug: pacote.slug,
    nome: pacote.nome,
    ...(pacote.descricao ? { descricao: pacote.descricao } : {}),
    ...(pacote.versao ? { versao: pacote.versao } : {}),
    instrucoes,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [slug, arquivo, url] = process.argv.slice(2);
  if (!slug || !arquivo || !url) {
    console.error("uso: node scripts/atualizar-instrucoes.mjs <slug> <arquivo.md> <url-do-app>");
    process.exit(1);
  }
  const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();
  const cabecalho = { "cf-access-token": token };
  const lista = await (await fetch(`${url}/api/pacotes`, { headers: cabecalho })).json();
  const pacote = Array.isArray(lista) ? lista.find((p) => p.slug === slug) : null;
  if (!pacote) {
    console.error(`pacote não existe: ${slug}`);
    process.exit(1);
  }
  const r = await fetch(`${url}/api/pacotes`, { method: "POST", headers: { ...cabecalho, "content-type": "application/json" }, body: JSON.stringify(montarCorpo(pacote, readFileSync(arquivo, "utf8"))) });
  if (!r.ok) {
    console.error(`${r.status} ${(await r.json().catch(() => ({}))).erro ?? ""}`);
    process.exit(1);
  }
  console.log(`ok  instruções de ${slug} atualizadas (${readFileSync(arquivo, "utf8").trim().length} caracteres)`);
}

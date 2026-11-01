#!/usr/bin/env node
// Converte normas do acervo github.com/ctresb/leis (Markdown com cabeçalho YAML) numa pasta de pacote para carregar-pacote.mjs.
//
// Uso: node scripts/leis-para-pacote.mjs <clone-do-leis> <pasta-do-pacote> <caminho>...
//   ex.: node scripts/leis-para-pacote.mjs C:\dev\leis C:\pacotes\legislacao-digital federal/leis-ordinarias/2018/lei-13709-2018-08-14.md reguladores/aneel/resolucoes
// <caminho> é relativo ao clone: um .md ou uma pasta (lida inteira). Normas com `revogada: true` ficam de fora.
// Grava textos/*.md e documentos.json; pacote.json e instrucoes.md são escritos à mão na mesma pasta.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const LIMITE = 15 * 1024 * 1024; // o mesmo de LIMITE_ARQUIVO em src/busca.ts
const MAX_TITULO = 250; // o admin corta em 300

/** Cabeçalho YAML do acervo: uma linha `chave: valor` por campo; texto entre aspas no formato JSON. */
function lerNorma(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, corpo: md };
  const meta = {};
  for (const l of m[1].split(/\r?\n/)) {
    const c = l.match(/^([a-z_0-9]+):\s*(.*?)\s*(#.*)?$/);
    if (!c) continue;
    const v = c[2];
    try {
      meta[c[1]] = v.startsWith('"') ? JSON.parse(v) : v === "true" ? true : v === "false" ? false : v === "null" || v === "" ? null : v;
    } catch {
      meta[c[1]] = v;
    }
  }
  // "**Art. 5º** texto" vira "Art. 5º" numa linha: o divisor corta antes de cada artigo e a seção do trecho é o artigo.
  const corpo = md.slice(m[0].length).replace(/^\*\*(Art\.\s?\d+[^*\n]{0,12}?)\.?\*\*\s*/gm, "$1\n");
  return { meta, corpo };
}

/** Título é a identidade da norma no pacote (chaves restritas, recarga): leva a UF e a ementa, que também melhoram o vetor. */
function tituloDe(meta, reserva) {
  const base = `${meta.titulo ?? reserva}${meta.uf ? ` (${meta.uf})` : ""}`;
  const t = meta.ementa ? `${base} — ${String(meta.ementa).replace(/\s+/g, " ").trim()}` : base;
  return t.length > MAX_TITULO ? `${t.slice(0, MAX_TITULO - 1).trimEnd()}…` : t;
}

async function arquivosDe(raiz, caminho) {
  const p = join(raiz, caminho);
  if (!(await stat(p)).isDirectory()) return [p];
  const r = [];
  for (const e of await readdir(p, { withFileTypes: true, recursive: true }))
    if (e.isFile() && e.name.endsWith(".md")) r.push(join(e.parentPath ?? e.path, e.name));
  return r.sort();
}

const [raiz, pasta, ...caminhos] = process.argv.slice(2);
if (!raiz || !pasta || !caminhos.length) {
  console.error("uso: node scripts/leis-para-pacote.mjs <clone-do-leis> <pasta-do-pacote> <caminho>...");
  process.exit(1);
}
await mkdir(join(pasta, "textos"), { recursive: true });
const documentos = [];
const titulos = new Set();
const vistos = new Set(); // caminhos sobrepostos (pasta + arquivo dela) não repetem a norma
const revogadas = [];
for (const c of caminhos)
  for (const f of await arquivosDe(raiz, c)) {
    const rel = relative(raiz, f).replaceAll("\\", "/");
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    const { meta, corpo } = lerNorma(await readFile(f, "utf8"));
    if (meta.revogada === true) {
      revogadas.push(tituloDe(meta, rel));
      continue;
    }
    if (Buffer.byteLength(corpo) > LIMITE) {
      console.log(`PULADO ${rel}: maior que 15 MB`);
      continue;
    }
    let titulo = tituloDe(meta, rel);
    // Título repetido substituiria a outra norma na carga.
    if (titulos.has(titulo)) titulo = `${titulo.slice(0, MAX_TITULO - rel.length - 3)} [${rel}]`;
    titulos.add(titulo);
    const arquivo = `textos/${rel.replaceAll("/", "__")}`;
    await writeFile(join(pasta, arquivo), corpo);
    documentos.push({ arquivo, titulo, tipo: meta.tipo ?? undefined, versao: meta.versao_texto ?? undefined, vigencia: meta.data ?? meta.ano ?? undefined, fonte: meta.fonte ?? undefined });
  }
await writeFile(join(pasta, "documentos.json"), JSON.stringify(documentos, null, 2));
console.log(`${documentos.length} norma(s) em ${pasta}${revogadas.length ? `; ${revogadas.length} revogada(s) fora` : ""}`);
// A recarga não apaga o que já está no pacote: uma norma que passou a revogada sai à mão (docs/operacao.md).
for (const t of revogadas) console.log(`revogada, fora do pacote (apague se já estava carregada): ${t}`);
for (const f of ["pacote.json", "instrucoes.md"]) if (!existsSync(join(pasta, f))) console.log(`falta ${f} na pasta (escreva antes de carregar)`);

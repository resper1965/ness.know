#!/usr/bin/env node
// Mede a qualidade da busca do conhecimento com perguntas-gabarito, em cada modo.
//
// Uso: node scripts/avaliar-busca.mjs <perguntas.json> <url-do-app> [pacote,pacote]
//   perguntas.json: [{"pergunta", "documento": "trecho do título", "contem": ["texto esperado no trecho ou na seção", ...],
//                     "aceita": [{"documento", "contem"}]}]   (aceita: respostas alternativas também certas, opcional)
// Acerto: o trecho é de um documento esperado e contém um dos textos dele (sem diferenciar maiúsculas e acentos).
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [arquivo, url, filtro = ""] = process.argv.slice(2);
const pacotes = filtro.split(",").filter(Boolean);
if (!arquivo || !url) {
  console.error("uso: node scripts/avaliar-busca.mjs <perguntas.json> <url-do-app> [pacote,pacote]");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();
const perguntas = JSON.parse(await readFile(arquivo, "utf8"));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const casa = (g, t) => norm(t.titulo).includes(norm(g.documento)) && (!g.contem?.length || g.contem.some((c) => norm(`${t.secao} ${t.trecho}`).includes(norm(c))));
const acerta = (p, t) => [p, ...(p.aceita ?? [])].some((g) => casa(g, t));

async function buscar(consulta, modo, rerank, peso_textual) {
  const r = await fetch(`${url}/api/busca`, {
    method: "POST",
    headers: { "cf-access-token": token, "content-type": "application/json" },
    body: JSON.stringify({ pacotes, consulta, modo, rerank, peso_textual, limite: 10, minimo: modo === "semantica" ? 0 : undefined }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).erro ?? ""}`);
  return r.json();
}

const modos = [
  ["textual", "textual", false],
  ["semântica", "semantica", false],
  ["híbrida (padrão)", "hibrida", false],
  ["híbrida, pesos iguais", "hibrida", false, 1],
  ["híbrida + rerank", "hibrida", true],
];
const notasCertas = [];
const notasErradas = [];
console.log(`${perguntas.length} perguntas, pacotes: ${pacotes.length ? pacotes.join(", ") : "todos"}\n`);
console.log("modo                    acerto@1  acerto@5  MRR@10");
for (const [nome, modo, rerank, peso] of modos) {
  let a1 = 0, a5 = 0, mrr = 0;
  const erros = [];
  for (const p of perguntas) {
    const r = await buscar(p.pergunta, modo, rerank, peso);
    const pos = r.findIndex((t) => acerta(p, t));
    if (pos === 0) a1++;
    if (pos >= 0 && pos < 5) a5++;
    if (pos >= 0) mrr += 1 / (pos + 1);
    else erros.push(`${p.pergunta}  →  1º: ${r[0] ? `${r[0].titulo} · ${r[0].secao ?? ""}` : "(nada)"}`);
    if (modo === "semantica") r.forEach((t) => (acerta(p, t) ? notasCertas : notasErradas).push(t.nota));
  }
  const pct = (x) => `${Math.round((100 * x) / perguntas.length)}%`.padStart(8);
  console.log(`${nome.padEnd(23)}${pct(a1)}  ${pct(a5)}  ${(mrr / perguntas.length).toFixed(2).padStart(6)}`);
  if (modo === "hibrida" && !rerank && peso === undefined && erros.length) console.log(`  erros:\n  - ${erros.join("\n  - ")}`);
}
const quartis = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f) => (s.length ? s[Math.floor(f * (s.length - 1))].toFixed(2) : "-");
  return `mín ${q(0)} · 25% ${q(0.25)} · mediana ${q(0.5)} · 75% ${q(0.75)} · máx ${q(1)}`;
};
console.log(`\nNotas da semântica (para calibrar SIMILARIDADE_MIN)\n  certos:  ${quartis(notasCertas)}\n  errados: ${quartis(notasErradas)}`);

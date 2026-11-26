#!/usr/bin/env node
// Gera a base embutida das skills de fabricante (src/fontes/dados/skills-fabricante.json) a partir de skills-fabricante/manifesto.json.
// Só entra a skill com `revisao` preenchida (quem leu e quando) e com o sha256 do arquivo igual ao do manifesto: a revisão vale para aquele texto.
// O texto original fica no repositório, sem alteração, para o diff contra o fabricante; o que o ness.know serve é derivado dele:
//   - a seção de feedback é removida (ela manda abrir issue pública no GitHub);
//   - links relativos (que só existem dentro do repositório do fabricante) viram o texto do link.
// Uso: node scripts/gerar-skills-fabricante.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const PASTA = "skills-fabricante";
const SAIDA = "src/fontes/dados/skills-fabricante.json";

const sha = (texto) => createHash("sha256").update(texto).digest("hex");

/** Remove uma seção de nível 2 ("## Título") até a próxima de nível 2 ou o fim. */
export function removerSecao(texto, titulo) {
  const linhas = texto.split("\n");
  const saida = [];
  let pulando = false;
  for (const l of linhas) {
    if (/^## /.test(l)) pulando = l.replace(/^## /, "").trim() === titulo;
    if (!pulando) saida.push(l);
  }
  return saida.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function derivar(original, remover) {
  let corpo = original.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart();
  const alteracoes = [];
  for (const secao of remover ?? []) {
    const antes = corpo;
    corpo = removerSecao(corpo, secao);
    if (corpo !== antes) alteracoes.push(`seção "${secao}" removida`);
  }
  const antes = corpo;
  corpo = corpo.replace(/\[([^\]]+)\]\((?!https?:\/\/|#)[^)]+\)/g, "$1");
  if (corpo !== antes) alteracoes.push("links relativos do repositório do fabricante trocados pelo texto do link");
  return { corpo, alteracoes };
}

const frente = (original, campo) => original.match(new RegExp(`^${campo}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;

/** Monta a base a partir do manifesto. `ler` devolve o texto do arquivo (injetável nos testes). */
export function montar(manifesto, ler, geradoEm) {
  const skills = [];
  const ignoradas = [];
  for (const m of manifesto.skills) {
    const original = ler(`${PASTA}/${m.arquivo}`);
    if (sha(original) !== m.sha256) throw new Error(`${m.nome}: o sha256 do arquivo não bate com o do manifesto (${sha(original)}). O texto mudou desde a revisão: leia de novo e atualize o manifesto.`);
    if (!m.revisao?.por || !m.revisao?.em) {
      ignoradas.push(m.nome);
      continue;
    }
    const { corpo, alteracoes } = derivar(original, m.remover_secoes);
    skills.push({
      nome: m.nome,
      descricao: frente(original, "description"),
      origem: { repositorio: m.repositorio, caminho: m.caminho, commit: m.commit, commit_data: m.commit_data, url: `${m.repositorio}/blob/${m.commit}/${m.caminho}` },
      licenca: m.licenca,
      licenca_url: `${m.repositorio}/blob/${m.commit}/LICENSE`,
      atribuicao: m.atribuicao,
      revisao: m.revisao,
      sha256: m.sha256,
      alteracoes,
      tamanho: corpo.length,
      corpo,
    });
  }
  return { base: { meta: { gerado_em: geradoEm, itens: skills.length }, skills }, ignoradas };
}

function main() {
  const manifesto = JSON.parse(readFileSync(`${PASTA}/manifesto.json`, "utf8"));
  const { base, ignoradas } = montar(manifesto, (c) => readFileSync(c, "utf8"), new Date().toISOString());
  writeFileSync(SAIDA, JSON.stringify(base));
  console.log(`${base.skills.length} skill(s) de fabricante → ${SAIDA}${ignoradas.length ? `; sem revisão, fora: ${ignoradas.join(", ")}` : ""}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();

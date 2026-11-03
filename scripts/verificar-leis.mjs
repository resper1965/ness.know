#!/usr/bin/env node
// Confere se as leis dos pacotes (pacotes/*/) envelheceram: procura no acervo github.com/ctresb/leis os atos posteriores cuja ementa
// altera ou revoga cada norma e diz quais o texto do pacote ainda não cita. Sai com código 1 se faltar alteração que importa:
//   - texto "original" (não compilado): qualquer alteração achada;
//   - texto compilado: só alteração publicada depois da data da carga (a data entre parênteses em `versao` do pacote.json).
// As anteriores à carga que o texto não cita saem como "conferir": o compilado costuma omitir alteração de dispositivo que
// foi revogado depois, e a medida provisória que perdeu a vigência. É um alerta para olhar o Planalto, não uma prova.
//
// Uso: node scripts/verificar-leis.mjs <clone-do-leis> [slug-do-pacote ...]
//   ex.: git -C C:\dev\leis pull ; node scripts/verificar-leis.mjs C:\dev\leis legislacao-digital
// Cada documento precisa de `fonte` com a URN de normas.leg.br (urn:lex:br:federal:<tipo>:<AAAA-MM-DD>;<número>) e `vigencia`.
// shortcut: acha só atos federais de 2000 em diante citados na ementa ("Altera a Lei nº X, de ..."); alteração só no corpo do ato, sem
// citar a norma na ementa, não aparece. Para citação formal, confira no Planalto.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [clone, ...slugs] = process.argv.slice(2);
if (!clone) {
  console.error("uso: node scripts/verificar-leis.mjs <clone-do-leis> [slug-do-pacote ...]");
  process.exit(1);
}
const pacotes = process.env.PACOTES ?? join(dirname(fileURLToPath(import.meta.url)), "..", "pacotes"); // PACOTES: pasta de pacotes, para os testes
const ATOS = ["federal/leis-ordinarias", "federal/leis-complementares", "federal/decretos", "federal/decretos-lei", "federal/medidas-provisorias"];
const git = (...args) => execFileSync("git", ["-C", clone, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const campo = (md, k) => md.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1] ?? "";
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Arquivos do acervo cuja ementa altera ou revoga a norma (número e ano da própria norma identificam: "13.709, de 14 de agosto de 2018"). */
function candidatos(numero, ano) {
  const padrao = `^ementa:.*(altera|acrescenta|revoga|nova reda|modifica).*${milhar(numero).replace(/\./g, "\\.")}, de [0-9]+(º)? de [^ ,]+ de ${ano}`;
  try {
    return git("grep", "-i", "-E", "-l", padrao, "HEAD", "--", ...ATOS)
      .split("\n")
      .filter(Boolean)
      .map((l) => l.replace(/^HEAD:/, ""));
  } catch {
    return []; // git grep sai com 1 quando nada casa
  }
}

let faltam = 0;
let conferir = 0;
for (const slug of readdirSync(pacotes).filter((s) => (!slugs.length || slugs.includes(s)) && existsSync(join(pacotes, s, "documentos.json")))) {
  const docs = JSON.parse(readFileSync(join(pacotes, slug, "documentos.json"), "utf8"));
  const captura = JSON.parse(readFileSync(join(pacotes, slug, "pacote.json"), "utf8")).versao?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  console.log(`\n${slug}`);
  for (const d of docs) {
    const urn = d.fonte?.match(/urn:lex:br:federal:[^;]+:(\d{4})-\d{2}-\d{2};(\d+)$/);
    if (!urn) {
      console.log(`  ?     ${d.titulo.slice(0, 70)}: sem URN federal em "fonte"`);
      continue;
    }
    const [, ano, numero] = urn;
    const texto = readFileSync(join(pacotes, slug, d.arquivo), "utf8");
    const citada = new RegExp(`${milhar(numero).replace(/\./g, "\\.")}, de [0-9]+º? de [^ ,]+ de ${ano}`);
    const achados = candidatos(numero, ano).flatMap((arq) => {
      const md = git("show", `HEAD:${arq}`);
      const data = campo(md, "data");
      const ato = campo(md, "titulo").replace(/ de \d{2}\/\d{2}\/\d{4}$/, ""); // "Lei nº 15.352"
      // "Altera o Decreto X, que regulamenta a Lei Y" altera o decreto, não a lei: a oração relativa não conta.
      const ementa = campo(md, "ementa").replace(/,? que (regulamenta|disp[õo]e|institui|cria|estabelece|trata|define)\b.*$/i, "");
      return data > (d.vigencia ?? "") && ato && citada.test(ementa) ? [{ ato, data, arq }] : []; // o próprio ato e os anteriores à norma não contam
    });
    const fora = achados.filter((a) => !texto.includes(a.ato));
    const originais = /^original/i.test(d.versao ?? "");
    const faltas = fora.filter((a) => originais || !captura || a.data > captura);
    const outras = fora.filter((a) => !faltas.includes(a));
    faltam += faltas.length;
    conferir += outras.length;
    console.log(`  ${faltas.length ? "FALTA" : "ok   "} ${d.titulo.slice(0, 70)}: ${achados.length - fora.length} de ${achados.length} alterações já no texto`);
    for (const a of faltas) console.log(`          ${a.ato} (${a.data}) — ${a.arq}`);
    if (outras.length) console.log(`          conferir (anteriores à carga, não citadas): ${outras.map((a) => a.ato).join("; ")}`);
  }
}
console.log(faltam ? `\n${faltam} alteração(ões) fora do texto dos pacotes.` : "\nNenhuma alteração nova fora do texto dos pacotes.");
if (conferir) console.log(`${conferir} alteração(ões) anteriores à carga que o texto não cita: confira no Planalto se ainda valem (informativo).`);
process.exit(faltam ? 1 : 0);

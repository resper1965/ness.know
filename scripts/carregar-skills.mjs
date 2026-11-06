#!/usr/bin/env node
// Carrega as skills da pasta skills/ na plataforma. Recarregar o mesmo nome substitui.
//
// Uso: node scripts/carregar-skills.mjs <url-do-app> [pasta-das-skills]
//   ex.: node scripts/carregar-skills.mjs https://know.ness.com.br skills
// Autenticação: token do Cloudflare Access do admin (`cloudflared access login <url>` antes).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lerSkill } from "./skills-md.mjs";

const [url, pasta = "skills"] = process.argv.slice(2);
if (!url) {
  console.error("uso: node scripts/carregar-skills.mjs <url-do-app> [pasta-das-skills]");
  process.exit(1);
}
const token = execFileSync("cloudflared", ["access", "token", `-app=${url}`], { encoding: "utf8" }).trim();

let falhas = 0;
for (const dir of readdirSync(pasta, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  try {
    const skill = lerSkill(readFileSync(join(pasta, dir.name, "SKILL.md"), "utf8"));
    const r = await fetch(`${url}/api/skills`, { method: "POST", headers: { "cf-access-token": token, "content-type": "application/json" }, body: JSON.stringify(skill) });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${corpo.erro ?? ""}`);
    console.log(`ok  ${skill.nome} (${skill.corpo.length} caracteres)`);
  } catch (e) {
    falhas++;
    console.log(`ERRO ${dir.name}: ${e.message}`);
  }
}
process.exit(falhas ? 1 : 0);

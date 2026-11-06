# Skills, fatia 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ness.know guarda skills, entrega a cada chave só as que ela enxerga (`obter_skill`, `listar_pacotes`) e o faBRAINzio usa a skill `consultando-normas`.

**Architecture:** Tabela `skills` no D1, rotas de admin para carregar, duas mudanças no MCP e uma função pura de visibilidade. As skills moram em `skills/<nome>/SKILL.md` e um script as envia para a API, como já se faz com os pacotes.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), TypeScript, vitest com `node:sqlite` (`test/sqlite.ts`).

**Spec:** `docs/superpowers/specs/2026-11-06-skills-fatia-1-design.md`

## Global Constraints

- Português do Brasil, direto; marcas da ness. em caixa baixa (`ness.`, `ness.know`).
- Conteúdo não mora no código: a skill entra pela API, nunca embutida no Worker.
- Somente leitura: `obter_skill` não escreve nada além do contador de uso.
- Corpo da skill: no máximo 4.000 caracteres. Nome no padrão `^[a-z0-9][a-z0-9-]{1,62}$`.
- D1: no máximo 100 variáveis por consulta.
- Verificação: `npm test && npm run check`.
- Sem deploy e sem merge por conta própria; o dono faz o deploy do ness.know.

## File Structure

- Create `migrations/0006_skills.sql`: tabela `skills`.
- Create `src/skills.ts`: `validarSkill`, `normasExistem`, `visivel`. Uma responsabilidade: regras das skills, sem HTTP.
- Modify `src/admin.ts`: rotas `/api/skills`.
- Modify `src/mcp.ts`: ferramenta `obter_skill` e campo `skills` em `listar_pacotes`.
- Create `scripts/skills-md.mjs`: `lerSkill(texto)`, lê o `SKILL.md`.
- Create `scripts/carregar-skills.mjs`: envia a pasta `skills/` à API.
- Create `skills/consultando-normas/SKILL.md` e `casos.md`.
- Modify `docs/mcp.md`, `docs/api-admin.md`, `docs/skills-plano.md`, `docs/lacunas.md`.
- faBRAINzio: modify `src/know.ts`, `test/know.test.ts`.

---

### Task 1: Tabela, validação e visibilidade

**Files:**
- Create: `migrations/0006_skills.sql`
- Create: `src/skills.ts`
- Test: `test/skills.test.ts`

**Interfaces:**
- Produces: `validarSkill(b: Record<string, unknown>): Valido<Skill>`; `normasExistem(db: D1Database, normas: Record<string, string[]>): Promise<string | null>` (mensagem de erro ou null); `visivel(normas: Record<string, string[]>, c: { pacotes: string[]; documentos: Record<string, string[]> }): boolean`; `MAX_CORPO = 4000`; `interface Skill { nome: string; descricao: string; normas: Record<string, string[]>; corpo: string; versao: string | null }`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// test/skills.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CORPO, normasExistem, validarSkill, visivel } from "../src/skills";
import { bancoTeste } from "./sqlite";

const migracao = (n: string) => readFileSync(`migrations/${n}.sql`, "utf8");

describe("validarSkill", () => {
  const ok = { nome: "consultando-normas", descricao: "Use ao responder sobre normas", corpo: "Passo 1.", normas: {} };
  it("aceita skill válida e normaliza o nome", () => {
    expect(validarSkill({ ...ok, nome: "Consultando-Normas" })).toMatchObject({ ok: true, v: { nome: "consultando-normas", versao: null, normas: {} } });
  });
  it("recusa nome inválido, descrição ou corpo vazios e corpo grande demais", () => {
    expect(validarSkill({ ...ok, nome: "a b" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, descricao: "" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, corpo: "" })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, corpo: "x".repeat(MAX_CORPO + 1) })).toMatchObject({ ok: false });
  });
  it("normas: só objeto de listas de texto", () => {
    expect(validarSkill({ ...ok, normas: { iso: ["ISO 27001"] } })).toMatchObject({ ok: true, v: { normas: { iso: ["ISO 27001"] } } });
    expect(validarSkill({ ...ok, normas: [1] })).toMatchObject({ ok: false });
    expect(validarSkill({ ...ok, normas: { iso: "ISO 27001" } })).toMatchObject({ ok: false });
  });
});

describe("visivel", () => {
  it("sem normas vale para toda chave", () => expect(visivel({}, { pacotes: [], documentos: {} })).toBe(true));
  it("exige todos os pacotes", () => {
    expect(visivel({ iso: [], cis: [] }, { pacotes: ["iso"], documentos: {} })).toBe(false);
    expect(visivel({ iso: [], cis: [] }, { pacotes: ["iso", "cis"], documentos: {} })).toBe(true);
  });
  it("chave restrita só vê a skill se tiver as normas pedidas; lista vazia só exige o pacote", () => {
    const c = { pacotes: ["iso"], documentos: { iso: ["ISO 27001"] } };
    expect(visivel({ iso: ["ISO 27001"] }, c)).toBe(true);
    expect(visivel({ iso: ["ISO 27001", "ISO 27017"] }, c)).toBe(false);
    expect(visivel({ iso: [] }, c)).toBe(true);
  });
});

describe("normasExistem", () => {
  it("confere pacote e título no banco", async () => {
    const DB = bancoTeste(migracao("0001_inicial"));
    await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES ('iso', 'ISO')").bind().run();
    await DB.prepare("INSERT INTO documentos (id, escopo, dono, titulo, status) VALUES ('d1', 'pacote', 'iso', 'ISO 27001', 'ok')").bind().run();
    expect(await normasExistem(DB, { iso: ["ISO 27001"] })).toBeNull();
    expect(await normasExistem(DB, { iso: [] })).toBeNull();
    expect(await normasExistem(DB, { cis: [] })).toContain("cis");
    expect(await normasExistem(DB, { iso: ["Outra"] })).toContain("Outra");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/skills.test.ts`
Expected: FAIL, módulo `../src/skills` não existe.

- [ ] **Step 3: Implementar**

```sql
-- migrations/0006_skills.sql
-- Skills: procedimentos curtos que dizem ao agente como usar as normas. `normas` é {slug: [títulos]}: a chave só enxerga a
-- skill se tiver esses pacotes (lista vazia = só o pacote) e, no pacote restrito, essas normas. {} = vale para toda chave.
CREATE TABLE skills (
  nome TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  normas TEXT NOT NULL DEFAULT '{}',
  corpo TEXT NOT NULL,
  versao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```ts
// src/skills.ts
// Regras das skills (procedimentos que o agente segue ao usar as normas): validação na carga e quem enxerga cada uma.
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const MAX_CORPO = 4000;

type Valido<T> = { ok: true; v: T } | { ok: false; erro: string };
export interface Skill {
  nome: string;
  descricao: string;
  normas: Record<string, string[]>;
  corpo: string;
  versao: string | null;
}

const txt = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

export function validarSkill(b: Record<string, unknown>): Valido<Skill> {
  const nome = txt(b.nome, 63).toLowerCase();
  const descricao = txt(b.descricao, 300);
  const corpo = typeof b.corpo === "string" ? b.corpo.trim() : "";
  if (!SLUG.test(nome)) return { ok: false, erro: "nome inválido: letras minúsculas, números e hífen" };
  if (!descricao) return { ok: false, erro: "descrição obrigatória" };
  if (!corpo) return { ok: false, erro: "corpo obrigatório" };
  if (corpo.length > MAX_CORPO) return { ok: false, erro: `corpo com ${corpo.length} caracteres; o máximo é ${MAX_CORPO}` };
  const bruto = b.normas ?? {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erro: "normas: objeto {pacote: [títulos]}" };
  const normas: Record<string, string[]> = {};
  for (const [slug, lista] of Object.entries(bruto)) {
    if (!SLUG.test(slug) || !Array.isArray(lista) || !lista.every((t) => typeof t === "string")) return { ok: false, erro: `normas.${slug}: lista de títulos` };
    normas[slug] = [...new Set(lista.map((t) => t.trim()).filter(Boolean))];
  }
  return { ok: true, v: { nome, descricao, normas, corpo, versao: txt(b.versao, 50) || null } };
}

/** Mensagem de erro se algum pacote ou título de `normas` não existe na base; null se está tudo lá. */
export async function normasExistem(db: D1Database, normas: Record<string, string[]>): Promise<string | null> {
  for (const [slug, titulos] of Object.entries(normas)) {
    if (!(await db.prepare("SELECT 1 FROM pacotes WHERE slug = ?").bind(slug).first())) return `pacote não existe: ${slug}`;
    const existem = (await db.prepare("SELECT DISTINCT titulo FROM documentos WHERE escopo = 'pacote' AND dono = ? AND status = 'ok'").bind(slug).all<{ titulo: string }>()).results.map((x) => x.titulo);
    const faltam = titulos.filter((t) => !existem.includes(t));
    if (faltam.length) return `norma não existe em ${slug}: ${faltam.join(", ")}`;
  }
  return null;
}

/** A chave enxerga a skill se tem todos os pacotes dela e, quando o pacote é restrito, todas as normas pedidas. */
export function visivel(normas: Record<string, string[]>, c: { pacotes: string[]; documentos: Record<string, string[]> }): boolean {
  return Object.entries(normas).every(([slug, titulos]) => c.pacotes.includes(slug) && (!c.documentos[slug] || titulos.every((t) => c.documentos[slug].includes(t))));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/skills.test.ts && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0006_skills.sql src/skills.ts test/skills.test.ts
git commit -m "skills: tabela, validação e regra de visibilidade"
```

---

### Task 2: Rotas de admin `/api/skills`

**Files:**
- Modify: `src/admin.ts` (import no topo; rotas antes do `return erro("não encontrado", 404)` final)
- Test: `test/skills.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `validarSkill`, `normasExistem` da Task 1.
- Produces: `GET /api/skills` → `[{nome, descricao, normas, versao, atualizado_em, tamanho}]`; `POST /api/skills` (JSON `{nome, descricao, normas, corpo, versao?}`) → `{nome}`; `DELETE /api/skills/<nome>` → `{ok: true}` ou 404.

- [ ] **Step 1: Teste que falha** (acrescentar a `test/skills.test.ts`)

```ts
import { admin } from "../src/admin";

describe("admin /api/skills", () => {
  const novo = () => {
    const DB = bancoTeste(migracao("0001_inicial"), migracao("0006_skills"));
    return { DB, env: { DB } as never };
  };
  const chamar = (env: never, metodo: string, caminho: string, corpo?: unknown) =>
    admin(new Request(`https://know${caminho}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { "content-type": "application/json" } }), env, "a@ness.com.br", caminho);
  const skill = { nome: "consultando-normas", descricao: "Use ao responder sobre normas", normas: {}, corpo: "Passo 1." };

  it("grava, lista (sem o corpo) e substitui ao recarregar o mesmo nome", async () => {
    const { env } = novo();
    expect((await chamar(env, "POST", "/api/skills", skill)).status).toBe(200);
    expect((await chamar(env, "POST", "/api/skills", { ...skill, corpo: "Passo 1. Passo 2." })).status).toBe(200);
    const lista = (await (await chamar(env, "GET", "/api/skills")).json()) as { nome: string; tamanho: number; corpo?: string }[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nome: "consultando-normas", tamanho: 17 });
    expect(lista[0].corpo).toBeUndefined();
  });
  it("recusa skill inválida (422 não: 400) e norma que não existe", async () => {
    const { env } = novo();
    expect((await chamar(env, "POST", "/api/skills", { ...skill, corpo: "" })).status).toBe(400);
    const r = await chamar(env, "POST", "/api/skills", { ...skill, normas: { iso: [] } });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toContain("iso");
  });
  it("apaga; apagar de novo dá 404", async () => {
    const { env } = novo();
    await chamar(env, "POST", "/api/skills", skill);
    expect((await chamar(env, "DELETE", "/api/skills/consultando-normas")).status).toBe(200);
    expect((await chamar(env, "DELETE", "/api/skills/consultando-normas")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/skills.test.ts`
Expected: FAIL (rota devolve 404 "não encontrado").

- [ ] **Step 3: Implementar** em `src/admin.ts`

Import no topo: `import { normasExistem, validarSkill } from "./skills";`. Antes do último `return erro("não encontrado", 404);`:

```ts
  // Skills: procedimentos que o agente segue ao usar as normas (ver docs/skills-plano.md).
  if (rota === "GET /api/skills")
    return Response.json((await db.prepare("SELECT nome, descricao, normas, versao, atualizado_em, length(corpo) AS tamanho FROM skills ORDER BY nome").all()).results);
  if (rota === "POST /api/skills") {
    const r = validarSkill(await corpo(req));
    if (!r.ok) return erro(r.erro);
    const falta = await normasExistem(db, r.v.normas);
    if (falta) return erro(falta);
    await db
      .prepare(
        "INSERT INTO skills (nome, descricao, normas, corpo, versao) VALUES (?, ?, ?, ?, ?) ON CONFLICT (nome) DO UPDATE SET descricao = excluded.descricao, normas = excluded.normas, corpo = excluded.corpo, versao = excluded.versao, atualizado_em = datetime('now')",
      )
      .bind(r.v.nome, r.v.descricao, JSON.stringify(r.v.normas), r.v.corpo, r.v.versao)
      .run();
    return Response.json({ nome: r.v.nome });
  }
  const sk = caminho.match(/^\/api\/skills\/([a-z0-9-]+)$/);
  if (sk && req.method === "DELETE") {
    const r = await db.prepare("DELETE FROM skills WHERE nome = ?").bind(sk[1]).run();
    return r.meta.changes ? Response.json({ ok: true }) : erro("skill não encontrada", 404);
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/skills.test.ts && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin.ts test/skills.test.ts
git commit -m "skills: rotas de admin para carregar, listar e apagar"
```

---

### Task 3: MCP (`obter_skill` e `skills` em `listar_pacotes`)

**Files:**
- Modify: `src/mcp.ts` (lista `FERRAMENTAS`, função `chamar`)
- Modify: `test/mcp.test.ts:55` (lista de ferramentas esperada)
- Test: `test/skills.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `visivel` (Task 1); `restricoesDe` de `src/mcp.ts` para ler o JSON de `normas`.
- Produces: ferramenta `obter_skill` com argumento `nome`; resposta JSON `{nome, descricao, versao, corpo, fonte}`; `listar_pacotes` devolve `{pacotes: [...], skills: [{nome, descricao}]}`.

- [ ] **Step 1: Testes que falham**

Em `test/mcp.test.ts`, trocar a lista esperada para `["listar_pacotes", "buscar_conhecimento", "correlacionar", "cobertura", "detalhar_controle", "obter_skill"]`. Em `test/skills.test.ts`:

```ts
import { hashToken, mcp } from "../src/mcp";

describe("mcp: skills", () => {
  const TOKEN = "nesskb_skill";
  async function ambiente(pacotes: string[], documentos: Record<string, string[]> = {}) {
    const DB = bancoTeste(migracao("0001_inicial"), migracao("0002_chave_documentos"), migracao("0005_uso_chaves"), migracao("0006_skills"));
    await DB.prepare("INSERT INTO chaves (id, nome, token_hash, pacotes, documentos) VALUES ('c1', 'teste', ?, ?, ?)").bind(await hashToken(TOKEN), JSON.stringify(pacotes), JSON.stringify(documentos)).run();
    for (const slug of ["iso", "cis"]) await DB.prepare("INSERT INTO pacotes (slug, nome) VALUES (?, ?)").bind(slug, slug).run();
    const sk = (nome: string, normas: object) => DB.prepare("INSERT INTO skills (nome, descricao, normas, corpo) VALUES (?, ?, ?, ?)").bind(nome, `desc ${nome}`, JSON.stringify(normas), `corpo ${nome}`).run();
    await sk("geral", {});
    await sk("so-iso", { iso: [] });
    await sk("iso-e-cis", { iso: [], cis: [] });
    return { DB, AI: {} as Ai };
  }
  const chamar = async (env: Awaited<ReturnType<typeof ambiente>>, nome: string, args: unknown) =>
    (await (await mcp(new Request("https://x/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: nome, arguments: args } }) }), env)).json()) as { result: { isError?: boolean; content: { text: string }[] } };

  it("listar_pacotes traz só as skills que a chave enxerga", async () => {
    const env = await ambiente(["iso"]);
    const r = JSON.parse((await chamar(env, "listar_pacotes", {})).result.content[0].text) as { skills: { nome: string }[] };
    expect(r.skills.map((s) => s.nome)).toEqual(["geral", "so-iso"]);
  });
  it("obter_skill devolve o corpo da skill liberada", async () => {
    const env = await ambiente(["iso"]);
    const r = await chamar(env, "obter_skill", { nome: "so-iso" });
    expect(r.result.isError).toBeUndefined();
    expect(JSON.parse(r.result.content[0].text)).toMatchObject({ nome: "so-iso", corpo: "corpo so-iso" });
  });
  it("skill não liberada e skill inexistente recebem a mesma resposta de erro", async () => {
    const env = await ambiente(["iso"]);
    const a = await chamar(env, "obter_skill", { nome: "iso-e-cis" });
    const b = await chamar(env, "obter_skill", { nome: "nao-existe" });
    expect(a.result.isError).toBe(true);
    expect(a.result.content[0].text.replace("iso-e-cis", "X")).toBe(b.result.content[0].text.replace("nao-existe", "X"));
  });
  it("sem o nome, pede o nome; o uso conta como obter_skill", async () => {
    const env = await ambiente(["iso"]);
    expect((await chamar(env, "obter_skill", {})).result.isError).toBe(true);
    await chamar(env, "obter_skill", { nome: "geral" });
    expect(await env.DB.prepare("SELECT chamadas FROM uso_chaves WHERE ferramenta = 'obter_skill'").first()).toEqual({ chamadas: 2 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/skills.test.ts test/mcp.test.ts`
Expected: FAIL (ferramenta desconhecida; lista de ferramentas com 5 itens).

- [ ] **Step 3: Implementar** em `src/mcp.ts`

Import: `import { visivel } from "./skills";`. Acrescentar ao fim de `FERRAMENTAS`:

```ts
  {
    name: "obter_skill",
    description: "Devolve uma skill: o procedimento que diz como usar as normas para um tipo de tarefa (quais buscas fazer, em que ordem e em que formato responder). Os nomes estão em listar_pacotes, campo skills. Siga o procedimento ao responder.",
    inputSchema: { type: "object", properties: { nome: { type: "string", description: "nome da skill, como em listar_pacotes" } }, required: ["nome"] },
    annotations: { readOnlyHint: true },
  },
```

Em `chamar`, na ramificação `listar_pacotes`: acrescentar à `Promise.all` uma terceira consulta `env.DB.prepare("SELECT nome, descricao, normas FROM skills ORDER BY nome").all<{ nome: string; descricao: string; normas: string }>()` (variável `s`) e, no retorno, `texto(JSON.stringify({ pacotes, skills: s.results.filter((x) => visivel(restricoesDe(x.normas), cliente)).map(({ nome, descricao }) => ({ nome, descricao })) }, null, 1))`. No retorno antecipado de chave sem pacotes, manter `{ pacotes: [] }`. Antes do `return texto(\`ferramenta desconhecida...\`)`:

```ts
  if (nome === "obter_skill") {
    const pedida = typeof args.nome === "string" ? args.nome.trim().slice(0, 63) : "";
    if (!pedida) return texto("informe nome (os nomes estão em listar_pacotes, campo skills)", true);
    const s = await env.DB.prepare("SELECT nome, descricao, normas, corpo, versao FROM skills WHERE nome = ?").bind(pedida).first<{ nome: string; descricao: string; normas: string; corpo: string; versao: string | null }>();
    // Inexistente e não liberada dão a mesma resposta: a chave não descobre skills que não enxerga.
    if (!s || !visivel(restricoesDe(s.normas), cliente)) return texto(`skill não encontrada: ${pedida}. Os nomes estão em listar_pacotes, campo skills`, true);
    return texto(JSON.stringify({ nome: s.nome, descricao: s.descricao, versao: s.versao, corpo: s.corpo, fonte: { sistema: "ness.KNOW", base: "skills", consulta: s.nome, coletado_em: new Date().toISOString() } }, null, 1));
  }
```

Atualizar também `docs`/UI quando a Task 6 chegar.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run check`
Expected: PASS (todos os testes, inclusive os de `mcp.test.ts`: o mock devolve `[]` para `FROM skills`).

- [ ] **Step 5: Commit**

```bash
git add src/mcp.ts test/mcp.test.ts test/skills.test.ts
git commit -m "mcp: ferramenta obter_skill e skills em listar_pacotes"
```

---

### Task 4: Script de carga

**Files:**
- Create: `scripts/skills-md.mjs`
- Create: `scripts/carregar-skills.mjs`
- Test: `test/skills-md.test.ts`

**Interfaces:**
- Produces: `lerSkill(texto: string): { nome, descricao, versao, normas, corpo }` (lança `Error` se faltar frontmatter, `name` ou `description`).

- [ ] **Step 1: Teste que falha**

```ts
// test/skills-md.test.ts
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sem tipos
import { lerSkill } from "../scripts/skills-md.mjs";

const md = `---
name: avaliando-mudanca
description: Use quando alguém abre ou aprova uma mudança (GMUD): classifica e avalia risco
version: 2026-11-06
normas:
  gestao-servicos-ti: ["ITIL 4 Foundation"]
  seguranca-conformidade: []
---

# Avaliando mudança
Passo 1.
`;

describe("lerSkill", () => {
  it("lê frontmatter, normas e corpo", () => {
    expect(lerSkill(md)).toEqual({
      nome: "avaliando-mudanca",
      descricao: "Use quando alguém abre ou aprova uma mudança (GMUD): classifica e avalia risco",
      versao: "2026-11-06",
      normas: { "gestao-servicos-ti": ["ITIL 4 Foundation"], "seguranca-conformidade": [] },
      corpo: "# Avaliando mudança\nPasso 1.",
    });
  });
  it("sem normas vale para toda chave; sem frontmatter ou sem nome dá erro", () => {
    expect(lerSkill("---\nname: geral\ndescription: x\n---\ncorpo").normas).toEqual({});
    expect(() => lerSkill("sem frontmatter")).toThrow("frontmatter");
    expect(() => lerSkill("---\ndescription: x\n---\ncorpo")).toThrow("name");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/skills-md.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

```js
// scripts/skills-md.mjs
// Lê um SKILL.md: frontmatter (name, description, version, normas) e corpo. O `normas` é um bloco com um pacote por linha e
// a lista de títulos em JSON: `  seguranca-conformidade: ["ISO 27001"]`.
export function lerSkill(texto) {
  const m = texto.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("SKILL.md sem frontmatter");
  const campos = {};
  const normas = {};
  let emNormas = false;
  for (const linha of m[1].split("\n")) {
    if (/^normas:\s*$/.test(linha)) {
      emNormas = true;
      continue;
    }
    const filho = emNormas && linha.match(/^\s+([a-z0-9-]+):\s*(\[.*\])\s*$/);
    if (filho) {
      normas[filho[1]] = JSON.parse(filho[2]);
      continue;
    }
    emNormas = false;
    const k = linha.match(/^([a-z]+):\s*(.*)$/);
    if (k) campos[k[1]] = k[2].trim();
  }
  if (!campos.name) throw new Error("SKILL.md sem name");
  if (!campos.description) throw new Error("SKILL.md sem description");
  return { nome: campos.name, descricao: campos.description, versao: campos.version ?? null, normas, corpo: m[2].trim() };
}
```

```js
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/skills-md.test.ts && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/skills-md.mjs scripts/carregar-skills.mjs test/skills-md.test.ts
git commit -m "skills: script de carga a partir de skills/<nome>/SKILL.md"
```

---

### Task 5: Linha de base e skill `consultando-normas`

**Files:**
- Create: `skills/consultando-normas/casos.md`
- Create: `skills/consultando-normas/SKILL.md`

Esta tarefa depende de respostas reais de um agente, então tem uma parada para o dono.

- [ ] **Step 1: Escrever os casos** em `skills/consultando-normas/casos.md`

```markdown
# Casos de teste: consultando-normas

Rodar as 3 perguntas num agente com o ness-know conectado, primeiro sem a skill (linha de base) e depois com ela.

1. O que a ISO 27001:2022 exige sobre registro de eventos (logs)? Cite cláusula.
2. Por quanto tempo o Marco Civil da Internet manda guardar os registros de acesso a aplicações? Cite artigo.
3. O que a ISO 27001 exige sobre segurança de drones? (a base não tem a resposta; o agente deve dizer que não está na base)

## Critérios (cada um vale 1 ponto por caso)

- Toda afirmação normativa traz documento, versão, seção e `ref` que confere.
- Nenhuma cláusula ou artigo fora da base.
- Requisito (texto da norma) separado de Interpretação.
- Lacuna declarada quando a base não responde.

## Resultados

| Data | Com skill | Caso 1 | Caso 2 | Caso 3 | Falhas observadas |
| --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 2: PARADA, linha de base.** Pedir ao dono que rode as 3 perguntas sem skill (faBRAINzio ou Claude Desktop) e cole as respostas. Pontuar contra os critérios e registrar na tabela, com as falhas observadas.

- [ ] **Step 3: Escrever a skill** em `skills/consultando-normas/SKILL.md`, corrigindo só as falhas observadas. Rascunho inicial (hipótese do plano, a ajustar depois da linha de base):

```markdown
---
name: consultando-normas
description: Use ao responder qualquer pergunta sobre o que uma norma, lei ou framework exige
version: 2026-11-06
---

# Consultando normas

1. Chame `listar_pacotes` e veja quais documentos e versões existem. Só afirme o que estiver nesses documentos.
2. Busque com `buscar_conhecimento`. Se a pergunta tem mais de um conceito (por exemplo, "retenção" e "logs"), faça uma busca por conceito.
3. Responda em duas partes:
   - **Requisito:** o que o texto diz, com documento, versão, seção e `ref`.
   - **Interpretação:** sua leitura, marcada como leitura sua.
4. Nunca cite cláusula ou artigo que não apareceu nos trechos. Se a base não responde, diga "não está na base" e o que você buscou.
5. Confira a versão: 27001:2022 e 27001:2013 numeram diferente.
```

- [ ] **Step 4: Comparar.** Depois do deploy e da carga da skill, repetir as 3 perguntas com a skill e registrar na tabela. Se não melhorar, relatar o resultado sem mascarar.

- [ ] **Step 5: Commit**

```bash
git add skills
git commit -m "skills: consultando-normas e casos de teste"
```

---

### Task 6: Documentação

**Files:**
- Modify: `docs/mcp.md`, `docs/api-admin.md`, `docs/skills-plano.md`, `docs/lacunas.md`, `public/index.html` (texto "cinco ferramentas")

- [ ] **Step 1:** Em `docs/mcp.md`, acrescentar a seção `obter_skill` (argumento `nome`, resposta, erro único para inexistente e não liberada) e o campo `skills` de `listar_pacotes`. Em `docs/api-admin.md`, as três rotas `/api/skills` e o formato do corpo. Em `docs/skills-plano.md`, trocar "Situação: proposta, nada implementado" por "fatia 1 implementada (tabela, `obter_skill`, `consultando-normas`); fatias 2 e 3 em aberto". Em `docs/lacunas.md`, atualizar 4.1 com o que foi feito. Em `public/index.html`, trocar "cinco ferramentas" por "seis ferramentas" e incluir `obter_skill` na lista (a nova ficando fora do grupo "as três últimas").
- [ ] **Step 2:** `npm test && npm run check`, esperar tudo verde.
- [ ] **Step 3:** Commit `docs: skills fatia 1`.

---

### Task 7: faBRAINzio usa a skill (repositório faBRAINzio)

**Files:**
- Modify: `src/know.ts` (função `instrucoesDoKnow`)
- Test: `test/know.test.ts`

**Interfaces:**
- Consumes: ferramenta `obter_skill` do ness.know (Task 3).
- Produces: `instrucoesDoKnow(env, slugs)` devolve as instruções dos pacotes seguidas de "## Método de consulta às normas" e o corpo da skill; sem a skill, só as instruções.

- [ ] **Step 1: Teste que falha** (acrescentar a `test/know.test.ts`)

```ts
describe("skill consultando-normas", () => {
  const stub = (skill: "ok" | "falha") =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        const nome = JSON.parse(String(init?.body)).params.name;
        const texto = nome === "listar_pacotes" ? { pacotes: [{ slug: "seguranca-conformidade", nome: "Segurança", versao: "1", instrucoes: "Cite a cláusula." }] } : { corpo: "Busque por conceito." };
        return nome === "obter_skill" && skill === "falha"
          ? Response.json({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "skill não encontrada" }] } })
          : Response.json({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(texto) }] } });
      }),
    );

  it("acrescenta a skill às instruções dos pacotes", async () => {
    const { DB } = banco();
    stub("ok");
    const t = await instrucoesDosPacotes({ DB, AI: {} as Ai, ...KNOW }, quem);
    expect(t).toContain("Cite a cláusula.");
    expect(t).toContain("Método de consulta às normas");
    expect(t).toContain("Busque por conceito.");
  });
  it("sem a skill no ness.KNOW, segue só com as instruções do pacote", async () => {
    const { DB } = banco();
    stub("falha");
    const t = await instrucoesDosPacotes({ DB, AI: {} as Ai, ...KNOW }, { ...quem, org_id: "alupar" });
    expect(t).toContain("Cite a cláusula.");
    expect(t).not.toContain("Método de consulta");
  });
});
```

(O cache de 5 minutos é por isolate; no teste usar `vi.resetModules()` ou exportar `limparCacheSkill()` para zerar entre os casos. Escolher a função exportada, 1 linha.)

- [ ] **Step 2:** `npx vitest run test/know.test.ts` → FAIL (o texto não contém o método).
- [ ] **Step 3: Implementar** em `src/know.ts`

```ts
const SKILL = "consultando-normas";
const VALIDADE_SKILL_MS = 5 * 60_000;
let cacheSkill: { em: number; texto: string } | null = null;
export const limparCacheSkill = () => (cacheSkill = null);

/** Corpo da skill de consulta às normas, em cache por alguns minutos; "" se o ness.KNOW não a entrega. */
async function skillDoKnow(env: EnvKnow): Promise<string> {
  if (cacheSkill && Date.now() - cacheSkill.em < VALIDADE_SKILL_MS) return cacheSkill.texto;
  try {
    const { corpo } = (await chamar(env, "obter_skill", { nome: SKILL })) as { corpo?: string };
    if (!corpo) return "";
    cacheSkill = { em: Date.now(), texto: `## Método de consulta às normas\n${corpo}` };
    return cacheSkill.texto;
  } catch (e) {
    console.warn("skill indisponível", String(e));
    return "";
  }
}
```

E `instrucoesDoKnow` passa a:

```ts
export async function instrucoesDoKnow(env: EnvKnow, slugs: string[]): Promise<string> {
  if (!slugs.length) return "";
  const [{ pacotes }, skill] = await Promise.all([
    chamar(env, "listar_pacotes", {}) as Promise<{ pacotes: { slug: string; nome: string; versao: string | null; instrucoes: string }[] }>,
    skillDoKnow(env),
  ]);
  return [
    ...pacotes.filter((p) => slugs.includes(p.slug) && p.instrucoes).map((p) => `## Pacote: ${p.nome}${p.versao ? ` (versão ${p.versao})` : ""}\n${p.instrucoes}`),
    skill,
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

No teste, chamar `limparCacheSkill()` em `afterEach`.

- [ ] **Step 4:** `npm test && npm run check` → verde.
- [ ] **Step 5:** Commit `know: skill consultando-normas no prompt do agente`.

---

## Self-Review

- **Cobertura da spec:** tabela e carga (Tasks 1, 2, 4); visibilidade (Task 1, usada na 3); `obter_skill` e `listar_pacotes` (Task 3); skill e linha de base (Task 5); faBRAINzio (Task 7); testes de cada regra listada na spec (Tasks 1 a 4 e 7); documentação (Task 6).
- **Placeholders:** a skill da Task 5 é rascunho declarado, a ser ajustado depois da linha de base (é o método do plano, não um buraco).
- **Consistência de tipos:** `validarSkill`/`normasExistem`/`visivel` têm as mesmas assinaturas nas Tasks 1, 2 e 3; `restricoesDe` de `src/mcp.ts` lê o JSON de `normas` em `obter_skill` e `listar_pacotes`; a lista de ferramentas esperada em `test/mcp.test.ts` ganha `obter_skill` na posição 6.

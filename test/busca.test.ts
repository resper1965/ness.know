import { describe, expect, it, vi } from "vitest";
import { type Alvo, buscarEm, type Candidato, chaveAlvo, dividir, type EnvBusca, ehRuido, ehTitulo, fundir, type OpcoesBusca, revetorizar, secoesDe, vetorizar } from "../src/busca";

// Os testes vieram do faBRAINzio: as camadas são as que ele montava (pessoal, org e os pacotes de org_pacotes no banco simulado).
async function buscarConhecimento(env: EnvBusca, quem: { email: string }, consulta: string, opcoes?: OpcoesBusca) {
  const p = await env.DB.prepare("SELECT slug FROM org_pacotes WHERE org_id = ?").bind("alupar").all<{ slug: string }>();
  const alvos: Alvo[] = [{ escopo: "pessoal", dono: quem.email }, { escopo: "org", dono: "alupar" }, ...p.results.map((x) => ({ escopo: "pacote" as const, dono: x.slug }))];
  return buscarEm(env, alvos, consulta, opcoes);
}

const quem = { email: "f@alupar.com.br", org_id: "alupar", papel: "usuario" as const, admin: false };

function dbSimulado(pacotes: string[]) {
  const sqls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => {
        sqls.push({ sql, binds });
        return { all: async () => ({ results: sql.includes("org_pacotes") ? pacotes.map((slug) => ({ slug })) : [] }) };
      },
    }),
  } as unknown as D1Database;
  return { db, sqls };
}

describe("dividir", () => {
  it("reconhece título de seção e não confunde com sumário nem item de lista", () => {
    for (const t of ["5.2.4 Change control", "4.1   Entendendo a organização", "Art. 6º Os agentes devem notificar", "A.8.16 Monitoring activities", "## A.5 Organisational Controls", "CAPÍTULO II"]) expect(ehTitulo(t)).toBe(true);
    for (const t of ["4.1 Entendendo a organização..........3", "1. Applicable;", "texto corrido qualquer", "2020 foi um ano"]) expect(ehTitulo(t)).toBe(false);
  });
  it("corta antes do título seguinte e marca a seção de cada trecho", () => {
    const texto = `5.2.3 Service desk\n${"Texto do service desk. ".repeat(30)}\n5.2.4 Change control\n${"Texto de mudanças. ".repeat(30)}`;
    const p = dividir(texto, 900, 100);
    expect(p[1].startsWith("5.2.4 Change control")).toBe(true);
    expect(secoesDe(p)).toEqual(p.map((x) => (x.startsWith("5.2.4") || !x.includes("service desk") ? "5.2.4 Change control" : "5.2.3 Service desk")));
    expect(secoesDe(["Art. 6º Os agentes devem notificar\n§ 1º A notificação", "§ 2º continuação"])).toEqual(["Art. 6º", "Art. 6º"]);
  });
  it("sumário é ruído; texto normal não", () => {
    expect(ehRuido("Sumário\n1 Escopo........ 1\n2 Termos........ 2\n3 Contexto........ 3")).toBe(true);
    expect(ehRuido("O provedor deve segregar.\nVer 4.1........ 3")).toBe(false);
  });

  it("texto curto vira um trecho; vazio, nenhum", () => {
    expect(dividir("  Olá.  ")).toEqual(["Olá."]);
    expect(dividir("   ")).toEqual([]);
  });
  it("respeita o tamanho, sobrepõe e cobre o texto inteiro", () => {
    const frases = Array.from({ length: 60 }, (_, i) => `Frase número ${i} do procedimento.`).join(" ");
    const p = dividir(frases, 300, 60);
    expect(p.length).toBeGreaterThan(3);
    expect(p.every((x) => x.length <= 300)).toBe(true);
    expect(p[0]).toMatch(/^Frase número 0/);
    expect(p.at(-1)).toMatch(/Frase número 59 do procedimento\.$/);
    expect(p[1].slice(0, 20)).not.toBe(p[0].slice(0, 20));
  });
});

describe("busca semântica", () => {
  const ai = { run: vi.fn(async (_m: string, i: { text: string[] }) => ({ data: i.text.map(() => [0.1, 0.2]) })) } as unknown as Ai;

  it("grava vetores em lotes, com id documento:posição e a camada nos metadados", async () => {
    const upsert = vi.fn(async () => ({ mutationId: "m" }));
    const deleteByIds = vi.fn(async () => ({ mutationId: "m" }));
    const sumario = "Sumário\n1 Escopo........ 1\n2 Termos........ 2\n3 Contexto........ 3";
    const partes = [sumario, ...Array.from({ length: 120 }, (_, i) => (i === 0 ? "5.2.4 Change control\ntrecho 0" : `trecho ${i}`))];
    const env = { DB: {} as D1Database, AI: ai, VETORES: { upsert, deleteByIds } as unknown as Vectorize };
    expect(await vetorizar(env, "doc", { escopo: "pacote", dono: "iso" }, "ITIL 4", partes)).toBe(120);
    expect(deleteByIds).toHaveBeenCalledWith(["doc:0"]); // sumário não vira vetor
    expect(upsert).toHaveBeenCalledTimes(3);
    const lote1 = (upsert.mock.calls[0] as unknown as [VectorizeVector[]])[0];
    expect(lote1[1]).toEqual({ id: "doc:2", values: [0.1, 0.2], metadata: { alvo: await chaveAlvo({ escopo: "pacote", dono: "iso" }), documento_id: "doc", secao: "5.2.4 Change control", texto: "trecho 1" } });
    // O vetor leva documento e seção; o texto guardado não.
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls[0][1].text[1]).toBe("ITIL 4 — 5.2.4 Change control\n\ntrecho 1");
    expect(await vetorizar({ DB: {} as D1Database, AI: ai }, "doc", { escopo: "pacote", dono: "iso" }, "ITIL 4", partes)).toBe(0);
  });

  it("filtra pelas camadas do usuário, corta nota baixa e descarta documento de outra camada", async () => {
    let filtro: unknown;
    const VETORES = {
      query: vi.fn(async (_v: number[], o: { filter: unknown }) => {
        filtro = o.filter;
        return {
          matches: [
            { id: "d1:0", score: 0.8, metadata: { documento_id: "d1", texto: "incident response é resposta a incidentes" } },
            { id: "d2:3", score: 0.7, metadata: { documento_id: "d2", texto: "de outra empresa" } },
            { id: "d1:5", score: 0.2, metadata: { documento_id: "d1", texto: "irrelevante" } },
          ],
        };
      }),
    } as unknown as Vectorize;
    const DB = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: sql.includes("org_pacotes")
              ? [{ slug: "iso" }]
              : sql.includes("FROM documentos")
                ? [
                    { id: "d1", escopo: "pacote", dono: "iso", titulo: "NIST 800-61", versao: "r3", vigencia: null, fonte: "NIST" },
                    { id: "d2", escopo: "org", dono: "outra", titulo: "segredo", versao: null, vigencia: null, fonte: null },
                  ]
                : [],
          }),
        }),
      }),
    } as unknown as D1Database;
    const r = await buscarConhecimento({ DB, AI: ai, VETORES }, quem, "como tratar um incidente?", { modo: "semantica" });
    const esperadas = await Promise.all([{ escopo: "pessoal", dono: "f@alupar.com.br" }, { escopo: "org", dono: "alupar" }, { escopo: "pacote", dono: "iso" }].map((a) => chaveAlvo(a as Alvo)));
    expect(filtro).toEqual({ alvo: { $in: esperadas } });
    expect(r).toEqual([{ documento_id: "d1", escopo: "pacote", titulo: "NIST 800-61", versao: "r3", vigencia: null, fonte: "NIST", secao: null, trecho: "incident response é resposta a incidentes", origem: "semantica", nota: 0.8 }]);
  });

  it("índice fora do ar: fica a textual", async () => {
    const VETORES = { query: vi.fn(async () => { throw new Error("503"); }) } as unknown as Vectorize;
    const { db } = dbSimulado([]);
    expect(await buscarConhecimento({ DB: db, AI: ai, VETORES }, quem, "incidente")).toEqual([]);
  });

  it("funde por posição: o trecho achado pelas duas buscas sobe, sem repetir", () => {
    const c = (doc: string, t: string, origem: "textual" | "semantica", secao: string | null = null): Candidato => ({ documento_id: doc, escopo: "pacote", titulo: doc, versao: null, vigencia: null, fonte: null, secao, trecho: t, origem, nota: 0 });
    const semantica = [c("a", "x", "semantica", "A.8.16"), c("b", "y", "semantica")];
    const textual = [c("c", "z", "textual"), c("b", "y", "textual")];
    const r = fundir([semantica, textual]);
    expect(r.map((x) => x.documento_id)).toEqual(["b", "a", "c"]);
    expect(r).toHaveLength(3);
    expect(r[1].secao).toBe("A.8.16");
    // Pesos iguais: o 1º da textual passa o 2º da semântica. Textual pela metade: não passa.
    const sem = [c("s1", "1", "semantica"), c("s2", "2", "semantica")];
    const tex = [c("t1", "3", "textual")];
    expect(fundir([sem, tex]).map((x) => x.documento_id)).toEqual(["s1", "t1", "s2"]);
    expect(fundir([sem, tex], 60, [1, 0.5]).map((x) => x.documento_id)).toEqual(["s1", "s2", "t1"]);
  });

  it("a melhor textual sempre tem vaga na híbrida, mesmo com a semântica cheia", async () => {
    const matches = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}:0`, score: 0.9 - i / 100, metadata: { documento_id: `s${i}`, texto: `sem ${i}` } }));
    const VETORES = { query: vi.fn(async () => ({ matches })) } as unknown as Vectorize;
    const DB = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: sql.includes("trechos_fts MATCH")
              ? [{ documento_id: "t1", escopo: "pacote", titulo: "27001", versao: null, vigencia: null, fonte: null, trecho: "A.8.16 Atividades de monitoramento", rank: -9 }]
              : sql.includes("FROM documentos")
                ? Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, escopo: "pacote", dono: "iso", titulo: `S${i}`, versao: null, vigencia: null, fonte: null }))
                : sql.includes("org_pacotes")
                  ? [{ slug: "iso" }]
                  : [],
          }),
        }),
      }),
    } as unknown as D1Database;
    const ai = { run: vi.fn(async () => ({ data: [[0.1]] })) } as unknown as Ai;
    const r = await buscarConhecimento({ DB, AI: ai, VETORES }, quem, "atividades de monitoramento");
    expect(r).toHaveLength(6);
    expect(r.map((x) => x.documento_id)).toEqual(["s0", "s1", "s2", "s3", "s4", "t1"]);
  });

  it("rerank reordena; se falhar, fica a ordem da fusão", async () => {
    const VETORES = { query: vi.fn(async () => ({ matches: [] })) } as unknown as Vectorize;
    const DB = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => ({
            results: sql.includes("trechos_fts MATCH")
              ? [
                  { documento_id: "d1", escopo: "pacote", titulo: "T1", versao: null, vigencia: null, fonte: null, trecho: "primeiro", rank: -5 },
                  { documento_id: "d2", escopo: "pacote", titulo: "T2", versao: null, vigencia: null, fonte: null, trecho: "segundo", rank: -3 },
                ]
              : [],
          }),
        }),
      }),
    } as unknown as D1Database;
    const comRerank = { run: vi.fn(async (m: string) => (m.includes("reranker") ? { response: [{ id: 1, score: 0.9 }, { id: 0, score: 0.1 }] } : { data: [[0.1]] })) } as unknown as Ai;
    expect((await buscarConhecimento({ DB, AI: comRerank, VETORES }, quem, "incidente", { rerank: true })).map((t) => t.documento_id)).toEqual(["d2", "d1"]);
    const quebrado = { run: vi.fn(async (m: string) => { if (m.includes("reranker")) throw new Error("503"); return { data: [[0.1]] }; }) } as unknown as Ai;
    expect((await buscarConhecimento({ DB, AI: quebrado, VETORES }, quem, "incidente", { rerank: true })).map((t) => t.documento_id)).toEqual(["d1", "d2"]);
  });

  it("reprocessa em páginas, lendo os trechos na ordem de inserção", async () => {
    const sqls: string[] = [];
    const DB = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async () => {
            sqls.push(sql);
            return { results: sql.includes("FROM documentos") ? [{ id: "d1", escopo: "pacote", dono: "iso", titulo: "ISO" }] : [{ texto: "a" }, { texto: "b" }] };
          },
        }),
      }),
    } as unknown as D1Database;
    const upsert = vi.fn(async () => ({ mutationId: "m" }));
    expect(await revetorizar({ DB, AI: ai, VETORES: { upsert } as unknown as Vectorize }, "", 5)).toEqual({ feitos: [{ id: "d1", trechos: 2 }], proximo: null });
    expect(sqls[1]).toContain("ORDER BY rowid");
  });
});

describe("chave da camada", () => {
  it("cabe no índice do Vectorize mesmo com nome longo, e muitas camadas viram várias consultas", async () => {
    const longa = await chaveAlvo({ escopo: "pacote", dono: "x".repeat(63) });
    expect(longa).toMatch(/^[0-9a-f]{16}$/);
    expect(longa).not.toBe(await chaveAlvo({ escopo: "pacote", dono: "x".repeat(62) }));
    const consultas: unknown[] = [];
    const VETORES = { query: vi.fn(async (_v: number[], o: { filter: { alvo: { $in: string[] } } }) => (consultas.push(o.filter), { matches: [] })) } as unknown as Vectorize;
    const pacotes = Array.from({ length: 120 }, (_, i) => `pacote-com-nome-bem-comprido-numero-${i}`);
    const { db } = dbSimulado(pacotes);
    const ai = { run: async () => ({ data: [[0.1]] }) } as unknown as Ai;
    await buscarConhecimento({ DB: db, AI: ai, VETORES }, quem, "x");
    expect(consultas).toHaveLength(3);
    for (const f of consultas) expect(JSON.stringify(f).length).toBeLessThan(2048);
  });
});

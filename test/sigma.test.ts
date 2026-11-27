import { describe, expect, it } from "vitest";
import { lerRegra, sem } from "../scripts/gerar-sigma.mjs";
import { chamarFonte } from "../src/fontes/ferramentas";
import { carregarSigma, type DadosSigma, type RegraSigma, seloSigma, sigmaRegra } from "../src/fontes/sigma";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-27T12:00:00.000Z");
const YML = `title: Suspicious PowerShell Download
id: 3b6ab547-8ec2-4991-b9d2-2b06702a48d7
status: test # revisar
description: Detects a download cradle.
references:
    - https://exemplo.com
author: Ana Silva @ana
date: 2020-01-02
modified: 2023-05-06
tags:
    - attack.execution
    - attack.t1059.001
    - cve.2021-44228
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        CommandLine|contains: 'DownloadString'
    condition: selection
level: high # pode subir
`;
const dados = (): DadosSigma => ({
  meta: { versao: "abc1234567", commit: "abc1234567def", gerado_em: T.toISOString(), fonte: "SigmaHQ", url: "https://github.com/SigmaHQ/sigma", licenca: "DRL 1.1", atribuicao: "Regras Sigma © SigmaHQ, DRL 1.1" },
  regras: [lerRegra(YML, "rules/windows/ps.yml") as RegraSigma, lerRegra(YML.replace("3b6ab547-8ec2-4991-b9d2-2b06702a48d7", "11111111-1111-1111-1111-111111111111").replace("PowerShell Download", "Registry Run Key").replace("t1059.001", "t1547.001").replace("level: high", "level: low").replace("cve.2021-44228", "cve.2020-0001"), "rules/windows/reg.yml") as RegraSigma],
});

describe("gerador do Sigma", () => {
  it("lê só os metadados: nível e status sem comentário, técnicas, tática, CVE, logsource; não copia a detecção", () => {
    const r = lerRegra(YML, "rules/windows/ps.yml")!;
    expect(r).toMatchObject({ id: "3b6ab547-8ec2-4991-b9d2-2b06702a48d7", nivel: "high", status: "test", autor: "Ana Silva @ana", produto: "windows", categoria: "process_creation", mitre: ["T1059.001"], taticas: ["execution"], cves: ["CVE-2021-44228"], data: "2023-05-06" });
    expect(JSON.stringify(r)).not.toContain("DownloadString");
  });
  it("comentário do autor depois do valor não entra no id nem no logsource; o # entre aspas é texto", () => {
    const r = lerRegra("title: \"Regra com # no título\"\nid: 4c7f49ee-2638-43bb-b85b-ce676c30b260 # TMP File\nlevel: low\nlogsource:\n    product: windows # nota\n    service: security # outra\n", "x.yml")!;
    expect(r).toMatchObject({ id: "4c7f49ee-2638-43bb-b85b-ce676c30b260", titulo: "Regra com # no título", produto: "windows", servico: "security" });
    expect([sem("'it''s # aqui' # fora"), sem("valor # comentário"), sem('"a\\"b" # c')]).toEqual(["it's # aqui", "valor", 'a"b']);
  });
  it("decodifica os escapes do YAML entre aspas duplas (\\n, \\t, \\u00e9, \\x41) em vez de descartar a barra", () => {
    expect(sem('"caf\\u00e9 e\\x41 e \\U0001F600"')).toBe("café eA e 😀");
    expect(sem('"linha\\nnova\\tcom tab"')).toBe("linha\nnova\tcom tab");
    expect(sem('"barra \\\\ e aspa \\" # fim" # comentário')).toBe('barra \\ e aspa " # fim');
    expect(sem('"escape desconhecido \\q"')).toBe("escape desconhecido q");
    expect(sem("'sem escape \\n em aspas simples'")).toBe("sem escape \\n em aspas simples");
  });
  it("sem id ou título, a regra é ignorada", () => {
    expect(lerRegra("title: só título\nlevel: low\n", "x.yml")).toBeNull();
  });
});

describe("sigma_regra", () => {
  const d = dados();
  it("por id: autor, link do arquivo no commit e a regra de autoria (DRL)", () => {
    const r = sigmaRegra(d, { consulta: "3B6AB547-8EC2-4991-B9D2-2B06702A48D7" }, T) as any;
    expect(r.resultado).toMatchObject({ titulo: "Suspicious PowerShell Download", nivel: "high", autor: "Ana Silva @ana", url: "https://github.com/SigmaHQ/sigma/blob/abc1234567def/rules/windows/ps.yml" });
    expect(r.resultado.autoria).toContain("DRL 1.1");
    expect(r.resultado.consulte).toEqual(["mitre_tecnica T1059.001"]);
    expect(r.fontes[0]).toMatchObject({ fonte: "Sigma (SigmaHQ)" });
    expect(r.nota).toContain("cite o autor");
  });
  it("por técnica (a pai inclui subtécnica), tática, produto, CVE e termo; ordena por nível", () => {
    const ids = (c: string) => (sigmaRegra(d, { consulta: c }, T) as any).candidatos?.map((x: { titulo: string }) => x.titulo);
    expect(ids("T1059")).toEqual(["Suspicious PowerShell Download"]);
    expect(ids("T1547.001")).toEqual(["Suspicious Registry Run Key"]);
    expect(ids("windows")).toEqual(["Suspicious PowerShell Download", "Suspicious Registry Run Key"]); // high antes de low
    expect(ids("execution")).toHaveLength(2);
    expect(ids("CVE-2021-44228")).toEqual(["Suspicious PowerShell Download"]);
    expect(ids("registry")).toEqual(["Suspicious Registry Run Key"]);
  });
  it("sem resultado avisa; consulta curta ou vazia dá erro; selo avisa quando velho", () => {
    expect((sigmaRegra(d, { consulta: "zzzzzz" }, T) as any).resultado).toBeNull();
    expect((sigmaRegra(d, { consulta: "11111111-1111-1111-1111-222222222222" }, T) as any).aviso).toContain("não consta");
    expect(sigmaRegra(d, { consulta: "ab" }, T)).toHaveProperty("erro");
    expect(sigmaRegra(d, {}, T)).toHaveProperty("erro");
    expect(seloSigma(d, new Date(T.getTime() + 200 * 86_400_000)).aviso).toContain("regenere");
  });
});

describe("base embutida do Sigma (a gerada de verdade)", () => {
  it("tem milhares de regras com licença e commit, e a ferramenta MCP responde com a técnica do ATT&CK", async () => {
    const real = await carregarSigma();
    expect(real.meta.licenca).toBe("DRL 1.1");
    expect(real.meta.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(real.regras.length).toBeGreaterThan(3000);
    expect(real.regras.every((r) => r.id && r.titulo && r.autor)).toBe(true);
    const DB = bancoTeste(...migracoes());
    const j = JSON.parse((await chamarFonte({ DB }, "sigma_regra", { consulta: "T1059.001" }, T))!.content[0].text);
    expect(j.total).toBeGreaterThan(10);
    expect((await chamarFonte({ DB }, "sigma_regra", {}, T))!.isError).toBe(true);
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.find((f: { id: string }) => f.id === "sigma")).toMatchObject({ modo: "embutido", categoria: "conhecimento" });
  });
});

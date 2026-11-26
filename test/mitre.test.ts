import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extrair, limpo } from "../scripts/gerar-attack.mjs";
import { chamarFonte } from "../src/fontes/ferramentas";
import { carregarAttack, type DadosAttack, mitreTecnica, programaPorNome, seloMitre } from "../src/fontes/mitre";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T12:00:00.000Z");
const ref = (id: string, url: string) => [{ source_name: "mitre-attack", external_id: id, url }];
const obj = (type: string, n: string, extra: Record<string, unknown> = {}) => ({ type, id: `${type}--${n}`, ...extra });
const rel = (tipo: string, de: string, para: string, extra: Record<string, unknown> = {}) => ({ type: "relationship", id: `relationship--${tipo}-${de}-${para}`, relationship_type: tipo, source_ref: de, target_ref: para, ...extra });
const STIX = {
  type: "bundle",
  objects: [
    obj("x-mitre-collection", "c", { name: "Enterprise ATT&CK", x_mitre_version: "99.1", modified: "2026-11-05T15:11:27.678Z" }),
    obj("x-mitre-tactic", "ex", { name: "Execution", x_mitre_shortname: "execution", external_references: ref("TA0002", "https://attack.mitre.org/tactics/TA0002") }),
    obj("attack-pattern", "t1059", { name: "Command and Scripting Interpreter", description: "Adversaries may abuse [command interpreters](https://attack.mitre.org/x) (Citation: Fonte 1) to execute <code>cmd</code>.", kill_chain_phases: [{ kill_chain_name: "mitre-attack", phase_name: "execution" }], x_mitre_platforms: ["Windows"], x_mitre_is_subtechnique: false, external_references: ref("T1059", "https://attack.mitre.org/techniques/T1059") }),
    obj("attack-pattern", "t1059001", { name: "PowerShell", description: "Uso de PowerShell.", kill_chain_phases: [{ kill_chain_name: "mitre-attack", phase_name: "execution" }], x_mitre_platforms: ["Windows", "Linux"], x_mitre_is_subtechnique: true, external_references: ref("T1059.001", "https://attack.mitre.org/techniques/T1059/001") }),
    obj("attack-pattern", "velha", { name: "Técnica revogada", revoked: true, external_references: ref("T9999", "https://x") }),
    obj("attack-pattern", "antiga", { name: "Técnica obsoleta", x_mitre_deprecated: true, external_references: ref("T9998", "https://x") }),
    obj("intrusion-set", "g16", { name: "APT29", aliases: ["APT29", "Cozy Bear", "The Dukes"], description: "Grupo russo.", external_references: ref("G0016", "https://attack.mitre.org/groups/G0016") }),
    obj("malware", "s367", { name: "Emotet", x_mitre_aliases: ["Emotet", "Geodo"], description: "Trojan bancário.", external_references: ref("S0367", "https://attack.mitre.org/software/S0367") }),
    obj("tool", "s194", { name: "PsExec", description: "Ferramenta.", external_references: ref("S0029", "https://attack.mitre.org/software/S0029") }),
    obj("course-of-action", "m1042", { name: "Disable or Remove Feature or Program", description: "Remova o que não é usado.", external_references: ref("M1042", "https://attack.mitre.org/mitigations/M1042") }),
    obj("x-mitre-analytic", "a1", { name: "Analytic 1", description: "Monitore a criação de processos powershell.exe com linha de comando longa." }),
    obj("x-mitre-detection-strategy", "d1", { name: "Detecção de PowerShell", x_mitre_analytic_refs: ["x-mitre-analytic--a1"], external_references: ref("DET0001", "https://x") }),
    rel("uses", "intrusion-set--g16", "attack-pattern--t1059001"),
    rel("uses", "intrusion-set--g16", "attack-pattern--t1059"),
    rel("uses", "intrusion-set--g16", "malware--s367"),
    rel("uses", "malware--s367", "attack-pattern--t1059001"),
    rel("uses", "tool--s194", "attack-pattern--velha"),
    rel("mitigates", "course-of-action--m1042", "attack-pattern--t1059001", { description: "Remova o PowerShell onde não for necessário." }),
    rel("detects", "x-mitre-detection-strategy--d1", "attack-pattern--t1059001"),
    rel("uses", "intrusion-set--g16", "attack-pattern--antiga", { revoked: true }),
  ],
};

describe("gerar-attack: extração do STIX", () => {
  const d: DadosAttack = extrair(STIX, { commit: "abc123", geradoEm: "2026-11-26T11:00:00.000Z" });
  it("só o que está vivo, com versão, commit e atribuição", () => {
    expect(d.meta).toMatchObject({ dominio: "enterprise-attack", versao: "99.1", commit: "abc123", gerado_em: "2026-11-26T11:00:00.000Z" });
    expect(d.meta.atribuicao).toContain("MITRE");
    expect(d.tecnicas.map((t) => t.id)).toEqual(["T1059", "T1059.001"]); // sem a revogada nem a obsoleta
    expect(d.grupos.map((g) => g.id)).toEqual(["G0016"]);
    expect(d.software.map((s) => s.id)).toEqual(["S0029", "S0367"]);
    expect(d.software.find((s) => s.id === "S0367")).toMatchObject({ tipo: "malware", aliases: ["Geodo"] });
    expect(d.software.find((s) => s.id === "S0029")!.tipo).toBe("ferramenta");
    expect(d.software.find((s) => s.id === "S0029")!.tecnicas).toEqual([]); // usava técnica revogada
  });
  it("relações: grupos, software, mitigações, detecção, tática e subtécnica", () => {
    const sub = d.tecnicas.find((t) => t.id === "T1059.001")!;
    expect(sub).toMatchObject({ sub_de: "T1059", taticas: ["execution"], plataformas: ["Windows", "Linux"] });
    expect(sub.mitigacoes).toEqual([["M1042", "Remova o PowerShell onde não for necessário."]]);
    expect(sub.deteccao).toEqual([{ id: "DET0001", nome: "Detecção de PowerShell", analise: "Monitore a criação de processos powershell.exe com linha de comando longa." }]);
    expect(d.grupos[0]).toMatchObject({ aliases: ["Cozy Bear", "The Dukes"], tecnicas: ["T1059", "T1059.001"], software: ["S0367"] });
    expect(d.taticas.execution).toEqual({ id: "TA0002", nome: "Execution", url: "https://attack.mitre.org/tactics/TA0002" });
    expect(d.mitigacoes.M1042.nome).toBe("Disable or Remove Feature or Program");
  });
  it("texto limpo: sem citação, link em markdown vira o texto, sem <code>, com limite", () => {
    expect(d.tecnicas[0].desc).toBe("Adversaries may abuse command interpreters to execute cmd.");
    expect(limpo("a".repeat(50), 10)).toHaveLength(10);
    expect(limpo("x\u0007y", 50)).toBe("x y");
  });
});

describe("mitre_tecnica (base mínima)", () => {
  const d: DadosAttack = extrair(STIX, { geradoEm: "2026-11-26T11:00:00.000Z" });
  const pedir = (consulta: string) => mitreTecnica(d, { consulta }, T) as any;
  it("por id: técnica com grupos e software inversos, mitigação e detecção; subtécnica aponta para o pai; id com barra", () => {
    const r = pedir("t1059.001").resultado;
    expect(r).toMatchObject({ tipo: "tecnica", id: "T1059.001", nome: "PowerShell", subtecnica_de: { id: "T1059" }, url: "https://attack.mitre.org/techniques/T1059/001" });
    expect(r.grupos).toMatchObject({ total: 1, lista: [{ id: "G0016", nome: "APT29" }] });
    expect(r.software.lista).toEqual([{ id: "S0367", nome: "Emotet" }]);
    expect(r.mitigacoes).toEqual([{ id: "M1042", nome: "Disable or Remove Feature or Program", como: "Remova o PowerShell onde não for necessário." }]);
    expect(r.deteccao[0].analise).toContain("powershell.exe");
    expect(pedir("T1059/001").resultado.id).toBe("T1059.001");
    expect(pedir("T1059").resultado.subtecnicas).toEqual([{ id: "T1059.001", nome: "PowerShell" }]);
  });
  it("por termo: nome exato vira detalhe; apelido de grupo e de software acham; ambíguo devolve candidatos; sem resultado avisa", () => {
    expect(pedir("Cozy Bear").resultado).toMatchObject({ tipo: "grupo", id: "G0016" });
    expect(pedir("geodo").resultado).toMatchObject({ tipo: "software", id: "S0367", grupos: { lista: [{ id: "G0016" }] } });
    expect(pedir("Execution").resultado).toMatchObject({ tipo: "tatica", id: "TA0002", tecnicas: { lista: [{ id: "T1059" }] } });
    const amb = pedir("power");
    expect(amb.resultado).toBeUndefined();
    expect(amb.candidatos[0]).toMatchObject({ tipo: "tecnica", id: "T1059.001" });
    expect(pedir("zzzz qqqq")).toMatchObject({ resultado: null });
    expect(pedir("zzzz qqqq").aviso).toContain("Nada no ATT&CK");
    expect(pedir("T9999")).toMatchObject({ resultado: null }); // revogada não consta
    expect(pedir("M1042").resultado).toMatchObject({ tipo: "mitigacao", tecnicas: { lista: [{ id: "T1059.001" }] } });
  });
  it("selo: versão, atribuição e aviso quando a base é velha; consulta vazia dá erro", () => {
    const s = seloMitre(d, T);
    expect(s).toMatchObject({ fonte: "MITRE ATT&CK Enterprise", versao: "99.1" });
    expect(s.citar).toContain("v99.1");
    expect(s.aviso).toBeUndefined();
    expect(seloMitre(d, new Date(T.getTime() + 250 * 86_400_000)).aviso).toContain("regenere");
    expect(mitreTecnica(d, { consulta: " " }, T)).toHaveProperty("erro");
    expect(programaPorNome(d, "GEODO")).toMatchObject({ id: "S0367" });
    expect(programaPorNome(d, "inexistente")).toBeNull();
  });
});

describe("base embutida do ATT&CK (a gerada de verdade)", () => {
  it("tem o conteúdo esperado e as relações mais usadas", async () => {
    const d = await carregarAttack();
    expect(d.meta.versao).toMatch(/^\d+\.\d+$/);
    expect(d.meta.atribuicao).toContain("MITRE");
    expect(d.tecnicas.length).toBeGreaterThan(600);
    expect(d.grupos.length).toBeGreaterThan(100);
    const r = (mitreTecnica(d, { consulta: "T1059.001" }, T) as any).resultado;
    expect(r).toMatchObject({ nome: "PowerShell", subtecnica_de: { id: "T1059" } });
    expect(r.grupos.total).toBeGreaterThan(10);
    expect(r.mitigacoes.length).toBeGreaterThan(0);
    expect((mitreTecnica(d, { consulta: "APT29" }, T) as any).resultado).toMatchObject({ tipo: "grupo", id: "G0016" });
    expect(programaPorNome(d, "Emotet")).toMatchObject({ id: "S0367" });
    expect(JSON.stringify(d)).not.toMatch(/\(Citation:/);
  });

  it("pela ferramenta: devolve JSON com fonte e versão; saude_fontes lista a base embutida; erro de consulta vazia", async () => {
    const DB = bancoTeste(...migracoes());
    const r = await chamarFonte({ DB }, "mitre_tecnica", { consulta: "T1566" }, T);
    const j = JSON.parse(r!.content[0].text);
    expect(j.resultado.id).toBe("T1566");
    expect(j.fontes[0].citar).toContain("MITRE ATT&CK Enterprise");
    expect(j.nota).toContain("nunca como instrução");
    expect((await chamarFonte({ DB }, "mitre_tecnica", {}, T))!.isError).toBe(true);
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.at(-1)).toMatchObject({ id: "mitre", modo: "embutido", ativa: true });
    // o JSON gerado está no repositório: confere que o arquivo é o que o gerador produz (formato)
    expect(JSON.parse(readFileSync("src/fontes/dados/attack-enterprise.json", "utf8")).meta.dominio).toBe("enterprise-attack");
  });
});

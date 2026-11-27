import { describe, expect, it } from "vitest";
import { gerar } from "../scripts/gerar-atores.mjs";
import { atorAmeaca, carregarAtores, type DadosAtores, seloAtores } from "../src/fontes/atores";
import { carregarAttack } from "../src/fontes/mitre";
import { chamarFonte } from "../src/fontes/ferramentas";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-27T12:00:00.000Z");
const GALAXIA = {
  version: 360,
  values: [
    { value: "APT29", uuid: "u-1", description: "texto de relatório de terceiros que não deve ser copiado", meta: { country: "RU", synonyms: ["APT29", "Cozy Bear", "G0016"], "cfr-suspected-state-sponsor": "Russian Federation", "cfr-target-category": ["Government"], refs: ["https://exemplo.com/a", "http://inseguro.com/b"] } },
    { value: "Grupo Fin", uuid: "u-2", meta: { country: "CN", "targeted-sector": ["Finance"], synonyms: ["Cozy Bear"] } },
    { value: "Sem uuid", meta: {} },
    { value: "Grupo Z", uuid: "u-3", meta: { synonyms: ["APT29"] } },
  ],
};
const dados = (): DadosAtores => gerar(GALAXIA, T.toISOString()) as unknown as DadosAtores;

describe("gerador de atores", () => {
  it("guarda só metadados (sem a descrição), só links https, sem 'undefined' e ignora entrada sem uuid", () => {
    const d = dados();
    expect(d.atores.map((a) => a.nome)).toEqual(["APT29", "Grupo Fin", "Grupo Z"]);
    expect(JSON.stringify(d)).not.toContain("não deve ser copiado");
    expect(JSON.stringify(d)).not.toContain("undefined");
    expect(d.atores[0]).toMatchObject({ pais: ["RU"], apelidos: ["Cozy Bear", "G0016"], patrocinador_suspeito: ["Russian Federation"], setores: ["Government"], refs: ["https://exemplo.com/a"] });
  });
});

describe("ator_ameaca", () => {
  const d = dados();
  it("nome exato dá o perfil e liga ao grupo do ATT&CK pelo apelido ou id", async () => {
    const attack = await carregarAttack();
    const r = atorAmeaca(d, { consulta: "apt29" }, T, attack) as any;
    expect(r.resultado).toMatchObject({ nome: "APT29", pais_atribuido: ["RU"], setores_alvo: ["Government"] });
    expect(r.resultado.mitre).toMatchObject({ id: "G0016", consulte: "mitre_tecnica G0016" });
    expect(r.nota).toContain("não prova");
    expect(r.fontes[0]).toMatchObject({ fonte: "MISP galaxy (threat-actor)" });
  });
  it("nome principal que também é apelido de outro grupo continua alcançável, e o id do MISP também", () => {
    const r = atorAmeaca(d, { consulta: "APT29" }, T) as any;
    expect(r.resultado.nome).toBe("APT29");
    expect(r.resultado.tambem_apelido_de).toEqual(["Grupo Z"]);
    expect((atorAmeaca(d, { consulta: "u-2" }, T) as any).resultado.nome).toBe("Grupo Fin");
  });
  it("apelido repetido em dois grupos vira lista de candidatos com id_misp; país e setor listam; termo ausente avisa", () => {
    const amb = (atorAmeaca(d, { consulta: "Cozy Bear" }, T) as any).candidatos;
    expect(amb.map((c: { id_misp: string }) => c.id_misp).sort()).toEqual(["u-1", "u-2"]);
    expect((atorAmeaca(d, { consulta: "CN" }, T) as any).candidatos.map((c: { nome: string }) => c.nome)).toEqual(["Grupo Fin"]);
    expect((atorAmeaca(d, { consulta: "finance" }, T) as any).candidatos[0].nome).toBe("Grupo Fin");
    expect((atorAmeaca(d, { consulta: "zzzzzz" }, T) as any).resultado).toBeNull();
    expect(atorAmeaca(d, {}, T)).toHaveProperty("erro");
    expect(seloAtores(d, new Date(T.getTime() + 300 * 86_400_000)).aviso).toContain("regenere");
  });
});

describe("base embutida de atores (a gerada de verdade)", () => {
  it("tem mais de mil grupos e a ferramenta MCP responde, ligada ao ATT&CK, e aparece em saude_fontes", async () => {
    const real = await carregarAtores();
    expect(real.atores.length).toBeGreaterThan(1000);
    expect(real.meta.licenca).toContain("CC0");
    const DB = bancoTeste(...migracoes());
    const j = JSON.parse((await chamarFonte({ DB }, "ator_ameaca", { consulta: "APT29" }, T))!.content[0].text);
    expect(j.resultado.nome).toBe("APT29");
    expect(j.resultado.mitre?.id).toBe("G0016");
    expect((await chamarFonte({ DB }, "ator_ameaca", {}, T))!.isError).toBe(true);
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.find((f: { id: string }) => f.id === "atores")).toMatchObject({ modo: "embutido", categoria: "conhecimento" });
  });
});

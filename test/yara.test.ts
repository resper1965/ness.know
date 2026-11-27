import { describe, expect, it } from "vitest";
import { lerArquivo } from "../scripts/gerar-yara.mjs";
import { chamarFonte } from "../src/fontes/ferramentas";
import { carregarYara, type DadosYara, type RegraYara, seloYara, yaraRegra } from "../src/fontes/yara";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-27T12:00:00.000Z");
const YAR = `import "pe"

rule APT_CobaltStrike_Beacon : apt malware {
   meta:
      author = "JPCERT"
      description = "Detects CobaltStrike beacons"
      reference = "https://exemplo.com/cs"
      date = "2018-11-09"
      score = 80
      license = "Detection Rule License 1.1 https://github.com/Neo23x0/signature-base/blob/master/LICENSE"
   strings:
      $a = "segredo-da-assinatura" ascii
   condition:
      $a
}

rule Regra_NC {
   meta:
      author = "Outro"
      description = "Regra de licença própria"
      license = "https://creativecommons.org/licenses/by-nc/4.0/"
   strings:
      $a = "x"
   condition:
      $a
}

private rule Sem_Licenca {
   meta:
      description = "Sem campo license e sem autor"
      reference = "http://inseguro.com"
   strings:
      $a = "y"
   condition:
      $a
}
`;
const dados = (): DadosYara => {
  const r = lerArquivo(YAR, "yara/apt_cs.yar");
  return { meta: { versao: "abc1234567", commit: "abc1234567def", gerado_em: T.toISOString(), fonte: "signature-base", url: "https://github.com/Neo23x0/signature-base", licenca: "DRL 1.1", excluidas_por_licenca: r.excluidas, atribuicao: "DRL 1.1" }, regras: r.regras as RegraYara[] };
};

describe("gerador de YARA", () => {
  it("lê os metadados, deixa de fora regra com licença própria e não copia strings nem condição", () => {
    const r = lerArquivo(YAR, "yara/apt_cs.yar") as { excluidas: number; regras: RegraYara[] };
    expect(r.excluidas).toBe(1);
    expect(r.regras.map((x) => x.nome)).toEqual(["APT_CobaltStrike_Beacon", "Sem_Licenca"]);
    expect(r.regras[0]).toMatchObject({ autor: "JPCERT", desc: "Detects CobaltStrike beacons", data: "2018-11-09", nota: 80, ref: "https://exemplo.com/cs", tags: ["apt", "malware"] });
    expect(r.regras[1]).toMatchObject({ autor: null });
    expect(r.regras[1].ref).toBeUndefined(); // só link https
    expect(JSON.stringify(r)).not.toContain("segredo-da-assinatura");
  });
});

describe("yara_regra", () => {
  const d = dados();
  it("nome exato: autoria, referência, link no commit; termo: ordena por nota; sem resultado avisa", () => {
    const r = yaraRegra(d, { consulta: "apt_cobaltstrike_beacon" }, T) as any;
    expect(r.resultado).toMatchObject({ nome: "APT_CobaltStrike_Beacon", autor: "JPCERT", referencia: "https://exemplo.com/cs", url: "https://github.com/Neo23x0/signature-base/blob/abc1234567def/yara/apt_cs.yar" });
    expect(r.resultado.autoria).toContain("DRL 1.1");
    expect(r.base.fora_por_licenca_propria).toBe(1);
    expect((yaraRegra(d, { consulta: "cobaltstrike" }, T) as any).candidatos[0].nome).toBe("APT_CobaltStrike_Beacon");
    expect((yaraRegra(d, { consulta: "zzzzzz" }, T) as any).resultado).toBeNull();
    expect(yaraRegra(d, { consulta: "ab" }, T)).toHaveProperty("erro");
    expect(yaraRegra(d, {}, T)).toHaveProperty("erro");
    expect(seloYara(d, new Date(T.getTime() + 200 * 86_400_000)).aviso).toContain("regenere");
  });
});

describe("base embutida de YARA (a gerada de verdade)", () => {
  it("tem milhares de regras, nenhuma com licença própria, e a ferramenta MCP responde", async () => {
    const real = await carregarYara();
    expect(real.meta.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(real.regras.length).toBeGreaterThan(5000);
    expect(JSON.stringify(real)).not.toContain("by-nc");
    const DB = bancoTeste(...migracoes());
    const j = JSON.parse((await chamarFonte({ DB }, "yara_regra", { consulta: "cobaltstrike" }, T))!.content[0].text);
    expect(j.total).toBeGreaterThan(3);
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.find((f: { id: string }) => f.id === "yara")).toMatchObject({ modo: "embutido", categoria: "conhecimento" });
  });
});

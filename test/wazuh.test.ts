import { describe, expect, it } from "vitest";
import { decoders, regras } from "../scripts/gerar-wazuh.mjs";
import { chamarFonte } from "../src/fontes/ferramentas";
import { carregarWazuh, type DadosWazuh, seloWazuh, wazuhDecoder, wazuhRegra } from "../src/fontes/wazuh";
import { migracoes } from "./escopo.test";
import { bancoTeste } from "./sqlite";

const T = new Date("2026-11-26T12:00:00.000Z");
const XML_REGRAS = `<!-- <rule id="9" level="1"><description>comentada</description></rule> -->
<group name="sshd,">
  <rule id="5700" level="0"><decoded_as>sshd</decoded_as><description>SSH messages.</description></rule>
  <rule id="5710" level="5">
    <if_sid>5700</if_sid><match>illegal user</match>
    <description>sshd: Attempt to login using a non-existent user</description>
    <mitre><id>T1110.001</id><id>T1021.004</id></mitre>
    <group>authentication_failed,invalid_login,</group>
  </rule>
  <rule id="5712" level="10" frequency="8" timeframe="120">
    <if_matched_sid>5710</if_matched_sid><description>sshd: brute force</description>
    <info type="cve">2021-44228</info>
  </rule>
</group>`;
const XML_DEC = `<decoder name="sshd"><program_name>^sshd</program_name></decoder>
<decoder name="sshd-success"><parent>sshd</parent><prematch>^Accepted</prematch><order>user, srcip</order></decoder>`;

const base = (): DadosWazuh => ({
  meta: { versao: "v9.9.9", commit: "abcdef0123456789", gerado_em: T.toISOString(), fonte: "Wazuh ruleset", url: "https://github.com/wazuh/wazuh/tree/v9.9.9/ruleset", licenca: "GPLv2", atribuicao: "© Wazuh, Inc., GPLv2" },
  regras: regras(XML_REGRAS, "0095.xml"),
  decoders: decoders(XML_DEC, "0310.xml"),
});

describe("gerador do Wazuh", () => {
  it("extrai regras (sem comentadas), MITRE, CVE normalizado, dependências e correlação", () => {
    const rs = regras(XML_REGRAS, "0095.xml");
    expect(rs.map((r: { id: number }) => r.id)).toEqual([5700, 5710, 5712]);
    expect(rs[1]).toMatchObject({ nivel: 5, se_sid: [5700], mitre: ["T1110.001", "T1021.004"], grupos: ["authentication_failed", "invalid_login"] });
    expect(rs[2]).toMatchObject({ frequencia: 8, janela_s: 120, cves: ["CVE-2021-44228"] });
    expect(JSON.stringify(rs)).not.toContain("illegal user"); // não copia a lógica de detecção
  });
  it("extrai decoders com pai e campos", () => {
    expect(decoders(XML_DEC, "0310.xml")[1]).toMatchObject({ nome: "sshd-success", pai: "sshd", campos: ["user", "srcip"] });
  });
});

describe("wazuh_regra / wazuh_decoder", () => {
  const d = base();
  it("regra por id: dependências, filhas, MITRE com nome e selo", () => {
    const r = wazuhRegra(d, { consulta: "5710" }, T, (t) => (t === "T1110.001" ? "Password Guessing" : null)) as any;
    expect(r.resultado).toMatchObject({ id: 5710, nivel: 5, depende_das_regras: [{ id: 5700 }] });
    expect(r.resultado.mitre[0]).toMatchObject({ id: "T1110.001", nome: "Password Guessing" });
    expect(r.fontes[0]).toMatchObject({ fonte: "Wazuh ruleset (oficial)", versao: "v9.9.9" });
    expect(r.nota).toContain("GPLv2");
  });
  it("id inexistente avisa; busca por grupo, MITRE, CVE e termo", () => {
    expect((wazuhRegra(d, { consulta: "1" }, T) as any).aviso).toContain("não consta");
    expect((wazuhRegra(d, { consulta: "authentication_failed" }, T) as any).candidatos[0].id).toBe(5710);
    expect((wazuhRegra(d, { consulta: "T1021.004" }, T) as any).candidatos[0].id).toBe(5710);
    expect((wazuhRegra(d, { consulta: "CVE-2021-44228" }, T) as any).candidatos[0].id).toBe(5712);
    expect((wazuhRegra(d, { consulta: "brute force" }, T) as any).candidatos[0].id).toBe(5712);
    expect(wazuhRegra(d, { consulta: "" }, T)).toHaveProperty("erro");
    expect(wazuhRegra(d, { consulta: "ab" }, T)).toHaveProperty("erro");
  });
  it("decoder por nome: filhos; busca por termo; selo avisa quando velho", () => {
    const r = wazuhDecoder(d, { consulta: "sshd" }, T) as any;
    expect(r.resultado.decoders_filhos.lista[0].nome).toBe("sshd-success");
    expect((wazuhDecoder(d, { consulta: "success" }, T) as any).candidatos[0].nome).toBe("sshd-success");
    expect((wazuhDecoder(d, { consulta: "zzzzz" }, T) as any).resultado).toBeNull();
    expect(seloWazuh(d, new Date(T.getTime() + 200 * 86_400_000)).aviso).toContain("regenere");
  });
});

describe("base embutida do Wazuh (a gerada de verdade)", () => {
  it("tem regras e decoders conhecidos, com licença e commit", async () => {
    const d = await carregarWazuh();
    expect(d.meta.licenca).toBe("GPLv2");
    expect(d.meta.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(d.regras.length).toBeGreaterThan(4000);
    expect(d.decoders.length).toBeGreaterThan(1000);
    expect((wazuhRegra(d, { consulta: "5710" }, T) as any).resultado).toMatchObject({ id: 5710 });
    expect((wazuhDecoder(d, { consulta: "sshd" }, T) as any).resultado).toMatchObject({ nome: "sshd" });
  });
  it("pela ferramenta MCP, com nome da técnica ATT&CK, e aparece em saude_fontes", async () => {
    const DB = bancoTeste(...migracoes());
    const r = JSON.parse((await chamarFonte({ DB }, "wazuh_regra", { consulta: "5710" }, T))!.content[0].text);
    expect(r.resultado.mitre[0].nome).toBeTruthy();
    expect((await chamarFonte({ DB }, "wazuh_decoder", {}, T))!.isError).toBe(true);
    const saude = JSON.parse((await chamarFonte({ DB }, "saude_fontes", {}, T))!.content[0].text).fontes;
    expect(saude.find((f: { id: string }) => f.id === "wazuh")).toMatchObject({ modo: "embutido" });
  });
});

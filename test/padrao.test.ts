import { describe, expect, it } from "vitest";
import { resumoDoPadrao } from "../public/padrao.js";

const nome = (s: string) => ({ leis: "Legislação digital", forense: "Forense digital", gestao: "Gestão de serviços de TI" })[s] ?? s;

describe("resumoDoPadrao (padrão para todos)", () => {
  it("sem mudança, não deixa salvar e lembra que sem regra ninguém vê nada", () => {
    expect(resumoDoPadrao(["leis"], ["leis"], nome)).toEqual({ mudou: false, vazio: false, texto: "Sem mudanças. Sem regra nenhuma, a pessoa que autoriza não vê nada." });
  });
  it("depois de salvar, informa a hora", () => {
    expect(resumoDoPadrao(["leis"], ["leis"], nome, "14:02").texto).toBe("Padrão salvo às 14:02. Vale para todos na próxima chamada.");
  });
  it("lista o que entra (+) e o que sai (−), com os nomes dos pacotes, e diz quando vale", () => {
    const r = resumoDoPadrao(["leis", "forense"], ["leis", "gestao"], nome);
    expect(r).toMatchObject({ mudou: true, vazio: false });
    expect(r.texto).toBe("Vai mudar para todos os colaboradores, na próxima chamada: + Gestão de serviços de TI, − Forense digital.");
  });
  it("avisa quando o padrão ficaria vazio: ninguém veria nada", () => {
    const r = resumoDoPadrao(["leis"], [], nome);
    expect(r).toMatchObject({ mudou: true, vazio: true });
    expect(r.texto).toContain("Sem nenhum pacote, ninguém verá nada pelo OAuth.");
  });
  it("só tirar pacotes ou só pôr pacotes também conta como mudança; a ordem das marcações não importa", () => {
    expect(resumoDoPadrao(["leis", "forense"], ["leis"], nome).mudou).toBe(true);
    expect(resumoDoPadrao(["leis"], ["leis", "forense"], nome).mudou).toBe(true);
    expect(resumoDoPadrao(["leis", "forense"], ["forense", "leis"], nome).mudou).toBe(false);
  });
});

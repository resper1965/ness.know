import { describe, expect, it } from "vitest";
import { mensagemPronta } from "../public/mensagem.js";

const base = {
  nome: "perito",
  pacotes: ["Forense digital", "Segurança e conformidade (normas escolhidas)"],
  agente: "Claude Code",
  onde: "No terminal, na pasta do projeto.",
  receita: 'claude mcp add --transport http ness-know https://know.ness.com.br/mcp --header "Authorization: Bearer nesskb_abc"',
  conferir: "curl -s https://know.ness.com.br/mcp -H 'Authorization: Bearer nesskb_abc'",
};

describe("mensagem pronta para o usuário da chave", () => {
  it("traz quem, os pacotes, o agente, a receita com a chave, a conferência e os cuidados", () => {
    const m = mensagemPronta(base);
    expect(m).toContain("Chave: perito");
    expect(m).toContain("Pacotes liberados: Forense digital; Segurança e conformidade (normas escolhidas)");
    expect(m).toContain("Agente: Claude Code");
    expect(m).toContain(base.receita);
    expect(m).toContain(base.conferir);
    expect(m).toContain("A chave é pessoal");
    expect(m).not.toContain("SUA_CHAVE");
  });

  it("sem pacotes, diz nenhum em vez de deixar o campo vazio", () => {
    expect(mensagemPronta({ ...base, pacotes: [] })).toContain("Pacotes liberados: nenhum");
  });
});

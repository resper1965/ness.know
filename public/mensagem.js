// Mensagem para mandar a quem vai usar a chave (Teams, e-mail, WhatsApp): o que é, o que a chave libera, a receita do agente e os cuidados.
// Função pura, para a tela de Chaves e para os testes.

/**
 * @param {{ nome: string, pacotes: string[], agente: string, onde: string, receita: string, conferir: string }} d
 * @returns {string}
 */
export function mensagemPronta({ nome, pacotes, agente, onde, receita, conferir }) {
  return [
    "Olá! Segue o seu acesso ao ness.KNOW, a base de normas, leis e frameworks da ness. que o seu agente de IA consulta (somente leitura).",
    "",
    `Chave: ${nome}`,
    `Pacotes liberados: ${pacotes.length ? pacotes.join("; ") : "nenhum"}`,
    "",
    `Agente: ${agente}`,
    `Onde configurar: ${onde}`,
    "",
    receita,
    "",
    "Para conferir se a chave funciona (resposta 401 = chave errada ou revogada):",
    conferir,
    "",
    "Cuidados:",
    "- A chave é pessoal. Não a repasse nem a coloque em ticket, chat ou Git.",
    "- Se perdê-la ou suspeitar que vazou, avise para revogarmos e gerarmos outra.",
    "- As respostas citam documento, versão e seção. Confira o texto antes de usar em decisão formal.",
  ].join("\n");
}

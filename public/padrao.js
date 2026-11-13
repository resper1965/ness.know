// "Padrão para todos": a diferença entre o que está salvo e o que o administrador marcou. Função pura, para ter teste (o painel só a exibe).

/**
 * @param {string[]} antes slugs hoje no padrão
 * @param {string[]} agora slugs marcados na tela
 * @param {(slug: string) => string} nome nome para exibir de um slug
 * @param {string} [salvoEm] hora do último salvamento nesta tela, se houve
 * @returns {{ mudou: boolean, vazio: boolean, texto: string }} `vazio`: a mudança deixaria o padrão sem nenhum pacote
 */
export function resumoDoPadrao(antes, agora, nome, salvoEm = "") {
  const mais = agora.filter((s) => !antes.includes(s));
  const menos = antes.filter((s) => !agora.includes(s));
  if (!mais.length && !menos.length)
    return { mudou: false, vazio: false, texto: salvoEm ? `Padrão salvo às ${salvoEm}. Vale para todos na próxima chamada.` : "Sem mudanças. Sem regra nenhuma, a pessoa que autoriza não vê nada." };
  const partes = [...mais.map((s) => `+ ${nome(s)}`), ...menos.map((s) => `− ${nome(s)}`)].join(", ");
  const vazio = !agora.length;
  return { mudou: true, vazio, texto: `Vai mudar para todos os colaboradores, na próxima chamada: ${partes}.${vazio ? " Sem nenhum pacote, ninguém verá nada pelo OAuth." : ""}` };
}

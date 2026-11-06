# Skills, fatia 1: tabela, `obter_skill` e `consultando-normas`

Data: 06/11/2026. Aprovado pelo dono em conversa. Origem: [skills-plano.md](../../skills-plano.md), lacunas 4.1 e 4.3.

## Decisão

Abordagem A do plano, em fatias. Esta é a fatia 1: servidor MCP e carga. Ficam para depois `prompts/*` (fatia 2) e a aba Skills da interface (fatia 3). A interface continua só para administradores.

## Dados e carga

- Tabela `skills`: `nome` (chave), `descricao`, `normas` (JSON `{slug: [títulos]}`), `corpo`, `versao`, `atualizado_em`.
- Fonte: `skills/<nome>/SKILL.md` com frontmatter `name`, `description`, `normas`. `scripts/carregar-skills.mjs` envia para `POST /api/skills`; recarregar o mesmo nome substitui.
- Validação na carga: nome no padrão dos slugs; corpo de até 4.000 caracteres; cada pacote de `normas` existe e cada título existe no pacote.
- Admin: `GET /api/skills`, `POST /api/skills`, `DELETE /api/skills/<nome>`.

## Visibilidade

Uma chave enxerga a skill só se tiver todos os pacotes de `normas` e, quando o pacote for restrito, todas as normas listadas. `normas` vazio vale para toda chave. Skill inexistente e skill não liberada recebem a mesma resposta.

## MCP

- `obter_skill(nome)`: só leitura; devolve nome, descrição, versão e corpo.
- `listar_pacotes` traz `skills: [{nome, descricao}]`, só as visíveis à chave.
- Uso contado em `uso_chaves` como as demais ferramentas.

## Skill `consultando-normas`

Método curto: `listar_pacotes`; mais de uma busca quando há mais de um conceito; Requisito (texto da norma com `ref`) separado de Interpretação; "não está na base" em vez de completar de memória. Escrita só depois de uma linha de base (3 perguntas sem skill, falhas anotadas). Casos em `skills/consultando-normas/casos.md`.

## faBRAINzio

`instrucoesDoKnow` chama `obter_skill("consultando-normas")` uma vez por conversa e acrescenta o corpo ao prompt, com cache de poucos minutos. Falha na chamada: segue sem a skill.

## Testes

Regra de visibilidade (chave inteira, restrita, pacote ausente); validação da carga; `obter_skill` (liberada, não liberada, inexistente); `listar_pacotes` com skills.

## Fora desta fatia

`prompts/*`, aba Skills, outras skills do plano, visão do usuário (autonomia sobre bases e receitas: próximo brainstorming).

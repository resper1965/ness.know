# Segurança

## Modelo de acesso

| Quem | Como entra | O que pode |
| --- | --- | --- |
| Agente | `Authorization: Bearer nesskb_…` em `/mcp` | Ler os pacotes e as normas liberados na chave |
| Administrador | Cloudflare Access (e-mail corporativo), com o JWT conferido no Worker e a lista `ADMIN_EMAILS` | Gerar e revogar chaves, carregar e apagar documentos, buscar em tudo |
| Qualquer pessoa | nada | `GET /health` |

## Controles

- **Chaves de API**
  - Geradas com 32 bytes aleatórios (`crypto.getRandomValues`), em base64url, com o prefixo `nesskb_` para facilitar a detecção em varreduras de segredos.
  - Só o SHA-256 vai para o banco. O token aparece uma vez, na resposta da criação.
  - A revogação vale na requisição seguinte, porque não há cache de chaves.
- **Escopo da chave**
  - Pacotes e títulos são conferidos no servidor a cada busca.
  - O filtro `pacotes` enviado pelo agente só restringe o que a chave já libera.
  - Na busca semântica, cada resultado do índice é conferido de novo no D1 contra os pacotes e títulos permitidos. Assim, um índice de metadados ausente ou um filtro errado não vaza conteúdo.
- **Administração**
  - O Worker não confia só no Access. Ele valida o JWT `Cf-Access-Jwt-Assertion`: assinatura pelas chaves públicas do time, emissor e audiência (`ACCESS_AUD`).
  - Também exige o e-mail em `ADMIN_EMAILS`, de modo que um Access mal configurado não abre a API.
- **Interface:** todo texto vindo do servidor entra por `textContent`, sem HTML injetado.
- **Dados:** a base contém normas e frameworks licenciados para a ness. Nenhum dado pessoal é armazenado além do e-mail de quem criou cada chave e cada documento.

## Ameaças consideradas

| Ameaça | Mitigação |
| --- | --- |
| Vazamento de chave | Revogar na aba Chaves. Uma chave por agente limita o alcance de cada vazamento |
| Vazamento do banco | Tokens só em hash |
| Agente pedindo pacote ou norma fora da chave | Filtro aplicado no servidor; o pedido do agente só restringe |
| Erro de configuração no Access | JWT conferido no Worker e lista de admins |
| Conteúdo de documento com instruções embutidas (injeção de prompt) | O MCP devolve trechos como dado; os clientes devem tratá-los como dado (orientação em `docs/mcp.md`) |
| Arquivo malicioso na carga | Só administradores carregam. O arquivo vai para o R2 e é convertido pelo Workers AI; nada é executado |

## Limites conhecidos

- Não há limite de requisições por chave. Para isso, use Rate Limiting da Cloudflare em `/mcp` se o uso crescer.
- Não há registro de consultas por chave; há só o horário do último `initialize` (`usado_em`).
- ChatGPT e claude.ai na web não conectam, porque os conectores deles exigem OAuth.
- As chaves não expiram sozinhas; a revogação é manual.

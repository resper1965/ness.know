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
| OAuth: redirecionamento aberto | `redirect_uri` tem de ser igual a um registrado; cliente ou endereço desconhecido responde 400 sem redirecionar |
| OAuth: CSRF no consentimento | O POST só vale com o id do pedido que o GET serviu àquela pessoa; pedido de outra pessoa, inexistente ou vencido (10 min) responde 400 |
| OAuth: código interceptado | PKCE S256 obrigatório; código de uso único, 60 s, guardado em hash; troca errada (client, redirect ou verifier) não queima o código |
| OAuth: registro em massa | Cota por IP antes da global (Rate Limiting); só cliente público e `redirect_uris` validadas |
| Pessoa que perde o acesso à ness. | A chave dura 30 dias e o escopo é recalculado a cada chamada; remover a regra tira o acesso na hora, e o painel revoga a chave |
| Registro dinâmico enchendo o banco | Cota por IP e total; a cada registro válido, apagam-se códigos vencidos e clientes sem chave e sem pedido há mais de 30 dias. Cliente com chave (mesmo vencida) fica |
| Chave revogada voltando por reautorização | A emissão só atualiza chave ativa; revogada continua revogada |
| Envio pela empresa: chave de envio vazada | Vale para um pacote só, vence em 1 ano, revoga-se na hora; só grava no pacote dela e não lê pelo MCP. Limite de 30 chamadas por minuto, e a cota de documentos barra encher a base |
| Envio pela empresa: empresa A mexendo no pacote da B | A chave guarda o pacote; listar, enviar e apagar usam só esse pacote. Apagar um id de outro pacote responde 404 |
| Envio pela empresa: arquivo malicioso ou com instruções embutidas | Tamanho limitado (15 MB), conversão no Workers AI e nada é executado; o MCP devolve trechos como dado. Conteúdo ilegal ou licenciado de terceiros enviado pela empresa é responsabilidade contratual, não do código |
| Envio pela empresa: adivinhar a chave | Token de 256 bits, só o hash no banco, e 429 por IP para quem erra em série |
| Conteúdo de documento com instruções embutidas (injeção de prompt) | O MCP devolve trechos como dado; os clientes devem tratá-los como dado (orientação em `docs/mcp.md`) |
| Arquivo malicioso na carga | Só administradores carregam. O arquivo vai para o R2 e é convertido pelo Workers AI; nada é executado |

## Limites conhecidos

Prioridade e próximo passo de cada um em [lacunas.md](lacunas.md), seção 5.

- Cada chave tem um limite de 240 chamadas por minuto no `/mcp` (Rate Limiting da Cloudflare, binding `LIMITE_MCP`); o excedente recebe `429`. O limite é por chave e por localidade da Cloudflare, então é uma barreira contra laço e vazamento, não uma cota exata.
- O uso por chave é contado por dia e ferramenta (`uso_chaves`), sem o texto da consulta; não há registro do que cada agente perguntou.
- ChatGPT e claude.ai na web não conectam, porque os conectores deles exigem OAuth.
- A validade da chave é opcional (`dias` ou `expira_em` na criação): sem ela, a chave não expira e a revogação é manual.
- Tentativas com chave ausente ou inválida contam por IP (`LIMITE_AUTH`, 30 por minuto) e passam a receber `429`. A chave errada ainda custa uma leitura no banco antes de ser contada; só a ausência de chave a evita. É um freio contra laço e tentativa em série, não uma defesa contra volume alto.
- Requisição com `Origin` que não está em `ORIGENS_MCP` leva `403`. Agentes e CLIs não mandam `Origin` e não são afetados; um cliente que rode no navegador precisa ter a origem dele na lista (var, separada por vírgula).

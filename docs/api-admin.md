# API de administração

Base: `https://know.ness.com.br/api`. Toda rota exige o token do Cloudflare Access de um e-mail listado em `ADMIN_EMAILS`. Pelo navegador, o login do Access basta. Por script, envie `cf-access-token: $(cloudflared access token -app=https://know.ness.com.br)`, depois de rodar `cloudflared access login` uma vez.

Erros vêm como `{ "erro": "mensagem" }`: `400` para entrada inválida, `401` sem acesso, `404` quando o recurso não existe, `422` quando o arquivo não pôde ser lido.

## Identidade

| Rota | Resposta |
| --- | --- |
| `GET /api/eu` | `{ "email": "…" }` |

## Chaves

| Rota | Descrição |
| --- | --- |
| `GET /api/chaves` | Lista as chaves: `id`, `nome`, `pacotes` (JSON), `documentos` (JSON), `ativo`, `criado_por`, `criado_em`, `usado_em` (atualizado no máximo uma vez por hora), `expira_em` (UTC, nulo se não expira), `origem` (`agente` ou `oauth`), `pessoa` e `cliente_oauth` (só nas emitidas por OAuth), `chamadas_30d` (chamadas autenticadas ao `/mcp` nos últimos 30 dias) |
| `POST /api/chaves` | Cria uma chave. Devolve o `token` **uma única vez** |
| `DELETE /api/chaves/:id` | Revoga a chave. O efeito é imediato e a chave não volta a valer. Grava em `auditoria` quem revogou |

Corpo do `POST /api/chaves`:

```json
{
  "nome": "faBRAINzio",
  "pacotes": ["seguranca-conformidade", "setor-eletrico"],
  "documentos": { "seguranca-conformidade": ["ABNT NBR ISO/IEC 27001:2022", "NIST CSF 2.0"] }
}
```

- `pacotes`: slugs liberados; obrigatório e não vazio. Slug inexistente dá `404`.
- `dias` ou `expira_em`: validade opcional, nunca os dois. `dias` é um inteiro de 1 a 3650 a partir de agora; `expira_em` é `AAAA-MM-DD` futura e vale até o fim desse dia (UTC). Sem nenhum dos dois, a chave não expira. Chave vencida recebe `401`, como a revogada. A resposta traz `expira_em`.
- `documentos`: opcional. Para cada pacote listado aqui, a chave fica restrita a esses títulos. Pacote fora do mapa vale inteiro, inclusive para normas carregadas depois.
- Regras de `documentos`:
  - título que não existe no pacote dá `400`;
  - pacote que não está em `pacotes` dá `400`;
  - lista vazia dá `400`;
  - lista com todas as normas do pacote é guardada como pacote inteiro.

## Chaves de envio (a empresa sobe o próprio conteúdo)

| Rota | Descrição |
| --- | --- |
| `GET /api/chaves-envio` | Lista: `id`, `nome`, `pacote`, `ativo`, `criado_por`, `criado_em`, `usado_em`, `expira_em`. Nunca traz o token |
| `POST /api/chaves-envio` | Corpo `{ "nome": "Cliente X", "pacote": "cliente-x", "dias": 365 }` (`dias` ou `expira_em`; sem nenhum, vale 365 dias). Devolve o `token` (`nessup_…`) **uma única vez**. Recusa pacote inexistente (404) e pacote **sem cota** de documentos (400) |
| `DELETE /api/chaves-envio/:id` | Revoga na hora. Grava em `auditoria` quem revogou |

### API da empresa (`/api/envio/*`, fora do Access)

Autenticação: `Authorization: Bearer nessup_…`. A chave vale para o pacote dela e nenhum outro. Chave ausente, errada, vencida ou revogada: 401 (e 429 para quem insiste, por IP). Limite de 30 chamadas por minuto por chave.

| Rota | Descrição |
| --- | --- |
| `GET /api/envio/documentos` | `pacote` (`nome`, `cota_documentos`, `usados`) e `documentos` (`id`, `titulo`, `tipo`, `versao`, `vigencia`, `status`, `erro`, `criado_em`) |
| `POST /api/envio/documentos` | `multipart/form-data`: `arquivo` (até 15 MB) e, opcionais, `titulo`, `tipo`, `versao`, `vigencia`, `fonte`. Mesmo título substitui o anterior sem gastar cota. Acima da cota: 422 |
| `DELETE /api/envio/documentos/:id` | Apaga um documento do próprio pacote. Id de outro pacote responde 404 |

```bash
curl -H "Authorization: Bearer $CHAVE_DE_ENVIO" -F "arquivo=@politica.pdf" -F "titulo=Política de acesso" https://know.ness.com.br/api/envio/documentos
```

## Acesso por pessoa (chaves OAuth)

Regras que definem o que uma chave emitida por OAuth enxerga. O padrão vale para todos e a regra da pessoa soma a ele; pacote liberado inteiro por qualquer regra vale inteiro, e restrições por norma do mesmo pacote somam os títulos. Vale na próxima chamada.

| Rota | Descrição |
| --- | --- |
| `GET /api/acesso` | `padrao` e `pessoas` (`email`, `pacotes`, `documentos`, `criado_por`, `criado_em`) |
| `PUT /api/acesso/padrao` | Corpo `{ "pacotes": ["slug"], "documentos": { "slug": ["Título"] } }` (`documentos` opcional, como na chave) |
| `PUT /api/acesso/pessoa/:email` | Mesmo corpo, para um e-mail. E-mail inválido: 400 |
| `DELETE /api/acesso/pessoa/:email` | Remove a regra da pessoa |
| `GET /api/auditoria` | Últimos 100 eventos: `quando`, `ator`, `acao` (`oauth.conceder`, `chave.revogar`, `acesso.definir`, `acesso.remover`, `pacote.cota`, `pacote.excluir`, `envio.chave.criar`, `envio.chave.revogar`, `envio.enviar`, `envio.apagar`), `detalhe`. Sem token nem conteúdo |

Pacote inexistente: 404. Norma que não existe no pacote: 400.

## Pacotes e documentos

| Rota | Descrição |
| --- | --- |
| `GET /api/pacotes` | Pacotes com `slug`, `nome`, `descricao`, `versao`, `atualizado_em`, `documentos` (contagem) e `titulos` (JSON com os títulos prontos para busca) |
| `POST /api/pacotes` | Cria ou atualiza um pacote: `slug`, `nome`, `descricao?`, `versao?`, `instrucoes?` |
| `GET /api/pacotes/:slug/documentos` | Documentos do pacote: `id`, `titulo`, `tipo`, `versao`, `vigencia`, `fonte`, `status`, `erro`, `criado_em` |
| `POST /api/pacotes/:slug/documentos` | Envia um documento (`multipart/form-data`: `arquivo`, `titulo?`, `tipo?`, `versao?`, `vigencia?`, `fonte?`). Até 15 MB. Um título que já existe no pacote substitui a versão anterior e devolve `substituidos` |
| `DELETE /api/documentos/:id` | Apaga o documento, os trechos, os vetores e o arquivo |

| Rota | Descrição |
| --- | --- |
| `PUT /api/pacotes/:slug/cota` | Corpo `{ "cota_documentos": 50 }` (inteiro de 1 a 100000) ou `null` para sem limite. Acima da cota, o upload de um título **novo** recebe 422; recarregar um título existente (que substitui o anterior) não conta de novo |
| `DELETE /api/pacotes/:slug` | Exclui o pacote e todos os documentos (arquivo no R2, trechos e vetores). Responde 409, sem apagar nada, enquanto uma chave ativa (do MCP ou de envio), uma regra de acesso (padrão ou por pessoa) ou uma skill ainda listar o pacote; o corpo traz `chaves`, `regras`, `skills` e `envios` que o usam. Grava em `auditoria` |

`GET /api/pacotes` traz também `cota_documentos`.

## Skills

Procedimentos que o agente segue ao usar as normas (ver [skills-plano.md](skills-plano.md)).

| Rota | Descrição |
| --- | --- |
| `GET /api/skills` | Skills com `nome`, `descricao`, `normas` (JSON), `versao`, `atualizado_em` e `tamanho` (caracteres do corpo, que não vem na lista) |
| `POST /api/skills` | Cria ou substitui: `nome`, `descricao`, `corpo` (até 4.000 caracteres), `normas?` (`{pacote: [títulos]}`; `{}` vale para toda chave; lista vazia exige só o pacote), `buscas?` (até 5 textos de até 120 caracteres: consultas de continuação que o cliente executa) e `versao?`. Pacote ou título que não existe dá `400` |
| `DELETE /api/skills/:nome` | Apaga a skill; `404` se não existe |

`node scripts/carregar-skills.mjs <url> [pasta]` envia as pastas `skills/<nome>/SKILL.md`.

O título identifica a norma de forma estável. Recarregar um documento troca o `id`, mas as chaves restritas por título continuam valendo. Renomear um título tira essa norma das chaves restritas a ele.

## STRM (só leitura)

Base de `scripts/conferir-strm.mjs`.

| Rota | Descrição |
| --- | --- |
| `GET /api/strm/frameworks` | Frameworks carregados: `id`, `nome`, `versao_scf`, `itens` e `ligacoes` (contagem real em `strm`) |
| `GET /api/strm/:id` | Ligações do framework: `item`, `item_nome`, `relacao`, `forca`, `scf`. `404` se o id não existe |

## Busca de teste

`POST /api/busca` busca em todos os pacotes, sem restrição de chave. Serve para a tela de teste e para a avaliação.

| Campo | Padrão | Descrição |
| --- | --- | --- |
| `consulta` | obrigatório | Pergunta |
| `pacotes` | todos | Slugs |
| `modo` | `hibrida` | `hibrida`, `semantica` ou `textual` |
| `limite` | 10 | 1 a 20 |
| `rerank` | `false` | Reordena com `bge-reranker-base` (piorou o primeiro lugar na avaliação) |
| `minimo` | 0,4 | Nota mínima da busca semântica |
| `peso_textual` | 0,5 | Peso da busca por palavra na fusão |

Resposta: lista de `{ titulo, versao, secao, origem, nota, trecho }`.

## Vetores

`POST /api/vetores` com `{ "apos": "<id>" }` refaz os vetores de 5 documentos por vez, a partir do id informado, e devolve `{ feitos, proximo }`. O script `scripts/vetorizar.mjs` percorre todas as páginas.

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
| `GET /api/chaves` | Lista as chaves: `id`, `nome`, `pacotes` (JSON), `documentos` (JSON), `ativo`, `criado_por`, `criado_em`, `usado_em` |
| `POST /api/chaves` | Cria uma chave. Devolve o `token` **uma única vez** |
| `DELETE /api/chaves/:id` | Revoga a chave. O efeito é imediato e a chave não volta a valer |

Corpo do `POST /api/chaves`:

```json
{
  "nome": "faBRAINzio",
  "pacotes": ["seguranca-conformidade", "setor-eletrico"],
  "documentos": { "seguranca-conformidade": ["ABNT NBR ISO/IEC 27001:2022", "NIST CSF 2.0"] }
}
```

- `pacotes`: slugs liberados; obrigatório e não vazio. Slug inexistente dá `404`.
- `documentos`: opcional. Para cada pacote listado aqui, a chave fica restrita a esses títulos. Pacote fora do mapa vale inteiro, inclusive para normas carregadas depois.
- Regras de `documentos`:
  - título que não existe no pacote dá `400`;
  - pacote que não está em `pacotes` dá `400`;
  - lista vazia dá `400`;
  - lista com todas as normas do pacote é guardada como pacote inteiro.

## Pacotes e documentos

| Rota | Descrição |
| --- | --- |
| `GET /api/pacotes` | Pacotes com `slug`, `nome`, `descricao`, `versao`, `atualizado_em`, `documentos` (contagem) e `titulos` (JSON com os títulos prontos para busca) |
| `POST /api/pacotes` | Cria ou atualiza um pacote: `slug`, `nome`, `descricao?`, `versao?`, `instrucoes?` |
| `GET /api/pacotes/:slug/documentos` | Documentos do pacote: `id`, `titulo`, `tipo`, `versao`, `vigencia`, `fonte`, `status`, `erro`, `criado_em` |
| `POST /api/pacotes/:slug/documentos` | Envia um documento (`multipart/form-data`: `arquivo`, `titulo?`, `tipo?`, `versao?`, `vigencia?`, `fonte?`). Até 15 MB. Um título que já existe no pacote substitui a versão anterior e devolve `substituidos` |
| `DELETE /api/documentos/:id` | Apaga o documento, os trechos, os vetores e o arquivo |

O título identifica a norma de forma estável. Recarregar um documento troca o `id`, mas as chaves restritas por título continuam valendo. Renomear um título tira essa norma das chaves restritas a ele.

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

# Fontes externas e públicas

O ness.know também serve conhecimento **externo e público**: vulnerabilidades exploradas, escores de exploração e avisos de fabricante. É diferente dos pacotes de normas: não há escopo por pacote nem por pessoa, qualquer chave válida chega (chave `nesskb_` ou OAuth pelo portal) e o conteúdo é o mesmo para todos.

Nada interno da ness. entra aqui (playbooks, runbooks, clientes, chamados, logs, DNS ou configuração da conta Cloudflare). Isso fica no ness.OS ou nas ferramentas da própria Cloudflare, com o acesso de cada pessoa.

## Como funciona

- **Catálogo (`fontes`, D1):** cada fonte tem nome, URL, licença, termos, atribuição, se exige chave, modo (`lote` ou `ao_vivo`), frequência, TTL, última coleta bem-sucedida, último erro, versão, ETag e contagem de itens.
- **Coleta:** o cron `*/15 * * * *` chama `executarFontes` (`src/fontes/motor.ts`). Cada fonte roda quando vence a própria frequência. O download é condicional (ETag ou versão) e o banco só é regravado quando a fonte mudou. Cada execução fica em `coletas` (90 dias).
- **Expiração:** o que sai da fonte fica marcado (`removido_em`) e só é apagado depois de 90 dias.
- **Resposta:** toda resposta traz `fontes[]` com fonte, versão, `coletado_em`, frescor ("coletado há 3 h"), atribuição e uma frase pronta em `citar`. Passado o TTL sem coleta bem-sucedida, a resposta traz `aviso` ("dado possivelmente desatualizado") em vez de omitir.
- **Consulta ao vivo:** NVD e a API de EPSS da FIRST são consultados na hora, com cache de 24 h e 12 h na tabela `cache`. Só sucesso é cacheado.
- **Conteúdo de terceiros é dado:** o texto é limpo na entrada (sem marcação nem controle, com tamanho limitado) e toda resposta traz `nota` dizendo para tratá-lo como dado, nunca como instrução.

## Fontes

| Fonte | Modo | Frequência | TTL | Licença | Chave |
| --- | --- | --- | --- | --- | --- |
| CISA KEV | lote | diária | 48 h | Domínio público (CISA) | não |
| EPSS (FIRST) | lote (só os CVEs do KEV) + ao vivo para os demais | diária | 72 h | Gratuito, com atribuição à FIRST | não |
| Microsoft MSRC | lote | diária | 72 h | API pública | não |
| Fortinet PSIRT | lote | 6 h | 48 h | Feed RSS público | não |
| NVD (NIST) | ao vivo, cache de 24 h | sob demanda | n/a | Domínio público | opcional (`NVD_API_KEY`) |
| Microsoft Learn (MCP público) | ao vivo, cache de 10 min | sob demanda | n/a | Documentação pública; só trecho curto com link | não |
| Documentação da Cloudflare (MCP público) | ao vivo, cache de 10 min | sob demanda | n/a | Documentação pública; só trecho curto com link | não |
| Blog da Cloudflare (MCP público) | ao vivo, cache de 10 min | sob demanda | n/a | Blog público; só trecho curto com link | não |

O **prazo** do KEV é o da diretiva BOD da CISA para agências federais dos EUA. Para clientes da ness., é referência de urgência, não obrigação; a resposta repete isso.

## Ferramentas

| Ferramenta | Entrada | Saída |
| --- | --- | --- |
| `cve_consultar` | `cves[]` (até 20) | Por CVE: KEV, EPSS e percentil, CVSS e CWEs do NVD, avisos de fabricante |
| `kev_buscar` | `fornecedor?`, `produto?`, `texto?`, `desde?`, `ransomware?`, `pagina?` | Lista paginada (20) com o total |
| `kev_novidades` | `dias?` (1 a 90, padrão 7) | O que entrou no período |
| `avisos_fabricante` | `fornecedor` (`microsoft` ou `fortinet`), `desde?` | Avisos com título, data, CVEs e link |
| `novidades` | `fonte?`, `desde?` | O que há de novo nas fontes |
| `buscar_doc_oficial` | `produto` (`microsoft`, `cloudflare`, `cloudflare-blog`), `consulta`, `limite?` (1 a 5) | Até 5 trechos de até 1.200 caracteres, cada um com título, link oficial e a data da consulta |
| `saude_fontes` | nenhuma | Estado, frescor, erro, frequência, TTL e licença de cada fonte |

Para sistemas (ness.OS): `POST /v1/cve` com `{"cves": [...]}` (até 500) e `Authorization: Bearer nesskb_…`. Devolve o mesmo formato, sem NVD. Limite por chave: o mesmo `LIMITE_MCP`.

### Documentação oficial (`buscar_doc_oficial`)

O ness.know chama os MCP públicos da Microsoft (`learn.microsoft.com/api/mcp`) e da Cloudflare (`docs.mcp.cloudflare.com/mcp` e `blog.mcp.cloudflare.com/mcp`) com `tools/call`, só com o texto da consulta (nenhum dado do usuário nem da empresa vai junto). O Learn não tem `maxTokenBudget`: o limite de tamanho é nosso (5 resultados, 1.200 caracteres cada).

- Só vira citação o link `https` do host esperado de cada fonte; qualquer outro resultado é descartado.
- O texto é limpo (sem caracteres de controle) e segue como dado. A resposta traz a `nota` e o link.
- Cache de 10 minutos na tabela `cache`. Falha da fonte não é cacheada: a resposta traz `indisponivel` e o `aviso` para o agente não responder de memória.
- `saude_fontes` mostra a última consulta bem-sucedida e o último erro de cada uma.
- Google Workspace, GLPI, Datto RMM, Atera, Action1 e Fortinet não têm fonte oficial pesquisável (lacunas 8.1 e 8.4): o produto é recusado com a lista dos aceitos.

## Operação

- **Depois do deploy:** a migração 0012 cria as tabelas e o catálogo. A primeira coleta acontece no próximo múltiplo de 15 minutos. Confira com `saude_fontes`.
- **Segredo opcional:** `npx wrangler secret put NVD_API_KEY` (chave gratuita do NVD; sem ela, só as 5 primeiras consultas por chamada trazem CVSS).
- **Coleta manual:** não há endpoint; para forçar, rode o cron local com `npx wrangler dev --test-scheduled` e chame `/__scheduled`.
- **Fonte parada:** `saude_fontes` mostra `erro` e o frescor. Dado vencido continua sendo servido, com o aviso.

## Adicionar uma fonte nova

1. Confirme a licença e os termos (redistribuição, uso comercial, atribuição) e se exige chave. Sem termos claros, não entra.
2. Escreva o adaptador em `src/fontes/<fonte>.ts`: uma função `Adaptador` que baixa (use `baixar`, que já faz o condicional), valida o formato **antes** de gravar, limpa os textos com `limpar`, grava com `gravarEmLotes` e devolve `{ alterado, itens, versao?, etag? }`. Erro lançado vira `ultimo_erro` sem tocar no que já estava gravado.
3. Registre-o em `ADAPTADORES` (`src/fontes/motor.ts`) e acrescente a linha em `fontes` numa migração nova (`INSERT INTO fontes …`: id, nome, URL, licença, termos, atribuição, `ordem`, `frequencia_min`, `ttl_horas`).
4. Se a fonte tem dados próprios, crie a tabela na mesma migração e leia-a numa ferramenta em `src/fontes/ferramentas.ts`, sempre devolvendo `selo` da fonte.
5. Teste com fixture em `test/fixtures/fontes/`: primeira carga, mesma versão (não regrava), versão nova, formato inválido (banco intacto) e o TTL.
6. Chave ou token da fonte vai em secret do Worker, nunca no repositório.

## Lacunas e adiamentos

Estão em [lacunas.md](lacunas.md), seção 8: lacunas com as soluções possíveis, decisões já tomadas, limites atuais e melhorias possíveis.

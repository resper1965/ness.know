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
| Páginas de status: Cloudflare, Atera, Kaseya (Datto RMM), Google Workspace, Azure, Action1 | ao vivo, cache de 2 min | sob demanda | n/a | Páginas públicas | não |
| Feodo Tracker (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 3 dias | Dados abertos do abuse.ch (CC0 segundo o projeto; termos a conferir) | não |
| ThreatFox (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 7 dias | idem | sim (`ABUSECH_AUTH_KEY`, gratuita) |
| URLhaus (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 7 dias | idem | sim (`ABUSECH_AUTH_KEY`) |
| MalwareBazaar (abuse.ch) | lote | a cada 30 min | 3 h; indicador vale 7 dias | idem | sim (`ABUSECH_AUTH_KEY`) |
| Cloudflare Radar (API REST) | ao vivo, cache de 5 min | sob demanda | n/a | Token gratuito, permissão Account > Radar > Read | sim (`RADAR_API_TOKEN`) |

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
| `status_provedor` | `provedor` (`cloudflare`, `atera`, `datto-rmm`, `google-workspace`, `azure`, `action1`) | `estado` (`incidentes_abertos`, `manutencao_programada` ou `sem_incidentes_abertos`), incidentes e manutenções com link oficial |
| `internet_estado` | `pais?` (2 letras), `asn?`, `desde?` (AAAA-MM-DD; padrão 7 dias) | Quedas por país e ASN; com `asn`, sequestros de BGP que envolvem esse ASN |
| `ioc_consultar` | `valores[]` (até 50 IPs, domínios, URLs ou hashes) | Por valor: o que cada fonte lista (família, ameaça, confiança, primeira e última vez visto, validade), URLs do host e a divergência entre fontes. **Sem veredito** |
| `ioc_novidades` | `tipo?`, `familia?`, `desde?`, `pagina?` | Indicadores que entraram (50 por página), com total |
| `exportar_lista` | `tipo`, `fonte?`, `confianca_min?`, `formato?` (`texto`, `csv`, `cdb`), `limite?` | Lista vigente para aplicar (até 2.000 linhas); a inteira sai em `GET /v1/listas/{tipo}` |
| `saude_fontes` | nenhuma | Estado, frescor, erro, frequência, TTL e licença de cada fonte |

Para sistemas (ness.OS): `POST /v1/cve` com `{"cves": [...]}` (até 500) e `Authorization: Bearer nesskb_…`. Devolve o mesmo formato, sem NVD. Limite por chave: o mesmo `LIMITE_MCP`.

### Documentação oficial (`buscar_doc_oficial`)

O ness.know chama os MCP públicos da Microsoft (`learn.microsoft.com/api/mcp`) e da Cloudflare (`docs.mcp.cloudflare.com/mcp` e `blog.mcp.cloudflare.com/mcp`) com `tools/call`, só com o texto da consulta (nenhum dado do usuário nem da empresa vai junto). O Learn não tem `maxTokenBudget`: o limite de tamanho é nosso (5 resultados, 1.200 caracteres cada).

- Só vira citação o link `https` do host esperado de cada fonte; qualquer outro resultado é descartado.
- O texto é limpo (sem caracteres de controle) e segue como dado. A resposta traz a `nota` e o link.
- Cache de 10 minutos na tabela `cache`. Falha da fonte não é cacheada: a resposta traz `indisponivel` e o `aviso` para o agente não responder de memória.
- `saude_fontes` mostra a última consulta bem-sucedida e o último erro de cada uma.
- Google Workspace, GLPI, Datto RMM, Atera, Action1 e Fortinet não têm fonte oficial pesquisável (lacunas 8.1 e 8.4): o produto é recusado com a lista dos aceitos.

### Estado dos provedores e da internet

- **`status_provedor`** lê a página oficial de cada provedor: Statuspage (Cloudflare, Atera; a Kaseya é filtrada pelo componente "Datto RMM"), o painel do Google Workspace (incidentes sem data de término), o RSS do Azure (sem item, sem incidente) e a página da Action1 no Uptime.com. O `/history` da Action1 não tem documentação oficial, então a leitura é defensiva e um formato novo vira falha, não "tudo bem". Cache de 2 minutos.
- **Microsoft 365 não tem página pública de status:** o estado do tenant exige o Graph (`serviceHealth`), fora do escopo do ness.know. A ferramenta explica isso e aponta o Azure.
- **`internet_estado`** usa o Cloudflare Radar. Precisa do secret `RADAR_API_TOKEN`: token de API com **Account > Radar > Read** e nada mais (`npx wrangler secret put RADAR_API_TOKEN`). Sem ele, a resposta diz que não está configurado e não chama nada. Quedas por país e ASN; sequestros de BGP só com `asn`, e o resultado é conferido aqui (só ficam os eventos que envolvem o ASN). Cache de 5 minutos.
- Falha de qualquer página ou do Radar não é cacheada e vem com `indisponivel` e um aviso para o agente **não concluir que está tudo bem**.
- Fora desta etapa: `url_scan` (o URL Scanner do Radar é por conta e criaria registro na conta da ness., ver lacunas), anomalias de tráfego e vazamentos de rota do Radar.

### Inteligência de ameaças (abuse.ch)

- **Coleta em lote, sem consulta por indicador:** nenhuma pergunta gasta cota de terceiros, e a consulta fala do indicador, nunca do cliente. O ness.know só registra o nome da ferramenta no uso, não o valor consultado.
- **Normalização** (`indicadores`): tipo (`ip`, `dominio`, `url`, `hash`), valor em forma canônica, fonte, família, tipo de ameaça, confiança (só se a fonte informa; desconhecido fica vazio, nunca zero), tags, primeiro e último visto, validade. Valor com quebra de linha, espaço ou formato inválido é descartado.
- **Validade:** o indicador vale 3 dias (Feodo) ou 7 dias (os demais) sem reaparecer na fonte. Passado o prazo, vira `expirado`, continua visível como expirado e é apagado 90 dias depois. As consultas já respeitam o prazo sem esperar o cron.
- **Sem veredito:** não listado não significa seguro; listado não significa comprometido. Se as fontes divergem (família ou confiança), a resposta mostra a divergência e não escolhe. A resposta traz o frescor de todas as fontes, porque "não listado" só vale com a coleta em dia.
- **`exportar_lista`:** o ness.know não bloqueia nada. A lista é entrada para o processo de aprovação do ness.OS. Com `confianca_min`, quem não informa confiança fica de fora. A lista CDB do Wazuh (`chave:valor`) não aceita URL nem IPv6 (a chave não pode ter `:`); o IPv6 é omitido e contado.
- **Chave:** ThreatFox, URLhaus e MalwareBazaar exigem Auth-Key gratuita (auth.abuse.ch) no secret `ABUSECH_AUTH_KEY` (`npx wrangler secret put ABUSECH_AUTH_KEY --name ness-know`). Sem ela, essas três registram o erro em `saude_fontes` e o Feodo segue.
- **Fora desta etapa** (licença por confirmar, ver lacunas 8.5): Spamhaus DROP, ransomware.live, MISP/CIRCL, VirusTotal, AbuseIPDB e Shodan InternetDB.

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

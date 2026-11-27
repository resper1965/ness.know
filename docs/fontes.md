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
| MITRE ATT&CK Enterprise | base embutida (sem coleta) | a cada release do ATT&CK, por PR | aviso após 200 dias | Uso livre com atribuição à MITRE (termos de uso do ATT&CK) | não |
| Feodo Tracker (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 3 dias | **CC0, inclusive uso comercial** (abuse.ch, termos de uso, seção 3.4) | não |
| ThreatFox (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 7 dias | Uso interno da NESS **autorizado pelo abuse.ch** | sim (`ABUSECH_AUTH_KEY`) |
| URLhaus (abuse.ch) | lote | a cada 1 h | 6 h; indicador vale 7 dias | Uso interno da NESS **autorizado pelo abuse.ch** | sim (`ABUSECH_AUTH_KEY`) |
| MalwareBazaar (abuse.ch) | lote | a cada 30 min | 3 h; indicador vale 7 dias | Uso interno da NESS **autorizado pelo abuse.ch** | sim (`ABUSECH_AUTH_KEY`) |
| DROP (Spamhaus) | lote | a cada 6 h | 24 h; o que sai da lista expira na hora | Gratuito (termos do DROP, 2.1); conteúdo protegido, **uso interno da ness.** (3.1) | não |
| Ransomware.live (API PRO) | lote | a cada 1 h | 6 h; histórico de 180 dias | Uso comercial **aprovado pelo dono da Ransomware.live** (informado em 26/11/2026); atribuição obrigatória | sim (`RANSOMWARE_LIVE_API_KEY`, gratuita em my.ransomware.live) |
| Cloudflare Radar (API REST) | ao vivo, cache de 5 min | sob demanda | n/a | Token gratuito, permissão Account > Radar > Read | sim (`RADAR_API_TOKEN`) |

O **prazo** do KEV é o da diretiva BOD da CISA para agências federais dos EUA. Para clientes da ness., é referência de urgência, não obrigação; a resposta repete isso.

## Ferramentas

Na interface de administração, a aba **Fontes** lista cada fonte (marcada como **Conhecimento**, referência para consultar e entender, ou **Dado**, estado e sinais que mudam) (coleta periódica, consulta ao vivo ou base embutida) com versão, última coleta, itens, estado e licença (resumo com "ver mais"). É somente leitura e usa `GET /api/fontes`, o mesmo dado da ferramenta `saude_fontes`.

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
| `ioc_consultar` | `valores[]` (até 50 IPs, domínios, URLs, hashes ou redes CIDR) | Por valor: o que cada fonte lista (família, ameaça, confiança, primeira e última vez visto, validade), URLs do host, **redes do DROP que contêm o IP** (ou se sobrepõem à rede consultada) e a divergência entre fontes. **Sem veredito** |
| `ioc_novidades` | `tipo?`, `familia?`, `desde?`, `pagina?` | Indicadores que entraram (50 por página), com total |
| `exportar_lista` | `tipo`, `fonte?`, `confianca_min?`, `formato?` (`texto`, `csv`, `cdb`), `limite?` | Lista vigente para aplicar (até 2.000 linhas); a inteira sai em `GET /v1/listas/{tipo}` |
| `mitre_tecnica` | `consulta` (id ou termo) | Técnica, grupo, software, tática ou mitigação do ATT&CK: descrição, táticas, plataformas, detecção, mitigações, subtécnicas, grupos e software, com URL oficial e versão da base |
| `ransomware_atividade` | `grupo?`, `setor?`, `pais?`, `desde?` (padrão 30 dias), `pagina?` | Total, resumo por grupo, país e setor (top 10) e as 20 vítimas mais recentes da página, com link da Ransomware.live. **Alegações, não incidentes confirmados** |
| `rfc_consultar` | `numero`, `termo?` | RFC do IETF ao vivo (rfc-editor.org): título, status, resumo, obsoletos e atualizações, erratas e, com `termo`, até 3 trechos literais do texto. Cache de 24 h |
| `wazuh_regra` | `consulta` (id ou termo) | Regra do ruleset oficial do Wazuh: nível, descrição, arquivo, grupos, decoder, dependências, regras filhas, técnicas ATT&CK com nome e CVEs. Por termo: descrição, grupo, id MITRE ou CVE |
| `wazuh_decoder` | `consulta` (nome ou termo) | Decoder do ruleset oficial: pai, filhos, programa, campos extraídos, arquivo e regras que o usam |
| `saude_fontes` | nenhuma | Estado, frescor, erro, frequência, TTL e licença de cada fonte |

Para sistemas (ness.OS): `POST /v1/cve` com `{"cves": [...]}` (até 500) e `Authorization: Bearer nesskb_…`. Devolve o mesmo formato, sem NVD. Limite por chave: o mesmo `LIMITE_MCP`.

**API em lote para o ness.OS** (somente leitura; `Authorization: Bearer nesskb_…`, mesmo limite por chave do MCP):

| Endpoint | O que faz |
|---|---|
| `POST /v1/cve` `{"cves": [...]}` | Até 500 CVEs: KEV, EPSS e avisos de fabricante, sem NVD |
| `POST /v1/ioc` `{"valores": [...]}` | Até 300 IPs, domínios, URLs ou hashes. Uma resposta por indicador, o que cada fonte diz, sem veredito. O limite é 300 porque cada indicador pode fazer até 3 consultas ao D1, que aceita 1.000 por requisição. Mande só o indicador, nunca o nome do cliente |
| `GET /v1/novidades?desde=<ISO>` | O que o ness.know **viu** depois de `desde` (KEV, avisos, contagem de indicadores novos por fonte e de vítimas de ransomware). Devolve `cursor`: guarde e mande de volta em `desde`. Se `completo` vier `false`, a lista foi cortada em 500 itens e o `cursor` aponta o último item devolvido, então a próxima chamada continua dali. Sem `desde`, vale as últimas 24 h. "Visto" é o instante da coleta do ness.know, não a data da fonte |
| `GET /v1/saude` | O mesmo estado da aba Fontes e, em `problemas`, as fontes com erro, pausadas ou passadas do prazo; `ok: false` quando há alguma |
| `GET /v1/listas/{tipo}` | Lista inteira de indicadores vigentes (`texto`, `csv` ou `cdb`), para o ness.OS aplicar pelo processo dele |


### Documentação oficial (`buscar_doc_oficial`)

Cobertura do produto `microsoft` (testada em 26/11/2026): o Learn já traz Active Directory (replicação com `repadmin`, Kerberos), Windows Server, Group Policy, IDs de evento de auditoria (4768, 4771) e a referência de cmdlets do PowerShell (`Get-ADUser`). O que faltava era o roteamento: a descrição da ferramenta só citava M365, Entra, Exchange, Azure e Defender, então o agente não a escolhia para essas perguntas. Fora do Learn: status do M365 (sem página pública) e Fortinet (lacuna).

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

> **Licença (26/11/2026).** Pelos [termos do abuse.ch](https://abuse.ch/terms-of-use/), só o **Feodo Tracker** é CC0, inclusive para uso comercial. **ThreatFox, URLhaus e MalwareBazaar** são gratuitos só para uso sem fins lucrativos, e uso por empresa pode exigir assinatura paga (seção 4). Por isso a coleta ficou pausada (migração 0016) até o dono combinar o uso com o abuse.ch. **O dono combinou diretamente com o abuse.ch e informou a autorização em 26/11/2026** (comunicação pessoal; não há e-mail no repositório), e a migração 0018 retomou as três fontes. **O que foi combinado:** base de conhecimento interna, consultada pela equipe de SOC e NOC; sem revenda, sem redistribuição e **sem treino ou melhoria de modelo de IA** (o dado só é recuperado como texto de referência quando uma pessoa pergunta). Se o uso mudar (por exemplo, repassar a lista a clientes), combine de novo. `exportar_lista` traz esse aviso. A chave (`ABUSECH_AUTH_KEY`) é só a identificação do usuário; a licença é o que foi combinado.

- **Coleta em lote, sem consulta por indicador:** nenhuma pergunta gasta cota de terceiros, e a consulta fala do indicador, nunca do cliente. O ness.know só registra o nome da ferramenta no uso, não o valor consultado.
- **Normalização** (`indicadores`): tipo (`ip`, `dominio`, `url`, `hash`), valor em forma canônica, fonte, família, tipo de ameaça, confiança (só se a fonte informa; desconhecido fica vazio, nunca zero), tags, primeiro e último visto, validade. Valor com quebra de linha, espaço ou formato inválido é descartado.
- **Validade:** o indicador vale 3 dias (Feodo) ou 7 dias (os demais) sem reaparecer na fonte. Passado o prazo, vira `expirado`, continua visível como expirado e é apagado 90 dias depois. As consultas já respeitam o prazo sem esperar o cron.
- **Sem veredito:** não listado não significa seguro; listado não significa comprometido. Se as fontes divergem (família ou confiança), a resposta mostra a divergência e não escolhe. A resposta traz o frescor de todas as fontes, porque "não listado" só vale com a coleta em dia.
- **`exportar_lista`:** o ness.know não bloqueia nada. A lista é entrada para o processo de aprovação do ness.OS. Com `confianca_min`, quem não informa confiança fica de fora. A lista CDB do Wazuh (`chave:valor`) não aceita URL nem IPv6 (a chave não pode ter `:`); o IPv6 é omitido e contado.
- **Chave:** ThreatFox, URLhaus e MalwareBazaar exigem Auth-Key gratuita (auth.abuse.ch) no secret `ABUSECH_AUTH_KEY` (`npx wrangler secret put ABUSECH_AUTH_KEY --name ness-know`). Sem ela, essas três registram o erro em `saude_fontes` e o Feodo segue.
- **Fora desta etapa** (licença por confirmar, ver lacunas 8.5): Spamhaus DROP, ransomware.live, MISP/CIRCL, VirusTotal, AbuseIPDB e Shodan InternetDB.

### Atividade de ransomware (Ransomware.live)

- **O que é:** vítimas anunciadas por grupos de ransomware em sites de vazamento. A coleta lê `/victims/recent` da **API PRO** (as 100 mais novas) de hora em hora. O limite deles é de 60 chamadas por minuto e o dado é cacheado por 30 minutos, então uma por hora é uso justo.
- **Termos** (https://www.ransomware.live/t&c): o uso comercial exige aprovação prévia por escrito do dono (5.2), que o dono da NESS obteve (informado em 26/11/2026). Seguem valendo a **atribuição** à Ransomware.live, o uso justo (4) e a proibição de **redistribuição comercial** dos dados: a ferramenta é de uso interno e não há exportação de lista.
- **O que se guarda:** quem (grupo e vítima), onde (país e setor), quando (descoberta e data do ataque), o domínio e o link da página da vítima na Ransomware.live. **Não se guarda** a descrição escrita pelo grupo (pode trazer dados do vazamento) nem o endereço onion do post. País e setor desconhecidos ficam vazios (a fonte escreve "Not Found" e o ness.know não repete). O histórico é de 180 dias.
- **Alegação, não fato:** o anúncio é do criminoso. Nome de vítima não prova que o ambiente de um cliente foi afetado, e cruzar com os clientes é papel do ness.OS. A resposta repete isso.
- **Chave:** secret `RANSOMWARE_LIVE_API_KEY` no Worker (`npx wrangler secret put RANSOMWARE_LIVE_API_KEY --name ness-know`). Sem ela, a fonte registra o erro em `saude_fontes` e as demais seguem. Com a chave gratuita da PRO, os endpoints `/stats` e `/victims/search` devolvem 403; só o `/victims/recent` é usado.

### Spamhaus DROP (redes sequestradas)

- **O que é:** lista "Don't Route or Peer" (v4 e v6): blocos de endereços alugados ou sequestrados por quadrilhas de spam e crime cibernético (cerca de 1.800 redes). Entra em `indicadores` como tipo `rede`, com a faixa de cada CIDR; `ioc_consultar` responde se um IP (ou uma rede) cai dentro de alguma rede listada, comparando faixas, não texto.
- **Termos lidos** (https://www.spamhaus.org/blocklists/drop-fair-use-policy/) e o que mudam no uso:
  - **2.1** gratuito: a fonte entra.
  - **3.1** o conteúdo é protegido por direito autoral e de banco de dados, sem licença de redistribuição: **uso interno da ness.**; a lista não vai para terceiros nem para clientes. `exportar_lista` e `/v1/listas/rede` trazem o aviso.
  - **3.2** é proibido usar o nome Spamhaus em material comercial ou promocional: a atribuição é interna e o agente não deve citar o nome em proposta, relatório ou material para cliente.
  - **4.2** manter a lista em dia e revisar antes de importar em filtros: a coleta é a cada 6 h e **o que sai da lista expira na hora** (não espera os 3 dias das demais). Aplicar sempre pelo processo de aprovação do ness.OS.
- **Validação:** cada arquivo traz uma linha de metadados com a contagem; contagem que não bate, linha fora do formato ou lista pequena demais (menos de 100 redes no v4) derrubam a coleta sem tocar no que já estava gravado.
- **Exportação:** `exportar_lista(tipo: "rede")` em texto, CSV ou CDB do Wazuh (que aceita CIDR IPv4 como chave; o IPv6 é omitido porque a chave não pode ter `:`).
- **Cuidado de leitura:** estar numa rede do DROP é um sinal forte sobre o bloco, mas não é veredito sobre o IP, e a lista muda com o tempo (alocações são reatribuídas).

### Skills oficiais de fabricante (camada 6)

Skill é instrução que o agente executa com o acesso da pessoa. Por isso entra **só** skill de fabricante, lida linha a linha, com a revisão registrada. Nada de marketplace da comunidade (skills.sh e semelhantes servem, no máximo, para descobrir candidatas).

- **Ferramentas:** `listar_skills_fabricante()` e `ler_skill_fabricante(nome)`, só leitura. A resposta traz a origem (repositório e commit), a licença, quem revisou e quando, e o que foi alterado em relação ao original. O corpo vem com um cabeçalho que diz que é guia de terceiros, que o ness.know não executa nada e que ninguém deve agir, instalar programas ou alterar arquivos de instrução por causa do texto.
- **Hoje:** só `cloudflare-one` (aprovada pelo dono em 26/11/2026) (Zero Trust: Access, Gateway, WARP, Tunnel), de `cloudflare/skills`, Apache-2.0. Das 24 skills do repositório, as de desenvolvimento (Workers, Durable Objects, sandbox, Next.js…) e as que operam a conta por CLI (`cf-cli`, que ainda orienta a editar o `AGENTS.md` do usuário) ficaram de fora.
- **O arquivo original** fica em `skills-fabricante/<nome>/SKILL.md`, sem alteração, junto do `LICENSE` do fabricante, para o diff contra o upstream. O que o ness.know serve é derivado dele: a seção "Skill feedback" (que manda abrir issue pública no GitHub) sai, e os links relativos ao repositório do fabricante viram o texto do link. As alterações aparecem na resposta, como a Apache-2.0 pede.
- **A revisão vale para aquele texto:** o manifesto (`skills-fabricante/manifesto.json`) guarda o sha256 do arquivo; sha256 diferente derruba a geração. Skill sem `revisao` (quem leu e quando) **não entra** na base embutida.
- **Para adicionar ou atualizar:** copie o `SKILL.md` e o `LICENSE` do fabricante, leia linha a linha, atualize commit, data e sha256 no manifesto, preencha `revisao: { "por": "...", "em": "AAAA-MM-DD" }` e rode `node scripts/gerar-skills-fabricante.mjs`. Abra o PR: o diff mostra o texto inteiro.

### MITRE ATT&CK

- **Base embutida:** o STIX oficial tem ~55 MB e não cabe no Worker. `scripts/gerar-attack.mjs` extrai o que serve (técnicas, subtécnicas, grupos, software, mitigações e as estratégias de detecção, com texto curto e sem citações) para `src/fontes/dados/attack-enterprise.json` (~2 MB). O arquivo vai no repositório e é revisado em PR; o Worker o carrega só quando alguém pergunta de ATT&CK.
- **Atualizar a cada release do ATT&CK** (duas vezes por ano; a resposta avisa quando a base passa de 200 dias):
  ```bash
  ATTACK_COMMIT=$(git ls-remote https://github.com/mitre-attack/attack-stix-data HEAD | cut -c1-12) node scripts/gerar-attack.mjs
  npm test && npm run check
  ```
  Revise o diff, abra o PR e faça o deploy.
- **Atribuição:** toda resposta traz a atribuição à MITRE. Só o domínio Enterprise está na base (ICS e Mobile ficam de fora; um id desses responde que não consta).
- **Ligação com as ameaças:** `ioc_consultar` liga a família de malware ao software do ATT&CK quando o nome ou apelido coincide (ex.: Emotet = S0367), sem afirmar mais que o nome.

### RFCs do IETF (roteamento e VPN)

Consulta ao vivo ao `www.rfc-editor.org` (`/rfc/rfcN.json` para metadados e `/rfc/rfcN.txt` para os trechos). **Licença:** IETF Trust Legal Provisions (TLP 5), seção 3.c, permite copiar e distribuir documentos do IETF integralmente e sem modificação, com atribuição ao IETF e ao RFC; acima de um quinto do texto exige os avisos legais originais. Por isso a ferramenta devolve metadados e **trechos literais curtos** (até 3, 900 caracteres), nunca o RFC inteiro, e nunca resume o texto dentro do campo do trecho. Derivados (resumos, traduções) não são licença concedida: o resumo vem do campo `abstract` do próprio RFC Editor. Verificado em 26/11/2026 para os RFCs 4271, 2328 e 4301. O `status` do JSON é o nível atual; o cabeçalho do `.txt` mostra o da publicação. Confira `obsoleta_por` e `atualizada_por` antes de afirmar o comportamento atual.

### Exploits públicos por CVE (Metasploit e Nuclei)

Coleta diária do **índice** (nunca o código): `modules_metadata_base.json` do Metasploit Framework (BSD de 3 cláusulas, © Rapid7) e `cves.json` do Nuclei Templates (MIT, ProjectDiscovery), em tabela `exploits`. O `cve_consultar` e `/v1/cve` ganham `exploits_publicos`: `exploit_publico` (módulo de tipo exploit), `verificador_publico` (módulo auxiliary ou template do Nuclei, que só verificam a falha), contagem por fonte e até 8 itens com link para a origem. **Existir exploit público não diz que o CVE está sendo explorado: isso é o `no_kev`.** Grava só o que mudou; o que sai da origem fica marcado por 90 dias; se a origem vier com menos da metade do que já temos, a coleta falha sem apagar nada. Medido em 26/11/2026: 3.555 registros do Metasploit (3.217 CVEs) e 4.812 do Nuclei.

**Exploit-DB: fora, por decisão.** O repositório é GPL, mas os termos do site (exploit-db.com/terms) dizem "You agree not to reproduce, duplicate, copy, sell, resell, or exploit any portion of the Service" e limitam o uso da API. Entra se a OffSec autorizar por escrito. **PoC-in-GitHub** (CC0) não tem índice único (um JSON por CVE, milhares de arquivos) e o próprio repositório avisa que há malware: fica fora.

### CIRCL hashlookup (hash de arquivo conhecido)

Ao vivo em `hashlookup.circl.lu/lookup/{md5|sha1|sha256}/{hash}`, sem chave. `ioc_consultar` e `POST /v1/ioc` acrescentam o campo `hashlookup` a cada hash: `conhecido`, arquivo, tamanho, origem (NSRL e outras), base, confiança do CIRCL (50 é "sem opinião") e produto. Até 50 hashes distintos por chamada, cache de 24 h; falha de um hash não derruba os outros (`indisponivel`). **Estar na lista não prova que o arquivo é seguro, e não estar não prova que é malicioso.** Licença: dados CC-BY, uso comercial permitido com referência a `circl.lu/services/hashlookup/` (a resposta cita a fonte).

### Wazuh (regras e decoders por id)

Base embutida, como o ATT&CK: `scripts/gerar-wazuh.mjs <pasta-ruleset> <tag> <commit>` lê `ruleset/rules` e `ruleset/decoders` do repositório oficial (github.com/wazuh/wazuh, tag de release) e grava `src/fontes/dados/wazuh.json` (~1 MB, carregado só quando alguém pergunta de Wazuh). Não há coleta: atualizar é regenerar, abrir o PR e fazer o deploy; a resposta avisa quando a base passa de 120 dias.

- **Licença:** os arquivos do ruleset trazem "Created by Wazuh, Inc." e GPLv2. O ness.know guarda e serve só **metadados** (id, nível, descrição, grupos, dependências, MITRE, CVE, arquivo; nos decoders, pai, programa, campos e o início do `prematch`), sem a lógica de detecção das regras (`match`, `regex`, `field`). Cada resposta cita Wazuh, Inc., GPLv2, a tag e o commit.
- **Limite:** é a regra **oficial** da versão gerada. A que roda no ambiente do cliente pode ser outra (versão diferente, regra local em `local_rules.xml` ou `overwrite`); confira no manager.
- Os ids MITRE das regras viram o nome da técnica pelo `mitre_tecnica`.

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

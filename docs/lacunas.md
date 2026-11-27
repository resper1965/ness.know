# Lacunas conhecidas

Levantamento de 31/10/2026, revisto em 01/11/2026: o que falta, o que limita o uso e o que está pendente de operação.

- **Prioridade:**
  - **P1** bloqueia uso ou deixa produção diferente do código;
  - **P2** limita um caso de uso real;
  - **P3** melhoria.
- **Situação:** ao fechar uma lacuna, apague a linha e registre a mudança no documento de referência (README, `arquitetura.md`, `mcp.md`).

## 1. Produção atrás do código (P1)

Em dia desde 03/11/2026: Worker com o código do `main`, migração 0004, catálogo e STRM do SCF 2026.3 carregados (1.591 controles, 268 frameworks) e ferramentas de correspondência conferidas em produção (Anexo A → TX-RAMP L2 21 / 110 / 92, Anexo A → SOC 2 50 / 293 / 56, `detalhar_controle MON-02`). A chave do faBRAINzio foi emitida e gravada em 02/11/2026, e o pacote `forense-digital` (ABNT NBR ISO/IEC 27037:2013) foi carregado em 03/11/2026.

Nenhuma pendência.

## 2. Conteúdo da base

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 2.1 | Setor elétrico só tem a REN 964/2021; faltam os documentos do ONS (Procedimentos de Rede, RO-CB.BR.01) | O faBRAINzio (Alupar) não responde sobre o ONS | Carregar no pacote `setor-eletrico` | P2 |
| 2.2 | Regulação financeira (BCB 538/2025, CMN 5.274/2025) não está na base | Ofertas de conformidade financeira sem fonte | Pacote novo ou acréscimo; não há STRM para elas | P2 |
| 2.3 | Normas presentes no STRM sem o texto na base (IEC 62443, NIST 800-53, 800-82, NERC CIP, PCI DSS, SOC 2, DORA, NIS2…); a LGPD já está no pacote `legislacao-digital` | `correlacionar` e `cobertura` devolvem o item, mas `buscar_conhecimento` não traz o texto para confirmar | Priorizar por uso: IEC 62443 e NIST 800-53 | P2 |
| 2.4 | REN 964, ISO 20000-1 e ITIL não estão no STRM do SCF | Não há correspondência automática para esses três | Mapeamento próprio (tabela `strm` com framework da ness.), ou só busca textual | P3 |
| 2.5 | Recarregar uma norma substitui a anterior, sem histórico de versões | Não dá para consultar a versão vigente numa data passada | Guardar versões e marcar a vigente, se algum cliente pedir | P3 |
| 2.6 | PDF sem camada de texto falha na carga | Normas escaneadas não entram | OCR antes da carga; o serviço não faz OCR | P3 |
| 2.7 | Normas sem versão vigente completa no acervo ctresb/leis, fora dos pacotes `legislacao-digital` e `crimes-ciberneticos-e-ti`: Decreto 8.771/2016 e Decreto 9.637/2018 (só o original; foram alterados), Lei 14.133/2021 e Lei 9.609/1998 (só atos acessórios), Decreto 11.491/2023 (sem a Convenção de Budapeste) | Perguntas sobre licitação de TI, software, PNSI e regulamento do Marco Civil ficam sem fonte | Baixar o texto compilado do Planalto (HTML ou PDF) e acrescentar à pasta do pacote | P2 |
| 2.8 | LGPD do pacote `legislacao-digital` consolidada à mão com a Lei 15.352/2026 (o compilado do acervo parava na Lei 14.460/2022) | Redação dos arts. 5º, VIII e XIX, 55-A e 55-C não conferida com a oficial | Comparar com a compilação do Planalto e trocar o arquivo pelo oficial | P2 |
| 2.9 | `dispositivos-medicos` (ABNT NBR IEC 62304:2023): a conversão do PDF deixou os títulos de seção grudados no texto seguinte e 254 dos 255 trechos saem rotulados `Page N` | O agente cita "Page 30" em vez da seção (as instruções do pacote pedem a seção); acerto em 1º de 50% e no top 5 de 80%, contra 75% a 79% e 100% nos outros pacotes | Extrair o texto do PDF com `pdftotext`, limpar cabeçalhos e rodapés (como na 27037) e recarregar com o mesmo título | P2 |

## 3. Correspondência entre frameworks (SCF)

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 3.1 | **Conferida em 06/11/2026** (`scripts/conferir-strm.mjs` contra as planilhas 2026.1): 137 de 173 frameworks comuns sem diferença de itens; 6 frameworks só mudaram de id; 4 são troca de versão (CRA 2022→2024, NIST 800-172→r3, RD 311/2022); as quedas de itens do FedRAMP e do NIST 800-53 Privacy coincidem com os tamanhos dos baselines oficiais (a confirmar na fonte); amostra de 90 itens (ISO 27002, NIST CSF, TX-RAMP) coerente com a renumeração. Ressalva do NIST 800-161 r1: `SR-4` a `SR-13` saíram, e o PDF 2026.3 não traz `SR-10` em nenhuma das 60 páginas (pdfplumber), então a diferença é do SCF e não da extração | Resta conferir à mão os ids de Essential 8 e IRS 1075 (troca de esquema ou de notação, abaixo ou perto de 2%) e confirmar os totais do FedRAMP na fonte. Página do PDF sem texto extraível não seria detectada pela busca de `SR-10` | Rodar de novo a cada versão nova do SCF | P3 |
| 3.2 | `cobertura` aceita uma única origem | Quem implementou ISO 27001 **e** NIST CSF precisa somar à mão | Aceitar várias origens (`de` como lista de pares framework × itens) | P2 |
| 3.3 | O pacote `scf-strm` é tudo ou nada por chave | Não dá para liberar só alguns frameworks a um cliente | Restrição por framework na chave, como já existe por norma | P3 |
| 3.4 | Anexo A da ISO 27001 não existe como framework no SCF | Usuário precisa saber que é a ISO 27002 | Já tratado na mensagem de erro; documentar nas skills | P3 |
| 3.5 | Item numérico lido como a célula exibe | Uma versão futura com `1.10` gravado como número colidiria com `1.1` | Rever a cada nova versão em planilha (anotado em `scripts/strm.mjs`) | P3 |
| 3.6 | Resultado de `cobertura` segue a granularidade do SCF (subcontrole só conta se ligado ao mesmo subcontrole) | Lacunas superestimadas em alguns itens | Explicar no resultado (já em `mcp.md`) e confirmar no texto da norma | P3 |

## 4. Skills

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 4.1 | Fatia 1 pronta no código (tabela, `obter_skill`, carga); falta a linha de base e a skill `consultando-normas`; o resto do [plano](skills-plano.md) é proposta | O agente usa a base sem método: cita mal, busca uma vez, entrega prosa | Onda 1 (`consultando-normas`, `correlacionando-controles`, `avaliando-lacunas`, `avaliando-mudanca`), com teste de linha de base antes de cada uma | P2 |
| 4.2 | O plano não prevê skill para os pacotes novos (62304, 27037, 31000 como norma própria) nem para as ferramentas `cobertura` e `detalhar_controle` | Skills `avaliando-lacunas` e `preparando-auditoria` deixam as ferramentas de fora | Revisar o plano incluindo essas ferramentas e pacotes | P2 |
| 4.3 | Não há forma de entrega definida (arquivo `SKILL.md` em repositório, `prompts` do MCP, ou instruções do pacote) | Cada cliente (Claude Code, faBRAINzio, ness.brain) recebe de um jeito | Decidir: recomendação é publicar como `prompts` do MCP, filtrados pela chave | P2 |

## 5. Acesso e segurança

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 5.5 | Mudar o que uma chave enxerga exige revogar e gerar outra | Troca de chave em todos os agentes que a usam | Aceitável; rever se houver muitos clientes | P3 |

## 6. Busca

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 6.1 | O gabarito cobre os pacotes novos (`docs/gabaritos/`, medido em 03/11/2026) e as 36 perguntas de 30/10, mas não o setor elétrico nem as ferramentas de correspondência (`correlacionar`, `cobertura`), que o `avaliar-busca.mjs` não mede | Não se sabe a qualidade da busca no setor elétrico nem se as ferramentas do SCF respondem o que o usuário pergunta | Gabarito do `setor-eletrico`; para as ferramentas, um teste de pares conhecidos (como o da lacuna 1.5) | P3 |
| 6.2 | `BUSCA_MINIMO` (0,4) escolhido sem calibração | Trechos irrelevantes passam ou relevantes caem | Calibrar com as notas que `avaliar-busca.mjs` mostra | P3 |
| 6.3 | Rerank desligado (na avaliação de 30/10, o 1º lugar ficou igual, 67%, e o MRR caiu de 0,77 para 0,75) | — | Reavaliar com o gabarito ampliado | P3 |

## 7. Documentação e operação

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 7.1 | Sem ambiente de teste separado; carga e migração vão direto à produção | Erro de carga afeta os agentes em uso | Aceitável no volume atual; usar `--local` para ensaiar SQL grande | P3 |
| 7.2 | Cargas grandes do SCF (8 e 11 MB) deixam o `/mcp` lento | Respostas lentas durante a carga | Rodar fora do horário comercial (já em `operacao.md`) | P3 |
| 7.3 | Deploy e cargas dependem de uma pessoa no computador | Atualização para quando o dono está fora | Token de API com escopo de Workers e D1 guardado no cofre, ou Workers Builds no push | P3 |

## Ordem recomendada

1. 3.1 (conferência da extração), antes de qualquer cliente usar `cobertura` num relatório.
2. 2.1 (ONS), para o faBRAINzio.
3. 4.1 e 4.3 (primeira onda de skills e forma de entrega).

## 8. Fontes externas (conhecimento público)

Levantamento de 25/11/2026, a partir do plano das fontes externas ([fontes.md](fontes.md)). O ness.know só serve conhecimento **externo e público**; dado interno da ness. e dado de cliente ficam no ness.OS.

**Estado em 27/11/2026.** Camadas no ar: vulnerabilidades (KEV, EPSS, avisos da Microsoft e da Fortinet, exploits públicos do Metasploit e do Nuclei), ameaças (abuse.ch, DROP, ransomware.live, CIRCL hashlookup), referência técnica (documentação oficial, RFCs, MITRE ATT&CK, grupos de ameaça do MISP, Wazuh, Sigma, YARA, skills de fabricante), estado (provedores e Radar) e a API em lote `/v1` para o ness.OS, com a aba Fontes no painel. O que ficou de fora **foi por licença** (ver [plano-inteligencia.md](plano-inteligencia.md)) e depende de decisão ou autorização do dono ([pedidos-autorizacao.md](pedidos-autorizacao.md)).

### 8.1 Lacunas, com as soluções possíveis

| # | Lacuna | Efeito | Soluções possíveis | Prioridade |
| --- | --- | --- | --- | --- |
| 8.1 | **Google Workspace, documentação:** não há fonte oficial de busca no Admin Help. Os MCPs oficiais do Workspace (preview) operam sobre dados do usuário (Gmail, Drive…), não buscam documentação | `buscar_doc_oficial` não cobre o Workspace | (a) buscar sob demanda só páginas oficiais de uma lista fixa de URLs, depois de conferir termos e `robots.txt`; (b) esperar uma fonte oficial; (c) operar o tenant pelo MCP do Workspace, no ness.OS, com o acesso da pessoa. Não raspar sites | P2 |
| 8.3 | **Microsoft 365, status:** o status público oficial exige tenant (Graph `serviceHealth`, permissão `ServiceHealth.Read.All`) ou responde 401. O RSS do Azure abre | `status_provedor` não cobre o M365 | (a) Azure pelo RSS aberto (PR 4); (b) M365 do tenant da ness. pelo Graph, somente leitura, no ness.OS: cobre a ness., não os clientes | P2 |
| 8.4 | **Documentação de GLPI, Datto RMM, Atera, Action1 e Fortinet:** nenhuma tem fonte oficial pesquisável verificada; o site do Action1 devolve 403 a clientes automáticos; o `llms.txt` do Action1 só lista posts | Sem busca oficial dessas documentações | Mesmas soluções de 8.1, produto a produto; para o GLPI, conferir se a documentação é aberta e ingerível pela licença (não verificado). Fortinet: avisos de segurança já entram | P3 |
| 8.5 | **Licenças por confirmar:** ransomware.live (uso comercial), MISP/CIRCL (licença dos feeds), Spamhaus DROP (redistribuição), VirusTotal (a chave gratuita proíbe uso comercial), AbuseIPDB e Shodan InternetDB (gratuito só para uso não comercial) | Essas fontes de inteligência de ameaças ficam fora | Ler os termos de cada uma e decidir: incluir, pagar (fora das regras, que pedem custo zero) ou descartar | P2 |

### 8.2 Decisões já tomadas

- Playbooks e runbooks da ness. **não** moram no ness.know: são do ness.OS.
- As ferramentas externas são abertas a qualquer chave válida, sem papéis nem recorte por cliente. Os pacotes de normas e os documentos enviados pelas empresas seguem com o RBAC de sempre.
- `url_scan` só consulta resultados já existentes no Radar. Enviar uma URL cria registro na conta e a expõe a um terceiro, o que contradiz somente leitura e privacidade.
- MITRE ATT&CK entra por um arquivo enxuto (técnicas, grupos, softwares) gerado por script e revisado em PR; o STIX completo tem 55 MB e não cabe no Worker.
- Wazuh: só regras e decoders por ID, a partir do repositório oficial; os outros produtos da stack operada ficam como lacuna (8.4).
- **FortiGate/FortiOS (documentação de administração, CLI, SD-WAN):** fora, por decisão. Os termos da Fortinet (fortinet.com/corporate/about-us/legal.html, lidos em 26/11/2026, em parte por resumo) limitam o uso do site a fins não comerciais dentro da organização e proíbem modificar, distribuir ou criar derivados. Não há API, feed nem MCP oficial, e o `robots.txt` do docs.fortinet.com pede intervalo de 2 s e bloqueia URLs com query string. Os avisos de segurança (PSIRT) seguem em `avisos_fabricante`. Para entrar: pedir autorização à Fortinet, como foi feito com o abuse.ch, ou a equipe consultar o docs.fortinet.com direto.
- Rascunhos dos pedidos de autorização (Fortinet, RIPE NCC, OffSec, Palo Alto, Ivanti e NIC.br) em [pedidos-autorizacao.md](pedidos-autorizacao.md). Nenhum foi enviado.
- **Fortinet PSIRT (`avisos_fabricante`) já está em produção com a mesma exposição.** Foi ativado como "feed RSS público" sem eu ter lido os termos; ao ler os termos do site (fortinet.com/corporate/about-us/legal.html, 26/11/2026, em parte por resumo), eles limitam o uso a fins não comerciais dentro da organização e proíbem modificar, distribuir ou criar derivados. O ness.know guarda só título, resumo curto, CVEs e link. Decisão pendente do dono: manter (risco assumido), pedir autorização à Fortinet ou pausar a fonte (`UPDATE fontes SET ativa = 0 WHERE id = 'fortinet'`).
- **Roteamento e VPN (protocolos):** `rfc_consultar` (RFCs do IETF, ao vivo). Documentação de equipamento de outros fabricantes (Cisco, Juniper, MikroTik) não foi avaliada.
- `sigma_regra`, `yara_regra` e `ator_ameaca` (26 e 27/11/2026) são bases embutidas, só metadados: Sigma (DRL 1.1, 3.782 regras), YARA do signature-base (DRL 1.1, 5.881 regras; as 44 com licença própria ficam de fora) e grupos do MISP galaxy (CC0 ou BSD, 1.132 grupos, sem a descrição). O autor da regra acompanha cada resposta.
- `cve_consultar` traz `exploits_publicos` (Metasploit, BSD-3; Nuclei, MIT), só o índice e o link. Exploit-DB e PoC-in-GitHub ficam de fora. `ioc_consultar` traz o CIRCL hashlookup para hashes.
- `wazuh_regra` e `wazuh_decoder` (PR 7) usam o ruleset oficial por base embutida (só metadados, GPLv2 citado). Limite: é a regra oficial da tag gerada, não a do manager do cliente (regra local e `overwrite` ficam fora); decoders ficam sem a lógica completa (só o início do `prematch`).
- `buscar_doc_oficial` (PR 2) consulta Microsoft Learn, Cloudflare Docs e Cloudflare Blog ao vivo; o Learn não tem `maxTokenBudget`, então o limite de tamanho é do ness.know (5 resultados de até 1.200 caracteres, cache de 10 minutos).
- `status_provedor` (PR 4) cobre Cloudflare, Atera, Datto RMM, Google Workspace, Azure e Action1; `internet_estado` usa o Radar com token só de leitura. O status do Microsoft 365 segue como lacuna (8.3). O `/history` da Action1 não é documentado: se mudar, a ferramenta avisa que falhou.
- `url_scan` não foi construído: o URL Scanner do Radar é por conta Cloudflare (precisa de `account_id` e de permissão de escrita na conta para criar a varredura), o que contradiz somente leitura e o escopo mínimo do token. Alternativa a estudar: só consultar relatórios já existentes, se o Radar oferecer busca pública sem conta.
- `ioc_consultar`, `ioc_novidades` e `exportar_lista` (PR 3) usam só o abuse.ch (Feodo Tracker, ThreatFox, URLhaus, MalwareBazaar), em lote e sem veredito. Termos do abuse.ch lidos em 26/11/2026: só o Feodo Tracker é CC0 para uso comercial; ThreatFox, URLhaus e MalwareBazaar ficaram pausados até o dono combinar o uso com o abuse.ch, e **o abuse.ch autorizou o uso interno** (combinado diretamente pelo dono, informado em 26/11/2026; migrações 0018 e 0019): consulta pela equipe de SOC e NOC, sem revenda, sem redistribuição e sem treino de IA (ver `fontes.md`). `ransomware_atividade` (PR 8) usa a API PRO do ransomware.live: os termos (seção 5.2) proíbem uso comercial, **incluindo serviços de cibersegurança**, sem aprovação do dono da Ransomware.live, que o dono da NESS obteve (informado em 26/11/2026). A chave PRO é gratuita; `/stats` e `/victims/search` devolvem 403 com ela, então só `/victims/recent` é usado. O Spamhaus DROP entrou (PR 6) depois da leitura dos termos: gratuito, mas de **uso interno** (sem redistribuição, sem o nome Spamhaus em material comercial; ver `fontes.md`).
- `mitre_tecnica` (PR 5) usa o ATT&CK Enterprise por base embutida, gerada por script e revisada em PR; domínios ICS e Mobile não estão na base.
- Camada 6 (PR 7): `listar_skills_fabricante` e `ler_skill_fabricante` servem só skills de fabricante revisadas (hoje, `cloudflare-one`, Apache-2.0). `cf-cli` e as skills de desenvolvimento do `cloudflare/skills` ficaram de fora; `cloudflare-one-migrations` foi lida e é segura, mas é de nicho. O `MicrosoftDocs/Agent-Skills` só tem skills de Azure e `microsoft/azure-skills` não foi examinado.
- As fontes de 8.5 ficam adiadas até uma decisão.
- Credenciais só como secret do Worker: `ABUSECH_AUTH_KEY` (ThreatFox, URLhaus e MalwareBazaar exigem Auth-Key gratuita desde 21/10/2026; o Feodo Tracker é aberto), token do Radar com escopo só de leitura do Radar, `NVD_API_KEY` (opcional, já em uso). Uma chave do abuse.ch foi colada no chat de trabalho em 25/11/2026: trocar por outra antes de ir para a produção.

### 8.3 Limites atuais

- **EPSS** guarda só os CVEs do KEV; os demais vêm da API da FIRST ao vivo, com cache de 12 h (o arquivo diário tem ~400 mil linhas).
- **CVSS e CWEs do NVD** só em consultas pequenas: 5 CVEs por chamada sem chave, 20 com `NVD_API_KEY`. O lote `POST /v1/cve` não consulta o NVD.
- **Avisos de fabricante** cobrem Microsoft (atualizações mensais, sem CVE por linha) e Fortinet (com CVEs). Cisco, Palo Alto e outros não.
- **Coleta** a cada 15 minutos no mínimo; a atualização da lista de ferramentas no portal da Cloudflare leva até ~2 h.
- **Alerta automático** ("CVE novo em produto do cliente X") está fora do escopo: envolve inventário do cliente e escrita, e fica com o Worker do ness.brain ou o n.secops.

### 8.4 Melhorias possíveis

| # | Melhoria | Ganho | Custo e risco |
| --- | --- | --- | --- |
| M1 | Alarme quando uma fonte passa do TTL | Quem opera descobre a fonte parada sem consultar | **Parcial (26/11/2026):** `GET /v1/saude` e a aba Fontes mostram as fontes com problema. O aviso ativo (e-mail, Teams) é do ness.OS, que consulta `/v1/saude`: o ness.know não envia nada |
| M2 | Cruzar CVE com produto por CPE (NVD) | `kev_buscar` acha o produto sem depender do nome escrito pela CISA | Médio: NVD limita a taxa; CPE vem sujo |
| M3 | Mais fabricantes em `avisos_fabricante` (Cisco, Palo Alto, VMware, Fortinet por CSAF) | Cobre o que a ness. e os clientes operam | **Conferido em 26/11/2026:** Palo Alto e Ivanti têm RSS, mas os termos limitam a uso pessoal e não comercial e proíbem reprodução; Cisco, Broadcom/VMware, Citrix e SonicWall sem feed verificado. Só com autorização ([pedidos-autorizacao.md](pedidos-autorizacao.md)) |
| M4 | EPSS completo (400 mil linhas) em D1 | `cve_consultar` sem chamada ao vivo | Alto: ~12 milhões de linhas gravadas por mês e mais armazenamento; só se a FIRST limitar a API |
| M5 | Endpoints em lote além do CVE (`/v1/ioc`, `/v1/novidades`, `/v1/saude` e `/v1/listas/{tipo}` feitos em 26/11/2026; falta o CDB do Wazuh) | O ness.OS aplica listas com o próprio processo de aprovação | Médio; depende da camada de inteligência de ameaças |
| M6 | Tendências do KEV (inclusões por fornecedor e por mês, uso em ransomware) | Resposta a "o que mais está sendo explorado" | Baixo; só consulta no banco |
| M7 | Trocar o cache em D1 por KV, se a leitura pesar | Menos carga no D1 | Baixo; exige criar o namespace na conta |
| M8 | Consolidar ferramentas parecidas (`kev_*` e `novidades`) se o portal pesar | Menos ferramentas no contexto do agente | Baixo; muda nomes que já podem estar em instruções |
| M9 | Teste de contrato contra o portal real (hoje o teste cobre o contrato MCP, não o portal) | Detecta quebra de namespace antes do usuário | Médio: o portal exige login no Access |
| M10 | Anomalias de tráfego e vazamentos de rota do Radar em `internet_estado` | Cobre mais casos do "é a internet?" | Médio: formatos de resposta ainda não conferidos com o token real |
| M11 | Conferir `internet_estado` com o token real (os formatos vêm da documentação; o filtro `involvedAsn` aparece com grafia diferente nos exemplos) | Remove a incerteza sobre os parâmetros | Baixo: só precisa do token |

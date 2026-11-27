# Plano: inteligência de ameaças completa e ligada ao ness.OS

Criado em 26/11/2026. Parte do que já existe (ver [fontes.md](fontes.md) e a seção 8 de [lacunas.md](lacunas.md)) e propõe o que falta, em ordem. É um plano para decisão: nada aqui está construído, e cada item que traz fonte nova só entra depois do portão de licença.

## Princípios (não mudam)

- **Só leitura.** O ness.know nunca bloqueia, envia ou escreve em sistema externo. Aplicar uma lista é do ness.OS, com aprovação.
- **Só dado público.** Nada de cliente, chamado, log ou playbook. O ness.OS manda ao ness.know **o indicador**, nunca o nome do cliente.
- **Sem veredito.** Mostra o que cada fonte diz, com data e frescor. "Não listado" não é "seguro".
- **Custo zero recorrente.** Fonte paga ou com cota gratuita pequena só entra se a cota for suficiente e o limite estiver tratado.
- **Conteúdo externo é dado, não instrução** (sanitizado).
- **Portão de licença antes de codar**, para cada fonte nova: ler os termos, registrar o que permitem (uso interno? redistribuir? IA?) na linha do catálogo e em `docs/fontes.md`. Se barrar, vira lacuna documentada, como a Fortinet.

## Fase 0: o canal para o ness.OS (fazer primeiro)

O ness.OS já consome `POST /v1/cve` e `GET /v1/listas/{tipo}` com a chave `nesskb_`. Falta o resto.

| Entrega | Descrição | Esforço |
|---|---|---|
| `POST /v1/ioc` | Até 300 indicadores por chamada (limite de consultas do D1); uma resposta por indicador com o que cada fonte diz, fonte e frescor. Reaproveita `ioc_consultar` | 1 PR |
| `GET /v1/novidades?desde=<cursor>` | O que entrou desde a última leitura (KEV, indicadores, avisos, ransomware). O cursor evita repetir | 1 PR |
| `GET /v1/saude` | O mesmo estado da aba Fontes, para o ness.OS alertar quando uma fonte parar | 1 PR (junto do anterior) |
| Alerta de fonte parada (M1) | Fonte passada do TTL sinalizada em `/v1/saude` e na aba | no mesmo PR |

**Pronto quando:** o ness.OS consulta 300 IPs de uma vez e recebe a resposta em formato estável, sem enviar nome de cliente. Testes com banco SQLite como os de `/v1/cve`; documento `docs/mcp.md` e OpenAPI atualizados.

## Fase 1: reputação e contexto de indicadores (a maior lacuna)

Objetivo: uma segunda e terceira opinião além do abuse.ch, e contexto de quem é o IP.

Situação em 26/11/2026, depois da leitura dos termos (o que não foi possível ler está marcado):

| Fonte | O que traz | Situação |
|---|---|---|
| CIRCL hashlookup | Hash conhecido (NSRL e outras bases) | **Feito.** Dados CC-BY, uso comercial permitido com referência ao CIRCL; sem chave. Ao vivo, cache de 24 h, até 50 hashes por chamada |
| CIRCL DNS passivo | Histórico de resolução | **Fora.** Restrito a parceiros; exige pedir acesso ao CIRCL |
| RIPEstat (ASN, prefixo, país) | Dono, país e rede do IP | **Em espera.** Os termos proíbem uso comercial e redistribuição sem autorização escrita da RIPE NCC (stat@ripe.net) e a finalidade declarada é análise e monitoramento de rede e pesquisa. Só entra com confirmação por escrito |
| RDAP/WHOIS | Dono de IP e domínio | **Fora por ora.** O banco do RIPE proíbe redistribuir e usar para marketing; Registro.br e LACNIC não puderam ser lidos |
| VirusTotal | Reputação de hash, domínio, IP e URL | **Barrada.** A API gratuita não pode ser usada em produto ou serviço comercial nem em fluxo que não envie arquivos novos. Cota 500 por dia e 4 por minuto. Termos de uso não lidos (403) |
| AbuseIPDB | Denúncias por IP | **Não confirmada.** Cota de 1.000 por dia no plano Standard; página de termos não lida (404) |
| GreyNoise | "É ruído de varredura da internet?" | **Inviável gratuita.** 50 consultas por semana e o EULA proíbe produtos derivados e repasse a terceiros |
| Shodan, Censys | Portas e serviços expostos | **Não confirmadas.** Plano gratuito, cota e termos não lidos |

**Como:** consulta **ao vivo** com cache (como `buscar_doc_oficial`), chave em `wrangler secret`, uma linha por fonte no catálogo (modo `ao_vivo`). `ioc_consultar` e `/v1/ioc` passam a mostrar cada fonte lado a lado, com a **contagem de fontes que concordam** (sem veredito). Cada consulta falha sozinha sem derrubar as outras.

**Portão:** limite de cota por fonte tratado em código (para não esgotar a cota gratuita), e licença registrada. **Pronto quando:** um IP consultado devolve abuse.ch, DROP e ao menos duas fontes novas, cada uma com data.

## Fase 2: vulnerabilidade com contexto de exploração

Situação em 26/11/2026, depois da leitura de licenças:

| Entrega | Situação |
|---|---|
| Metasploit (módulos) | **Feito.** BSD de 3 cláusulas. Índice (CVE, nome, tipo, data, link) em tabela `exploits`, ligado ao `cve_consultar` |
| Nuclei (templates de CVE) | **Feito.** MIT. Mesmo molde; o template só verifica a falha, não explora |
| Exploit-DB | **Fora.** Termos do site proíbem copiar o serviço; só entra com autorização da OffSec |
| PoC-in-GitHub | **Fora.** Sem índice único (um JSON por CVE) e o repositório avisa que há malware |
| Avisos de fabricante: Palo Alto e Ivanti | **Fora por ora.** Há RSS público, mas os termos de uso (lidos em 26/11/2026) limitam o uso a "personal, non-commercial internal use" e proíbem reproduzir o conteúdo; nenhum fala de RSS nem de coleta automatizada. O Ivanti traz os CVEs só no corpo do item, não no título. Entram se o jurídico entender que título, data, CVE e link não são "reprodução", ou com autorização do fabricante |
| Avisos de fabricante: Cisco, Broadcom/VMware, Citrix, SonicWall | **Sem feed verificado.** Cisco só mostra CVRF e API openVuln (não lidos); Broadcom exige login; Citrix e SonicWall são páginas em JavaScript |
| OSV e GitHub Advisories | **Adiado.** GitHub Advisory DB é CC-BY 4.0, mas a licença do OSV varia por fonte (há CC-BY-NC-ND) e o dump completo não cabe no Worker. Interessa mais a bibliotecas que a infraestrutura |
| CPE via NVD (M2) | **Pendente.** O NVD limita a taxa |

## Fase 3: detecção

Situação em 27/11/2026:

| Fonte | Situação |
|---|---|
| Sigma (SigmaHQ) | **Feito** (`sigma_regra`). Licença DRL 1.1: uso comercial permitido, com o autor de cada regra. Base embutida de 3.782 regras, só metadados |
| Wazuh | **Já existia** (`wazuh_regra`). O MITRE liga as duas: a mesma técnica, T1059.001, serve nas duas ferramentas |
| YARA: signature-base (Neo23x0) | **Adiado.** DRL 1.1, mas "exceto as regras que indicam outra licença no campo `license`" e as versões até 2021 eram CC BY-NC; exige filtrar regra por regra. Índice não lido |
| YARA: Yara-Rules | **Fora.** GPL-2.0 (copyleft); o texto da licença não pôde ser lido |
| Suricata ET Open | **Fora por ora.** Licença não confirmada (o `LICENSE` da pasta não foi lido); o pacote tem 5 MB e o índice de descrições 26 MB |

## Fase 4: Brasil e marca

| Fonte | Situação |
|---|---|
| CERT.br | **Fora.** O site é CC BY-NC-ND 4.0 (não comercial, sem derivados). Existe um RSS (`cert.br/rss/certbr-rss.xml`, não lido). Só com autorização do NIC.br |
| CTIR Gov | **Não verificado.** A página estava em manutenção em 27/11/2026; tentar de novo |
| crt.sh (domínios parecidos) | **Adiado.** A API JSON responde, mas a política de uso não foi lida e uma consulta por domínio devolve mais de 600 KB |
| Certspotter (SSLMate) | **Fora.** Plano gratuito de 100 consultas por hora e 10 de domínio completo por hora, e a busca é por domínio, não por palavra parecida; termos não lidos |

## Fase 5: atores e campanhas

| Fonte | Situação |
|---|---|
| MISP galaxy (threat-actor) | **Feito** (`ator_ameaca`). CC0 ou BSD pelo README (o `LICENSE.md` deu 503). 1.132 grupos, só metadados e links; ligado ao grupo do ATT&CK |
| ETDA Threat Group Cards | **Fora.** CC BY-NC-SA 4.0 |

## Transversal (junto de cada fase)

- Linha no catálogo (`fontes`) e migração por fonte; entrada em `saude_fontes` e na aba Fontes.
- Coluna **Conhecimento ou Dado** na aba Fontes.
- Testes: banco SQLite, `fetch` simulado estrito, e uma checagem real contra a API quando houver chave.
- Documentação: `fontes.md`, `mcp.md`, `docs.html`, `llms.txt`, o snippet do agente e `lacunas.md`.
- Agente do ness.work: um parágrafo curto no `agent.md` (cabe no limite de 8.000 caracteres da instrução) e o detalhe na skill `conectores-ness`.

## Ordem e dependências

```
Fase 0 (canal /v1) ──► Fase 1 (reputação) ──► Fase 2 (exploit e avisos)
                                  └──────────► Fase 3 (detecção) ──► Fase 5 (atores)
                          Fase 4 (Brasil e marca) é independente
```

A Fase 0 vem primeiro porque o dado só vale se o ness.OS conseguir puxá-lo. A 1 é a de maior ganho para o analista. As fases 3 e 5 dependem do ATT&CK, que já existe.

## Riscos

- **Cota gratuita:** VirusTotal, AbuseIPDB, GreyNoise e Shodan limitam o uso. Sem cuidado, uma consulta em lote de 500 indicadores esgota a cota do dia. Mitigação: cache longo, limite por chave e resposta parcial com aviso.
- **Licença:** uma fonte barrada no portão cai do plano sem atrasar as outras.
- **Volume:** regras do Suricata e do Sigma podem estourar o tamanho do Worker; por isso o Suricata vai em tabela.
- **Dado de cliente:** domínios e indicadores enviados pelo ness.OS não são gravados nem entram em log.

## O que não faremos

Pontuação de risco própria, bloqueio automático, qualquer escrita em sistema externo, e conhecimento interno da ness. (playbooks, aprendizado de incidente), que é do ness.OS ou vira pacote.

## Decisões que preciso do dono

1. Aprovar a Fase 0 como primeiro passo.
2. Quais fontes da Fase 1 valem o esforço, dado o limite das cotas gratuitas.
3. Se o ness.OS já consome o `/v1/cve` hoje, e em que formato quer receber `/v1/ioc` e `/v1/novidades`.

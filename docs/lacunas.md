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
| 3.1 | STRM 2026.3 extraído de PDF (pdfplumber); o script `scripts/conferir-strm.mjs` está pronto (ver `operacao.md`), falta rodá-lo contra as planilhas 2026.1 e conferir a amostra à mão | Linha perdida ou trocada na extração passa despercebida até a conferência rodar | Rodar o script e registrar o resultado aqui | P1 |
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
| 5.1 | Sem OAuth no `/mcp` | claude.ai na web e ChatGPT não conectam (só aceitam OAuth ou sem autenticação) | OAuth 2.1 com Cloudflare Access como provedor, mapeando o usuário para uma chave | P2 |
| 5.4 | Validade de chave: feita no código (migração 0007, `dias` ou `expira_em`, aviso na lista); falta aplicar a migração e fazer o deploy | Até lá, chave esquecida continua válida | Aplicar a 0007 e o deploy; escolher a validade ao gerar as próximas chaves | P3 |
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
4. 5.1 (OAuth), antes de abrir a base a mais clientes.

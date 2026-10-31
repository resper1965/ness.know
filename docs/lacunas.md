# Lacunas conhecidas

Levantamento de 31/10/2026: o que falta, o que limita o uso e o que está pendente de operação.

- **Prioridade:**
  - **P1** bloqueia uso ou deixa produção diferente do código;
  - **P2** limita um caso de uso real;
  - **P3** melhoria.
- **Situação:** ao fechar uma lacuna, apague a linha e registre a mudança no documento de referência (README, `arquitetura.md`, `mcp.md`).

## 1. Produção atrás do código (P1)

O código do `main` já tem o SCF 2026.3 e a ferramenta `detalhar_controle`, mas a produção ainda não.

| # | Lacuna | Efeito | Próximo passo |
| --- | --- | --- | --- |
| 1.1 | Migração `0004_scf_catalogo.sql` não aplicada | `detalhar_controle` falha em produção | `npx wrangler d1 migrations apply ness-know --remote` |
| 1.2 | Catálogo e STRM do SCF 2026.3 não carregados (produção está com o STRM 2026.1, sem catálogo) | Ids de controle de `correlacionar` e `cobertura` divergem do catálogo novo | `d1 execute` de `scf-catalogo-2026-3.sql`, depois `strm-2026-3.sql` (nessa ordem, mesma versão; ver `operacao.md`) |
| 1.3 | Worker não publicado com o código atual | Ferramentas e textos novos fora do ar | `npx wrangler deploy` depois de 1.1 e 1.2 |
| 1.4 | Pacote `forense-digital` (ISO/IEC 27037) não carregado | Pacote listado na documentação sem conteúdo | `node scripts/carregar-pacote.mjs <pasta>\forense-digital https://know.ness.com.br` |
| 1.5 | Ferramentas de correspondência nunca testadas em produção | Erros de dados (extração dos PDFs) só aparecem no uso | Chave de teste com **Correspondência entre frameworks** e **Segurança e conformidade**. Conferir Anexo A → TX-RAMP L2 (21 / 110 / 92), Anexo A → SOC 2 (50 / 293 / 56) e `detalhar_controle MON-02` |
| 1.6 | Chave "faBRAINzio" não emitida | O faBRAINzio publicado não enxerga pacotes | Gerar com Segurança e conformidade, Setor elétrico e Gestão de serviços de TI; gravar como `NESS_KNOW_TOKEN` no faBRAINzio |

## 2. Conteúdo da base

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 2.1 | Setor elétrico só tem a REN 964/2021; faltam os documentos do ONS (Procedimentos de Rede, RO-CB.BR.01) | O faBRAINzio (Alupar) não responde sobre o ONS | Carregar no pacote `setor-eletrico` | P2 |
| 2.2 | Regulação financeira (BCB 538/2025, CMN 5.274/2025) não está na base | Ofertas de conformidade financeira sem fonte | Pacote novo ou acréscimo; não há STRM para elas | P2 |
| 2.3 | Normas presentes no STRM sem o texto na base (IEC 62443, NIST 800-53, 800-82, NERC CIP, LGPD, PCI DSS, SOC 2, DORA, NIS2…) | `correlacionar` e `cobertura` devolvem o item, mas `buscar_conhecimento` não traz o texto para confirmar | Priorizar por uso: LGPD, IEC 62443 e NIST 800-53 | P2 |
| 2.4 | REN 964, ISO 20000-1 e ITIL não estão no STRM do SCF | Não há correspondência automática para esses três | Mapeamento próprio (tabela `strm` com framework da ness.), ou só busca textual | P3 |
| 2.5 | Recarregar uma norma substitui a anterior, sem histórico de versões | Não dá para consultar a versão vigente numa data passada | Guardar versões e marcar a vigente, se algum cliente pedir | P3 |
| 2.6 | PDF sem camada de texto falha na carga | Normas escaneadas não entram | OCR antes da carga; o serviço não faz OCR | P3 |

## 3. Correspondência entre frameworks (SCF)

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 3.1 | STRM 2026.3 extraído de PDF (pdfplumber), sem conferência automática contra outra fonte | Linha perdida ou trocada na extração passa despercebida | Comparar contagens por framework com o 2026.1 (planilhas) e amostrar 3 frameworks à mão | P1 |
| 3.2 | `cobertura` aceita uma única origem | Quem implementou ISO 27001 **e** NIST CSF precisa somar à mão | Aceitar várias origens (`de` como lista de pares framework × itens) | P2 |
| 3.3 | O pacote `scf-strm` é tudo ou nada por chave | Não dá para liberar só alguns frameworks a um cliente | Restrição por framework na chave, como já existe por norma | P3 |
| 3.4 | Anexo A da ISO 27001 não existe como framework no SCF | Usuário precisa saber que é a ISO 27002 | Já tratado na mensagem de erro; documentar nas skills | P3 |
| 3.5 | Item numérico lido como a célula exibe | Uma versão futura com `1.10` gravado como número colidiria com `1.1` | Rever a cada nova versão em planilha (anotado em `scripts/strm.mjs`) | P3 |
| 3.6 | Resultado de `cobertura` segue a granularidade do SCF (subcontrole só conta se ligado ao mesmo subcontrole) | Lacunas superestimadas em alguns itens | Explicar no resultado (já em `mcp.md`) e confirmar no texto da norma | P3 |

## 4. Skills

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 4.1 | Nenhuma skill implementada; o [plano](skills-plano.md) é proposta | O agente usa a base sem método: cita mal, busca uma vez, entrega prosa | Onda 1 (`consultando-normas`, `correlacionando-controles`, `avaliando-lacunas`, `avaliando-mudanca`), com teste de linha de base antes de cada uma | P2 |
| 4.2 | O plano não prevê skill para os pacotes novos (62304, 27037, 31000 como norma própria) nem para as ferramentas `cobertura` e `detalhar_controle` | Skills `avaliando-lacunas` e `preparando-auditoria` deixam as ferramentas de fora | Revisar o plano incluindo essas ferramentas e pacotes | P2 |
| 4.3 | Não há forma de entrega definida (arquivo `SKILL.md` em repositório, `prompts` do MCP, ou instruções do pacote) | Cada cliente (Claude Code, faBRAINzio, ness.brain) recebe de um jeito | Decidir: recomendação é publicar como `prompts` do MCP, filtrados pela chave | P2 |

## 5. Acesso e segurança

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 5.1 | Sem OAuth no `/mcp` | claude.ai na web e ChatGPT não conectam (só aceitam OAuth ou sem autenticação) | OAuth 2.1 com Cloudflare Access como provedor, mapeando o usuário para uma chave | P2 |
| 5.2 | Sem limite de requisições por chave | Uma chave vazada ou um agente em laço consome a cota de Workers AI e Vectorize | Rate Limiting da Cloudflare em `/mcp` | P2 |
| 5.3 | Sem registro de consultas por chave (só `usado_em`) | Não dá para saber o que cada agente consulta nem auditar uso indevido | Tabela de uso com chave, ferramenta, horário e contagem, sem o texto da consulta | P3 |
| 5.4 | Chaves não expiram | Chave esquecida continua válida | Validade opcional na criação, com aviso na interface | P3 |
| 5.5 | Mudar o que uma chave enxerga exige revogar e gerar outra | Troca de chave em todos os agentes que a usam | Aceitável; rever se houver muitos clientes | P3 |

## 6. Busca

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 6.1 | Avaliação com 36 perguntas, antes dos pacotes novos e do SCF | Não se sabe a qualidade em 62304, 27037, 31000 nem em perguntas de correspondência | Ampliar o gabarito por pacote e rodar `avaliar-busca.mjs` | P2 |
| 6.2 | `BUSCA_MINIMO` (0,4) escolhido sem calibração | Trechos irrelevantes passam ou relevantes caem | Calibrar com as notas que `avaliar-busca.mjs` mostra | P3 |
| 6.3 | Rerank desligado (na avaliação de 30/10, o 1º lugar ficou igual, 67%, e o MRR caiu de 0,77 para 0,75) | — | Reavaliar com o gabarito ampliado | P3 |

## 7. Documentação e operação

| # | Lacuna | Efeito | Próximo passo | Prioridade |
| --- | --- | --- | --- | --- |
| 7.1 | Sem ambiente de teste separado; carga e migração vão direto à produção | Erro de carga afeta os agentes em uso | Aceitável no volume atual; usar `--local` para ensaiar SQL grande | P3 |
| 7.2 | Cargas grandes do SCF (8 e 11 MB) deixam o `/mcp` lento | Respostas lentas durante a carga | Rodar fora do horário comercial (já em `operacao.md`) | P3 |
| 7.3 | Deploy e cargas dependem de uma pessoa no computador | Atualização para quando o dono está fora | Token de API com escopo de Workers e D1 guardado no cofre, ou Workers Builds no push | P3 |

## Ordem recomendada

1. Seção 1 inteira, na ordem 1.1 → 1.2 → 1.3 → 1.5 → 1.6 → 1.4.
2. 3.1 (conferência da extração), antes de qualquer cliente usar `cobertura` num relatório.
3. 2.1 (ONS), para o faBRAINzio.
4. 4.1 e 4.3 (primeira onda de skills e forma de entrega).
5. 5.2 e 5.1 (limite de requisições e OAuth), antes de abrir a base a mais clientes.

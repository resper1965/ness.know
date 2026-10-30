# Plano de skills do ness.know

Data: 30/10/2026. Situação: proposta, nada implementado.

## Problema que as skills resolvem

Hoje o agente recebe trechos das normas e decide sozinho o que fazer com eles. Sem orientação, ele erra de formas previsíveis:

- **Citação:** cita cláusula sem número ou com a numeração de outra versão (por exemplo, 27001:2013 em vez de 2022) e mistura texto da norma com opinião sem separar os dois.
- **Busca:** faz uma busca genérica e responde com o primeiro trecho, sem procurar a cláusula que de fato rege o caso, nem os controles correlatos em outros frameworks.
- **Formato:** entrega prosa onde o uso pede um artefato (matriz de lacunas, checklist de auditoria, registro de mudança) e não deixa rastro (`ref`) para conferência.

Uma skill é um procedimento que diz **quais buscas fazer, em que ordem, e em que formato entregar**, sempre com as normas da base como fonte. Esses erros são as hipóteses a confirmar no teste de base, antes de cada skill ser escrita (ver Validação).

## Princípios

1. **Toda skill parte da base.** A primeira ação é `listar_pacotes`; toda afirmação normativa vem de `buscar_conhecimento` e leva documento, versão, seção e `ref`. O que não estiver na base é dito como lacuna, nunca preenchido de memória.
2. **Separação explícita.** O texto da norma (**Requisito**) fica separado da leitura do agente (**Interpretação**) e da recomendação.
3. **Saída é um artefato utilizável:** tabela, checklist ou registro com colunas fixas, pronto para colar num relatório.
4. **A skill depende de normas, e a chave decide.** Cada skill declara as normas de que precisa. A chave que não libera essas normas não vê a skill.
5. **Curtas.** Até cerca de 500 palavras cada; o conhecimento fica na base, a skill só traz o método.

## Catálogo proposto

Em ordem de prioridade, pelo uso esperado na ness. e nos clientes (faBRAINzio, n.posture, n.iso, niso).

| # | Skill | Quando usar | Normas da base | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `consultando-normas` | Qualquer pergunta sobre o que uma norma exige | todas | Resposta com Requisito × Interpretação e citação por trecho |
| 2 | `correlacionando-controles` | "Qual controle do NIST/CIS equivale ao A.8.16?", montar crosswalk entre frameworks | ISO 27001, NIST CSF 2.0, CIS v8.1, SCF | Matriz de correspondência com grau (equivalente, parcial, sem par) e a fonte de cada linha |
| 3 | `avaliando-lacunas` | Comparar a situação atual de um cliente com um conjunto de cláusulas | ISO 27001, 27701, 42001, 20000-1, CIS (IG1 a IG3) | Matriz requisito × situação × evidência × lacuna × prioridade |
| 4 | `preparando-auditoria` | Planejar ou conduzir auditoria interna ou de terceira parte sobre cláusulas escolhidas | ISO 27001, 27701, 20000-1, 42001 | Roteiro por cláusula: perguntas, evidências esperadas, amostragem e critério de não conformidade |
| 5 | `avaliando-mudanca` | Abrir, classificar ou aprovar uma GMUD | ITIL 4 (habilitação de mudanças), ISO 20000-1 (8.5.1), ISO 27001 (A.8.32) | Registro de mudança: tipo (padrão, normal, emergencial), risco, plano de retorno, testes e checklist do CAB |
| 6 | `respondendo-incidente` | Incidente de segurança em curso ou revisão pós-incidente | NIST SP 800-61r3, ISO 27001 (A.5.24 a A.5.28), CIS 17 | Checklist por fase (preparar, detectar, conter, erradicar, recuperar, aprender) e relatório pós-incidente |
| 7 | `verificando-ren-964` | Obrigações de cibersegurança de agentes do setor elétrico (Alupar, ONS) | ANEEL REN 964/2021, com ponte para NIST CSF e ISO 27001 | Checklist de obrigações com artigo, situação e controle técnico correspondente |
| 8 | `declarando-aplicabilidade` | Montar ou revisar a SoA do Anexo A (2022) | ISO 27001 | Os 93 controles com aplica/não aplica, justificativa ligada a risco ou requisito e situação de implementação |
| 9 | `analisando-riscos` | Identificar, avaliar e tratar riscos num escopo | ISO 31000, ISO 27001 (6.1), NIST CSF (GV.RM) | Registro de riscos com critérios declarados, nível inerente e residual, e tratamento ligado a controles |
| 10 | `avaliando-ia` | Uso ou desenvolvimento de sistema de IA: impacto e governança | ISO/IEC 42001 | Avaliação de impacto e lacunas do sistema de gestão de IA, com os controles do Anexo A da 42001 |
| 11 | `avaliando-nuvem` | Avaliar provedor de nuvem ou SaaS (terceiros, Ativu, n.tprm) | ISO 27017, 27018, 27001 | Questionário ao fornecedor e parecer com lacunas, por controle |
| 12 | `redigindo-politica` | Escrever ou revisar política, norma interna ou procedimento | as normas que o tema exigir | Minuta com matriz de rastreabilidade: seção da política × cláusula atendida |

### Ondas

| Onda | Skills | Por quê |
| --- | --- | --- |
| 1 | 1, 2, 3, 5 | Uso diário. A 1 é a base das outras. A 2 alimenta o n.posture. A 3 serve a toda proposta e todo assessment. A 5 atende a demanda de GMUD do Fabrizio |
| 2 | 4, 6, 7, 8 | Auditoria e operação, e a REN 964 para a Alupar |
| 3 | 9, 10, 11, 12 | Programas completos (SGSI, IA, terceiros) e documentação |

## Formato de cada skill

Cada skill fica no repositório, separada do código:

```
skills/avaliando-mudanca/SKILL.md
```

```markdown
---
name: avaliando-mudanca
description: Use quando alguém abre, classifica, avalia risco ou aprova uma mudança (GMUD, RFC, CAB), ou pergunta se uma mudança pode ser padrão
normas:
  gestao-servicos-ti: ["ITIL 4 Foundation"]
  seguranca-conformidade: ["ABNT NBR ISO/IEC 20000-1:2020", "ABNT NBR ISO/IEC 27001:2022"]
---

# Avaliando mudança
## Buscas obrigatórias (em ordem)
## Classificação
## Registro de mudança (formato de saída)
## Erros comuns
```

O campo `normas` liga a skill aos títulos da base. Os títulos acima são ilustrativos e precisam bater com os documentos carregados, porque a carga recusa título inexistente. O campo também diz se a chave enxerga a skill: só a enxerga quem tem todas as normas listadas.

## Como os agentes recebem as skills

| Canal | Como funciona | Para quem |
| --- | --- | --- |
| Prompts do MCP (`prompts/list`, `prompts/get`) | Cada skill liberada vira um prompt com argumentos (por exemplo, `escopo` e `normas`). O agente ou a pessoa invoca pelo nome | Claude Code, Claude Desktop, VS Code e outros clientes com suporte a prompts |
| Ferramenta `obter_skill(nome)` e lista em `listar_pacotes` | Devolve o procedimento como texto | Clientes que só usam ferramentas (Codex, Cursor, faBRAINzio, ness.brain) |
| Download do `SKILL.md` na interface | Aba nova **Skills**, filtrada pela chave | Quem quer a skill instalada localmente no Claude Code |

Na interface, a aba **Skills** lista cada skill com as normas de que depende e quais chaves a enxergam. Na criação da chave, as skills disponíveis aparecem conforme as normas marcadas.

Mudanças no servidor:

- tabela `skills` (nome, descrição, normas JSON, corpo, versão), carregada por `scripts/carregar-skills.mjs` a partir de `skills/`;
- `prompts/list`, `prompts/get` e `obter_skill` no MCP, com o mesmo filtro por chave;
- a aba **Skills**.

## Validação (antes de publicar cada skill)

Cada skill segue o ciclo de teste de skills: primeiro o comportamento sem a skill, depois com ela.

1. **Linha de base.** Um agente sem a skill, mas com o MCP do ness.know, recebe 3 casos reais do tema. Exemplo para a 5: "trocar o firmware dos switches do core no sábado". Registram-se as falhas: cláusula errada ou inventada, ausência de `ref`, formato inútil, busca única.
2. **Escrita.** A skill corrige exatamente essas falhas, e nada além delas.
3. **Verificação.** Os mesmos casos, com a skill. Critérios:
   - toda afirmação normativa com `ref` que confere;
   - nenhuma cláusula fora da base;
   - saída no formato definido;
   - lacunas declaradas.
4. **Ajuste.** Falha nova vira regra explícita, e os casos rodam de novo.

Os casos de teste ficam em `skills/<nome>/casos.md`, para repetir a cada mudança da base.

## Decisões em aberto

1. **Ordem da primeira onda.** Recomendo começar por `consultando-normas` e `correlacionando-controles`.
2. **Skills por cliente.** Proposta: não. Uma skill específica de cliente fica no app do cliente (por exemplo, no faBRAINzio), e o ness.know guarda só método genérico sobre normas.

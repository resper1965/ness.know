# Casos de teste: avaliando-mudanca

Frente B2 do `docs/projeto-ciclo-2.md`. Rodar as 3 perguntas no faBRAINzio da Alupar (que já tem a busca prévia e a skill `consultando-normas`), primeiro **sem** a skill `avaliando-mudanca` (linha de base) e depois com ela.

Normas da base que a skill usa (títulos exatos): `ITIL 4 Foundation` (pacote `gestao-servicos-ti`); `ABNT NBR ISO/IEC 20000-1 — gestão de serviço de TI` e `ABNT NBR ISO/IEC 27001 — SGSI, requisitos` (controle 8.32, Gestão de mudanças), do pacote `seguranca-conformidade`.

## Perguntas

1. Preciso trocar o firmware dos switches do core no sábado à noite. Como devo abrir e aprovar essa mudança? (mudança normal, risco alto)
2. Posso tratar a atualização mensal de patches do Windows nos servidores como mudança padrão? (critério de mudança padrão)
3. O firewall principal caiu e preciso aplicar uma correção agora, sem esperar o CAB. Como registro essa mudança? (mudança emergencial)

## Critérios (1 ponto cada, por caso)

- Classifica o tipo certo: normal (1), padrão com critério de pré-autorização (2), emergencial com aprovação acelerada e revisão depois (3).
- Entrega um registro de mudança utilizável: tipo, risco, plano de retorno, testes, aprovador (CAB ou ECAB) e janela.
- Cita documento, versão e seção da base (ITIL 4, ISO 20000-1, ISO 27001 8.32), sem cláusula inventada.
- Disse o que a base não cobre, em vez de preencher de memória.
- A resposta veio de uma busca (o `uso_chaves` ganha um `buscar_conhecimento` por pergunta e a auditoria lista fontes).

## Resultados

### Linha de base, sem a skill: 06/11/2026, faBRAINzio (Alupar), já com a busca prévia e a `consultando-normas`

Conferência no servidor: `uso_chaves` ganhou 3 `buscar_conhecimento` (uma por pergunta, pela busca prévia) e a auditoria registra fontes nas três.

| Caso | Resultado | Pontos | Falhas observadas |
| --- | --- | --- | --- |
| 1. Firmware dos switches | Requisito (ISO 20000-1 8.5.1.3, correto) e Leitura em prosa: "abrir uma GMUD" com plano de testes e de rollback e "autoridade de mudança" | 2 de 5 (fonte e busca) | Não diz o tipo (normal) nem o risco (alto, rede core). Não monta o registro: aprovador genérico, sem campos fixos. Não cita ISO 27001 8.32 nem ITIL. Não admite o que a base não cobre. A lista "Fontes" mostra o que foi recuperado, inclusive Quantum Security e 27701 A.3.25, que não sustentam a resposta |
| 2. Patches como mudança padrão | "Sim, se tiver procedimento documentado, testado e aprovado antes", com a definição de mudança padrão (pré-autorizada, baixo risco) | 2 de 5 (tipo e busca) | Cita "ITIL 4 Foundation, 5.2.4 Change control", mas o ITIL **não está** entre as fontes recuperadas (CIS 7, 4, SCF CDPAS e ISO 27017 12.1.2): a citação não vem de trecho. Sem registro, sem plano de retorno em formato fixo |
| 3. Mudança emergencial | Tipo certo (emergencial, aprovação acelerada, registro e revisão depois) | 2 de 5 (tipo e busca) | Cita "ITIL 4 Foundation, 5.2.4 Change control", mas a seção recuperada foi "A.1 A user needs an incident to be resolved": a seção citada não foi recuperada. Aprovador genérico, sem registro estruturado |

**Causa das citações sem fonte:** o texto das instruções do pacote `gestao-servicos-ti` traz o exemplo `"ITIL 4 Foundation, 5.2.4 Change control"`, e o modelo o repete mesmo quando o ITIL não foi recuperado.

**Retrieval:** a busca com a pergunta crua não trouxe ITIL 4 (casos 1 e 2) nem ISO 27001 8.32 (nenhum caso). As normas existem na base: o que falta é a busca de continuação com os termos certos.

**Falhas que a skill ataca:** (1) classificar o tipo e o risco primeiro; (2) buscas de continuação com os termos das normas; (3) não citar seção que não apareceu nos trechos, avisando que o exemplo das instruções é formato e não fonte; (4) entregar o Registro de mudança com campos fixos.

### Com a skill: 06/11/2026 (skill carregada às 19:26 UTC; faBRAINzio com o carregamento por assunto, PR #31)

Conferência no servidor: 3 conversas (19:27 a 19:28 UTC), todas "ok; busca prévia" com as mesmas fontes da linha de base; `buscar_conhecimento` +3 (só as buscas prévias: o modelo **não fez** as buscas de continuação que a skill pede).

| Caso | Resultado | Pontos (antes) | Observações |
| --- | --- | --- | --- |
| 1. Firmware dos switches | Diz o tipo (**mudança normal**, "ativo crítico do core, não é rotina pré-aprovada"); lista plano de rollback, de testes, aprovação (CAB) e comunicação; cita ISO 20000-1 8.5.1.3 | 3,5 de 5 (2) | Não monta o registro com os 9 campos (falta risco explícito, janela, revisão pós-implantação) e não escreve "definir pela organização". O formato Requisito e Leitura da `consultando-normas` competiu com o Registro |
| 2. Patches como mudança padrão | Resposta certa (sim, com procedimento documentado), igual à linha de base | 2 de 5 (2) | **Sem mudança:** ainda cita "ITIL 4 Foundation, 5.2.4 Change control" sem o ITIL estar entre as fontes recuperadas; a regra "não cite o exemplo" da skill foi ignorada |
| 3. Mudança emergencial | **Registro de mudança completo** com os 9 campos da skill, tipo Emergencial e risco Alto justificado, "definir pela organização" nos planos de testes e de retorno | 4,5 de 5 (2) | Não cita a norma no texto (sem citação inventada: o "5.2.4" sumiu). A lista de fontes continua mostrando CIS e ITIL "A.1", fontes que a busca trouxe e a resposta não usou |

Total: de 6 para cerca de 10 de 15 pontos. A skill funciona quando a pergunta pede o registro (caso 3) e melhora a classificação (caso 1). Não resolveu o caso 2 e não fez o modelo buscar de novo.

**O que a skill não resolve, e o que fazer:**
1. **Citação "5.2.4 Change control" sem fonte (caso 2):** a causa é o exemplo nas instruções do pacote `gestao-servicos-ti`, que o modelo repete. Corrigir o texto do pacote (dado, não código): trocar o exemplo por uma regra "cite a seção só se ela aparecer nos trechos recebidos".
2. **Buscas de continuação ignoradas pelo modelo:** o modelo pequeno não as faz sozinho (nenhuma `buscar_conhecimento` além da prévia). A saída é o código fazê-las: a skill declara os termos (`buscas:`) e a busca prévia do faBRAINzio as executa e junta os trechos. Assim ITIL 4 e ISO 27001 8.32 entram no prompt.
3. **Lista de fontes mostra o recuperado, não o usado:** melhoria separada na interface do faBRAINzio.

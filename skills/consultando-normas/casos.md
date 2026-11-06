# Casos de teste: consultando-normas

Rodar as 3 perguntas no agente com a base conectada, primeiro sem a skill (linha de base) e depois com ela. Use uma organização que tenha os pacotes dos casos: no faBRAINzio da Alupar são `seguranca-conformidade`, `setor-eletrico` e `gestao-servicos-ti`.

1. O que a ISO 27001:2022 exige sobre registro de eventos (logs)? Cite a cláusula. (esperado: A.8.15)
2. O que a REN ANEEL 964/2021 exige sobre a política de segurança cibernética? Cite o artigo. (pacote `setor-eletrico`)
3. O que a ISO 27001 exige sobre segurança de drones? (a base não tem a resposta; o agente deve dizer que não encontrou, o que buscou e que pode não estar liberada)

O caso 2 original perguntava sobre o Marco Civil. Ele está no pacote `legislacao-digital`, que a Alupar não tem; a resposta "não encontrei" estava certa para aquela organização, então o caso não media o agente. Trocado pela REN 964.

## Critérios (1 ponto cada, por caso)

- Toda afirmação normativa traz documento, versão e seção (no faBRAINzio o modelo não recebe o `ref`; nos agentes via MCP, o `ref` também deve conferir).
- Nenhuma cláusula ou artigo fora da base.
- Requisito (texto da norma) separado de Leitura (interpretação).
- Quando a base não responde: diz o que buscou e que a norma pode não estar liberada.
- A resposta veio de uma busca (no faBRAINzio: o `uso_chaves` ganha um `buscar_conhecimento` e a auditoria lista fontes).

## Resultados

### Linha de base, sem a skill: 06/11/2026, faBRAINzio (Alupar)

| Caso | Resultado | Falhas observadas |
| --- | --- | --- |
| 1. Logs na 27001 | Citou A.8.15 (Logging), que está certo, com propósito, o que implementar, evidência e erros comuns | Nenhuma busca: `buscar_conhecimento` não aumentou no `uso_chaves` e a auditoria registrou `fontes: []`. Sem documento, versão e seção da base. Sem separar Requisito de Leitura. "Erros comuns" e "evidência" não vieram de trecho |
| 2. Marco Civil (caso original) | "Não encontrei isso." | Caso inválido para a Alupar (pacote não liberado). Substituído pela REN 964 |
| 3. Drones na 27001 | "Não encontrei isso." | Acertou ao não inventar, mas sem dizer o que buscou nem que a norma pode não estar liberada; também sem busca registrada |

Falha principal: o agente responde de memória, sem buscar e sem citar fonte da base. A skill ataca isso no passo 1.

### Com a skill

| Data | Caso 1 | Caso 2 | Caso 3 | Observações |
| --- | --- | --- | --- | --- |
| (pendente: carregar a skill e repetir) | | | | |

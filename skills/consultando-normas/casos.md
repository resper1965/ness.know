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

### Com a skill, 06/11/2026 (skill carregada às 14:53 UTC), faBRAINzio (Alupar)

| Caso | Resultado | Pontos |
| --- | --- | --- |
| 1. Logs na 27001 | Respondeu em **Requisito** (controles 8.15, 8.16 e 8.17, cada um com a norma e a versão) e **Leitura**, com 6 fontes (27001 8.15 versão 2022 + Em1:2024, 27018 12.4.2, 27017 12.4, 27701 B.3.25 e outras). `uso_chaves`: +1 `buscar_conhecimento`; auditoria com fontes. As referências 8.16 e 8.17 existem no texto da 27001 carregado (4 e 3 trechos) | 4 de 4 (antes: 0 de 4) |
| 2. REN 964 | Não rodado | |
| 2b. Marco Civil, pergunta feita pelo dono ("quais as penas previstas pelo marco da internet") | "Não encontrei isso. Busquei por "Marco Civil da Internet", "penas", "sanções" e "Lei 12.965" e não localizei informações no conteúdo liberado para esta organização." Resposta certa (o pacote não está liberado à Alupar) e diz o que buscou | Lacuna declarada: sim. **Alerta:** o `uso_chaves` não registrou nenhum `buscar_conhecimento` para essa conversa, então a afirmação "Busquei por..." não bate com o servidor. Possível busca alegada e não feita |
| 3. Drones na 27001 | Não rodado | |

Conclusão provisória: a skill resolveu a falha principal no caso 1 (agora busca, cita e separa Requisito de Leitura). Falta rodar os casos 2 e 3 e investigar o alerta do caso 2b: o modelo pequeno pode dizer que buscou sem ter chamado a ferramenta. Se se repetir, reforçar no passo 1 ("a ferramenta tem de ser chamada; não diga que buscou se não chamou") e conferir sempre contra o `uso_chaves`.

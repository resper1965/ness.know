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

Conferência no servidor: `uso_chaves` da chave `faBRAINzio` (ferramenta `buscar_conhecimento`) e `audit_log` do faBRAINzio (fontes por conversa). Das 4 conversas, só a primeira consultou a base.

| Pergunta | Resultado | Busca no servidor | Pontos |
| --- | --- | --- | --- |
| 1. Logs na 27001 | **Requisito** (8.15, 8.16, 8.17 com norma e versão) e **Leitura**, com 6 fontes (27001 8.15 versão 2022 + Em1:2024, 27018 12.4.2, 27017 12.4, 27701 B.3.25...). 8.16 e 8.17 existem no texto carregado da 27001 | Sim (+1 `buscar_conhecimento`, fontes na auditoria) | 4 de 4 (antes: 0 de 4) |
| 2b. Marco Civil ("quais as penas previstas pelo marco da internet"; pacote não liberado à Alupar) | "Não encontrei isso. Busquei por "Marco Civil da Internet", "penas", "sanções" e "Lei 12.965"..." | **Não**: nenhuma busca registrada, mas a resposta diz que buscou | Resposta certa, mas afirma uma busca que não fez |
| GMUD ("como é feita uma gmud?") | **Requisito** e **Leitura** em 5 passos, citando "ITIL 4 Foundation, 5.2.4 Change control" | **Não**, e `fontes: []` | Formato adotado; fonte não veio de busca |
| 2. REN 964 (art. sobre a política de segurança cibernética) | Cita "REN ANEEL 964/2021, Art. 5º, II" para "política aprovada pela alta administração" | **Não**, e `fontes: []` | **Citação errada**: no texto da base, o Art. 5º, II trata da compatibilidade com a sensibilidade dos dados; a aprovação pelo Conselho de Administração é o inciso VI |
| 3. Drones na 27001 | Não rodado | | |

## Conclusão (06/11/2026)

A skill melhorou o **formato** em todas as respostas (Requisito e Leitura, normas citadas), mas **não garante a busca**: 3 de 4 conversas responderam sem chamar `buscar_conhecimento`, e uma delas citou um artigo errado com ar de certeza e outra disse que tinha buscado sem ter buscado. O modelo pequeno do faBRAINzio decide sozinho se chama a ferramenta, e um texto no prompt não basta.

Próximo passo recomendado (decisão de desenho, fora desta skill): no faBRAINzio, o código faz a busca antes do modelo (recuperação prévia do trecho para a pergunta) e entrega os trechos já no prompt, na linha "o código calcula, o modelo redige". Assim a citação sempre vem de trecho real, e a skill só cuida do formato. Reforçar o texto da skill ("não diga que buscou se não chamou a ferramenta") é paliativo e não resolve.

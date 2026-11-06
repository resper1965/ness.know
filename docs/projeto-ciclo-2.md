# Projeto do próximo ciclo (quatro frentes)

Data: 06/11/2026. Situação: **proposta para aprovação**, nada implementado. Origem: [lacunas.md](lacunas.md) (3.1, 4.x, 5.1, 5.4, 7.x), a medição das skills em `skills/consultando-normas/casos.md` e a conferência de código de 06/11.

## Objetivo

Confiar nos dados que o agente cita, garantir que a citação vem da base, abrir o `/mcp` a mais clientes sem entregar chave e fechar as pontas de operação. Cada frente é um sub-projeto com desenho, teste e critério de aceite próprios.

## Regras que valem para as quatro

- A interface do ness.know continua só para administradores (decisão de 06/11). A visão do usuário depende da frente C.
- O código calcula, o modelo redige. O agente nunca escreve em dados externos.
- Conteúdo entra pelo app ou por `/api/admin`, nunca pelo código.
- Deploy, migração e mudanças no painel da Cloudflare são do dono; cada PR diz o passo.
- Cada frente termina num PR separado, com testes e `tsc` verdes, mesclado só com o OK do dono.

## Frente A: conferir o STRM 2026.3 (lacuna 3.1, P1)

**Problema.** `correlacionar` e `cobertura` alimentam relatórios de conformidade, e o STRM 2026.3 foi extraído de PDF sem conferência. Linha perdida ou trocada passa despercebida.

**Desenho.** `scripts/conferir-strm.mjs <pasta-das-planilhas-2026.1>`:
1. Conta itens e ligações por framework no D1 (consulta somente leitura pela API de admin) e nas planilhas 2026.1.
2. Lista frameworks que só existem num dos lados e diferenças de contagem acima de um limite.
3. Sorteia 30 linhas de 3 frameworks (ISO 27002, NIST CSF, TX-RAMP) e imprime lado a lado, para conferência à mão.
4. Sai com código 1 se algum framework comum perder mais de 2% das linhas sem explicação.

**Aceite.** Relatório com todos os frameworks comuns; as 90 linhas amostradas sem divergência; divergências de contagem explicadas (o SCF 2026.3 renumerou controles, então a comparação é por framework e por item, não por controle SCF).

**Esforço.** 1 dia. **Entrada do dono:** as planilhas SCF 2026.1 (`.xlsx`, fora do Git).

**Risco.** 2026.1 e 2026.3 diferem por desenho; contagem exata não existe. Mitigação: o limite de 2% e a amostra à mão, não igualdade.

## Frente B: busca garantida e próxima skill

**Problema.** Na medição de 06/11, 3 de 4 respostas do faBRAINzio saíram sem consultar a base, uma com artigo errado. A skill melhorou o formato, mas um texto no prompt não força a busca num modelo pequeno.

**B1. Busca prévia no faBRAINzio** (repositório faBRAINzio).
- Em `conversa`, antes do modelo, `buscarConhecimento` roda com a pergunta (limite 6) e os trechos entram no prompt como "Trechos da base", com documento, versão e seção. As ferramentas continuam disponíveis para buscas de continuação.
- Pergunta sobre chamados ou e-mail não dispara a busca prévia (decisão por palavra-chave simples e testada; na dúvida, busca).
- Custo estimado: uma chamada a mais por pergunta (o limite é 240 por minuto por chave), cerca de 2 a 3 mil tokens de contexto e menos de 1 s de latência.
- **Aceite:** repetir as perguntas de `casos.md` (logs na 27001, REN 964, GMUD, drones, Marco Civil): toda resposta com fonte da base, `uso_chaves` com uma busca por pergunta, nenhuma citação fora dos trechos recebidos, drones e Marco Civil dizendo que não encontraram.
- **Esforço:** 1 a 2 dias, com o teste de regressão das perguntas.

**B2. Skill `avaliando-mudanca`** (repositório ness.know), depois do B1.
- Mesmo método da `consultando-normas`: linha de base de 3 casos reais (GMUD de firmware, mudança padrão, mudança emergencial), skill de até 4.000 caracteres, comparação.
- Atende a demanda de GMUD do faBRAINzio. Pacotes: ITIL 4, ISO 20000-1 e ISO 27001 (A.8.32).
- **Esforço:** 1 dia, mais uma rodada de perguntas do dono.

**Risco.** A busca prévia pode trazer trecho irrelevante e o modelo usá-lo. Mitigação: nota mínima já existente (`BUSCA_MINIMO`) e a regra da skill de dizer "não encontrei" quando os trechos não respondem.

## Frente C: OAuth no `/mcp` (lacuna 5.1, P2)

**Problema.** claude.ai e ChatGPT só aceitam OAuth ou acesso aberto. O Rogério precisou editar arquivo de configuração. É também o que dá identidade ao usuário, base da autonomia sobre bases e receitas.

**Opções** (conferidas na documentação da Cloudflare em 06/11):

| | Como funciona | Prós | Contras |
| --- | --- | --- | --- |
| C1. OAuth gerenciado do Access | Um app do Access no endereço do MCP; o cliente recebe `401` com descoberta OAuth e o Access autentica o usuário | Sem servidor de autorização nosso; mesma política de login do admin | Exige mexer no painel; o `/mcp` atual é liberado do Access para a chave, então precisa de um caminho separado; falta confirmar suporte ao cadastro dinâmico do claude.ai |
| C2. Workers OAuth Provider | Um Worker autorizador (biblioteca da Cloudflare) e o MCP como servidor de recursos; o login pode usar o Access | Controle total, consentimento por cliente, funciona com o cadastro dinâmico | Mais código e um Worker novo; o consentimento é nosso |

**Recomendação.** Começar por um **spike de 1 dia** na C1, num caminho de teste: ligar o OAuth gerenciado e tentar conectar o claude.ai pela tela "Adicionar conector personalizado" (a mesma do print do dono). Funcionando, segue na C1; senão, C2.

**Identidade para permissão.** Primeira versão: tabela `acessos_oauth (email, chave_id)`, o admin vincula um e-mail a uma chave existente na aba Chaves. A chamada por OAuth herda os pacotes, as normas, a cota e a contagem de uso da chave. Revogar a chave ou desvincular corta o acesso. Sem modelo novo de permissão.

**Aceite.** claude.ai conecta sem colar chave; um e-mail sem vínculo recebe erro claro; revogação vale na requisição seguinte; o uso aparece em `uso_chaves`; testes do mapeamento e do `401`.

**Esforço.** Spike 1 dia; implementação 3 a 5 dias. **Entrada do dono:** acesso ao painel do Zero Trust (criar o app, política e OAuth gerenciado) e o OK sobre a opção.

**Riscos.** O token do OAuth precisa ser vinculado ao recurso (audiência), para não servir em outro servidor; o consentimento precisa mostrar o cliente. Os dois ficam nos critérios de teste.

## Frente D: higiene de operação (P3)

Itens pequenos, num PR só, na ordem:
1. **Chave com validade (5.4):** coluna `expira_em` opcional (migração), conferida em `clienteDe`; campo de data na criação; aviso na lista quando faltam menos de 14 dias.
2. **Limite para token inválido:** um segundo limite (`LIMITE_AUTH`) por IP antes da consulta ao banco, porque hoje cada tentativa com token errado faz uma leitura no D1.
3. **`/health` que testa o D1:** `SELECT 1`. Hoje o `/health` cai no login do Access; precisa de uma política que o libere (passo do dono no painel).
4. **Origem no `/mcp`:** se a requisição trouxer `Origin` fora de uma lista, recusa (a especificação do MCP pede isso contra requisição vinda de navegador).
5. **Backup e alerta (item 7 antigo):** confirmar o Time Travel do D1 no painel (restauração dos últimos dias, a confirmar) e registrar o procedimento em `operacao.md`; avisos da Cloudflare para erro 5xx do Worker. Sem código.

**Aceite.** Testes de 1 a 4; `operacao.md` com o procedimento de restauração de 5. **Esforço:** 1 a 2 dias.

## Ordem e prazos

| Semana | Entrega | Quem precisa agir |
| --- | --- | --- |
| 1 | A (conferência do STRM) e D (higiene); spike da C1 em paralelo | Dono: planilhas 2026.1; política do `/health`; painel do Zero Trust para o spike |
| 2 | B1 (busca prévia), depois B2 (skill de mudança) | Dono: rodar as perguntas de medição |
| 3 a 4 | C: decisão pós-spike e implementação | Dono: OK da opção; vínculo de e-mails |

A ordem põe primeiro o que é risco silencioso (A) e barato (D), depois o que corrige o que o usuário já vê (B), e por último o item maior (C). B e C são independentes e podem trocar de ordem se o dono preferir abrir clientes antes.

## Fora deste ciclo

`prompts/*` e a aba Skills (fatias 2 e 3); a visão do usuário (depende da C); as lacunas de conteúdo 2.1, 2.7, 2.8 e 2.9; a restrição do SCF por framework (3.3).

## Decisões pedidas ao dono

1. As planilhas SCF 2026.1 para a frente A.
2. Autorizar mudanças no painel do Zero Trust (spike da C1 e liberação do `/health`).
3. Confirmar que o OAuth herda uma chave existente por e-mail (recomendado) em vez de um modelo de permissão novo.
4. Confirmar a ordem, ou trocar B e C.

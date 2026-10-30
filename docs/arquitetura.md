# Arquitetura

## Componentes

O ness.know roda num único Worker da Cloudflare (`ness-know`), no domínio próprio `know.ness.com.br`.

| Recurso | Nome | Uso |
| --- | --- | --- |
| D1 | `ness-know` | Pacotes, documentos, trechos com índice FTS5, chaves de API |
| Vectorize | `ness-know-trechos` | Um vetor por trecho (1024 dimensões, cosseno). Índices de metadados `alvo` e `documento_id` |
| R2 | `ness-know-arquivos` | Arquivo original de cada documento |
| Workers AI | `AI` | Conversão de PDF e Office em texto (`toMarkdown`), embeddings `@cf/baai/bge-m3`, rerank opcional `@cf/baai/bge-reranker-base` |
| Assets | `public/` | Interface de administração, servida pelo próprio Worker |

Roteamento (`src/worker.ts`):

| Caminho | Proteção | Destino |
| --- | --- | --- |
| `GET /health` | nenhuma | `ok` |
| `/mcp` | chave de API (o Access tem uma regra Bypass para este caminho) | `src/mcp.ts` |
| `/api/*` | Cloudflare Access, mais o JWT conferido no Worker e a lista `ADMIN_EMAILS` | `src/admin.ts` |
| demais | Cloudflare Access | interface em `public/` |

## Modelo de dados

```
pacotes     slug PK, nome, descricao, instrucoes, versao, atualizado_em
documentos  id PK, escopo='pacote', dono=slug, titulo, tipo, fonte, versao, vigencia, r2_key, status (ok|erro), erro, criado_por, criado_em
trechos_fts FTS5(documento_id, escopo, dono, texto), tokenizador unicode61 sem acentos
strm_frameworks  id PK (nome do arquivo sem "scf-strm-" e ".xlsx"), nome, versao_scf, itens
scf_controles    scf PK, nome, descricao
strm             framework, item, item_nome, relacao (igual|subconjunto|superconjunto|intersecao), forca (0 a 10, pode faltar), scf; índices (framework, item) e (scf, framework)
chaves      id PK, nome, token_hash UNIQUE, pacotes JSON [slug], documentos JSON {slug: [título]}, ativo, criado_por, criado_em, usado_em
```

As colunas `escopo` e `dono` existem porque o código de busca veio do faBRAINzio, que tem camadas pessoal, da organização e de pacote. Aqui `escopo` é sempre `pacote`.

Migrações em `migrations/`: `0001_inicial.sql`, `0002_chave_documentos.sql` e `0003_strm.sql` (as tabelas do SCF STRM).

## Ingestão

`POST /api/pacotes/:slug/documentos`, normalmente chamado por `scripts/carregar-pacote.mjs`:

1. Grava o arquivo original no R2.
2. Extrai o texto: Markdown e texto puro como estão; PDF, DOCX e similares por `AI.toMarkdown`. Arquivo ilegível fica registrado com `status = erro` e o motivo.
3. Divide o texto em trechos de cerca de 1.200 caracteres, com 200 de sobreposição. Antes de cada título de seção (cláusula numerada, `A.5.24`, `CLD.9.5.1`, `Art. 6º`, linha toda em maiúsculas) o corte é forçado e não há sobreposição. Cabeçalhos e rodapés que se repetem em várias páginas são ignorados ao reconhecer títulos.
4. Atribui a cada trecho a seção mais próxima acima dele.
5. Grava os trechos no FTS5.
6. Gera os vetores, cada um a partir de `título — seção` mais o texto do trecho. Sumários e índices não viram vetor, porque só poluiriam a busca semântica. Cada vetor leva nos metadados:
   - `alvo`: hash de 16 hexadecimais da camada;
   - `documento_id`;
   - `secao`;
   - `texto`.
7. Recarregar o mesmo título no mesmo pacote apaga a versão anterior, com trechos, vetores e arquivo.

## Busca

`buscarEm(env, alvos, consulta, opções)` em `src/busca.ts`. Cada alvo é um pacote, inteiro ou restrito a alguns títulos.

1. **Textual.** A consulta vira até 8 termos FTS5 com OR. Códigos de cláusula viram frase exata. Pacote restrito acrescenta `d.titulo IN (…)`.
2. **Semântica.** A pergunta é embutida com `bge-m3` e pesquisada no Vectorize, que devolve até 20 resultados com metadados por consulta.
   - Pacote inteiro filtra por `alvo`, com até 50 hashes por consulta.
   - Pacote restrito filtra por `documento_id`, com até 40 ids por consulta, resolvidos a partir dos títulos.
   - Resultados abaixo da nota 0,4 são descartados.
   - Cada documento é conferido de novo no D1: um vetor fora do que a chave libera nunca chega à resposta.
3. **Fusão.** RRF com k = 60, peso 1 para a semântica e 0,5 para a textual. O melhor resultado textual fica com a última vaga se ainda não estiver no resultado, para que um código exato como `A.8.16` não se perca.
4. **Rerank** opcional (`BUSCA_RERANK = "1"`). Fica desligado: na avaliação, o primeiro lugar caiu de 64% para 58%.

Ajustes por variável do Worker: `BUSCA_MINIMO` (nota mínima da semântica) e `BUSCA_RERANK`.

### Medição

`scripts/avaliar-busca.mjs` roda perguntas-gabarito nos modos textual, semântico, híbrido, híbrido com pesos iguais e híbrido com rerank, e informa acerto no primeiro lugar, acerto entre os 5 primeiros e posição recíproca média. Resultado com 36 perguntas, em 30/10/2026:

| Modo | 1º lugar | Top 5 | MRR |
| --- | --- | --- | --- |
| Semântica | 69% | 92% | 0,81 |
| Híbrida (padrão) | 67% | 89% | 0,77 |
| Híbrida, pesos iguais | 69% | 86% | 0,77 |
| Híbrida com rerank | 67% | 89% | 0,75 |

A híbrida fica como padrão, mesmo um pouco abaixo da semântica pura, porque garante os códigos exatos.

## Correspondência entre frameworks

A ferramenta `correlacionar` (`src/strm.ts`) usa os dados do SCF STRM 2026.1: 183 frameworks, 54.220 vínculos e 1.365 controles SCF, carregados por `scripts/strm-para-sql.mjs` direto no D1.

- **Caminho:** item de origem → controle(s) SCF → itens dos frameworks de destino. O SCF é o ponto de passagem; não há mapeamento direto entre dois frameworks.
- **Força:** a de cada correspondência é a do elo mais fraco do caminho (mínimo entre origem → SCF e SCF → destino). Se um dos elos não informa força, o resultado é `null`.
- **Limite do item numérico:** números são lidos como a célula os exibe. No SCF STRM 2026.1, as 2.698 células de item numérico exibem o mesmo valor que gravam, então não houve colisão; rever se uma versão futura trouxer itens como `1.10` gravados como número. Anotado em `scripts/strm.mjs`.
- **Anexo A da ISO 27001:** não existe como framework; use a ISO 27002:2022.
- **Conversor:** lê só a primeira aba de cada planilha. O ExcelJS não abriu 20 planilhas por causa dos relacionamentos de comentários; o conversor remove esses relacionamentos com JSZip (devDependency) antes da leitura.
- **Acesso:** pacote `scf-strm`, tudo ou nada por chave; sem restrição por framework.

## Decisões

| Decisão | Motivo |
| --- | --- |
| Serviço próprio, fora do faBRAINzio e do ness.brain | A base é reaproveitável por qualquer projeto e não deve depender do assistente de um cliente (`docs/spec.md`) |
| MCP sem sessão e resposta JSON | Funciona num Worker sem estado e em qualquer cliente MCP por HTTP |
| Chave em hash, mostrada uma vez | Vazamento do banco não expõe chaves usáveis |
| Restrição por título, não por id | Recarregar uma norma troca o id; o título é estável |
| Pacote inteiro como padrão | Normas novas entram nas chaves sem reemissão |
| Mapeamento como dado estruturado, não como trecho de busca | A correspondência precisa ser exata e conferível |
| `alvo` como hash curto | O Vectorize indexa só os 64 primeiros bytes de uma string e limita o filtro a 2.048 bytes |

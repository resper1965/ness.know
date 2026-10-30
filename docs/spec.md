# ness.KNOW como serviço independente

> Atualização (30/10/2026, mais tarde): a chave também pode ser restrita a normas específicas de um pacote (`chaves.documentos`). Ver `docs/arquitetura.md`.

## Decisão (30/10/2026)
A base de pacotes saiu do faBRAINzio e virou serviço próprio (alternativa C). Motivo: é reaproveitável por qualquer projeto ou agente da ness. e não deve depender do assistente de um cliente.

## O que é
- Worker `ness-know` em `know.ness.com.br`, com D1 `ness-know`, R2 `ness-know-arquivos`, Vectorize `ness-know-trechos` e Workers AI.
- Dados: `pacotes` (slug, nome, instruções), `documentos` e `trechos_fts` (mesmo formato do faBRAINzio, escopo sempre `pacote`), `chaves` (hash do token, pacotes liberados, ativo, último uso).
- Acesso: `/mcp` fora do Access, com chave de API; o resto atrás do Access e só para `ADMIN_EMAILS`.
- Recarregar um documento com o mesmo título no mesmo pacote substitui o anterior (sem duplicar trechos).

## Clientes
- **faBRAINzio:** consulta o ness.KNOW por MCP com uma chave própria; continua com as camadas pessoal e da organização. Os pacotes que cada organização vê seguem em `org_pacotes`, filtro que o faBRAINzio manda na busca.
- **ness.brain** e agentes (Claude Code, etc.): conectam por MCP com chave própria quando fizer sentido.

## Fora do escopo
Pacotes por cliente com conteúdo privado (fica na camada da organização de cada app), cobrança, cota por chave.

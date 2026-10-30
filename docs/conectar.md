# Conectar um agente ao ness.KNOW

Endereço MCP (Streamable HTTP, sem sessão): `https://know.ness.com.br/mcp`
Autenticação: `Authorization: Bearer <chave>` (gere em https://know.ness.com.br, seção 01; a chave aparece uma vez).
Ferramentas, só leitura: `listar_pacotes` (pacotes, instruções de uso, documentos) e `buscar_conhecimento(consulta, pacotes?, limite?)` (JSON com trechos, seção e `ref: know-…` para citar).

A interface mostra estas receitas já com a chave preenchida, logo depois de gerá-la.

## Claude Code
```
claude mcp add --transport http ness-know https://know.ness.com.br/mcp --header "Authorization: Bearer <chave>"
```

## Codex (CLI e extensão de IDE)
`~/.codex/config.toml`:
```toml
[mcp_servers.ness-know]
url = "https://know.ness.com.br/mcp"
bearer_token_env_var = "NESS_KNOW_TOKEN"
```
A chave vai na variável de ambiente (Windows: `setx NESS_KNOW_TOKEN "<chave>"`; macOS/Linux: `export NESS_KNOW_TOKEN="<chave>"`).

## Cursor
`.cursor/mcp.json` (projeto) ou `~/.cursor/mcp.json`:
```json
{ "mcpServers": { "ness-know": { "url": "https://know.ness.com.br/mcp", "headers": { "Authorization": "Bearer <chave>" } } } }
```

## VS Code (Copilot)
`.vscode/mcp.json`:
```json
{ "servers": { "ness-know": { "type": "http", "url": "https://know.ness.com.br/mcp", "headers": { "Authorization": "Bearer <chave>" } } } }
```

## Claude Desktop
`claude_desktop_config.json`, pela ponte `mcp-remote` (exige Node):
```json
{ "mcpServers": { "ness-know": { "command": "npx", "args": ["-y", "mcp-remote", "https://know.ness.com.br/mcp", "--header", "Authorization: Bearer <chave>"] } } }
```

## ChatGPT e Claude na web (conectores)
Esses conectores só aceitam OAuth ou "sem autenticação": não mandam cabeçalho com chave. Ainda não suportado (ver decisão pendente no README).

## Boas práticas
- Uma chave por pessoa ou projeto, com só os pacotes necessários; revogue na interface quando não usar mais.
- Nunca versione a chave (use variável de ambiente ou o cofre da ferramenta).
- Peça ao agente para citar documento, versão e seção (vêm em cada trecho).

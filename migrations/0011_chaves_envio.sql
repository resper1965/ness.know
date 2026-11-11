-- Chave de envio: uma empresa sobe o próprio conteúdo no pacote dela, sem passar pelo Access. É outra credencial, separada da chave do /mcp
-- (que só lê): a de envio não lê pelo MCP e a do MCP não grava. Cada chave de envio vale para um único pacote.
CREATE TABLE chaves_envio (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  pacote TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  usado_em TEXT,
  expira_em TEXT                       -- UTC, "AAAA-MM-DD HH:MM:SS"; a criação sempre grava uma validade
);
CREATE INDEX chaves_envio_pacote ON chaves_envio (pacote);

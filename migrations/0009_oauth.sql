-- OAuth do /mcp (ness.work e outros clientes MCP): clientes registrados por DCR (RFC 7591), pedidos e códigos de autorização,
-- regras de acesso por pessoa e auditoria. O token emitido é uma linha comum de `chaves`, com `pessoa` preenchida.
CREATE TABLE oauth_clientes (
  client_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,           -- JSON: lista exata; o redirect_uri do pedido tem de ser igual a um deles
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uma linha por autorização: nasce pendente (consentimento), vira código ao confirmar e some ao trocar por token. Só o hash do código.
CREATE TABLE oauth_codigos (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  pessoa TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  desafio TEXT NOT NULL,                 -- code_challenge (PKCE S256)
  estado TEXT,                           -- state do cliente, devolvido como veio
  hash_codigo TEXT UNIQUE,               -- nulo enquanto pendente
  expira_em TEXT NOT NULL                -- UTC, "AAAA-MM-DD HH:MM:SS"
);

-- O que cada pessoa enxerga pelo OAuth, avaliado a cada chamada. tipo 'padrao' vale para todos (sujeito vazio); 'pessoa' é por e-mail.
CREATE TABLE acesso_regras (
  tipo TEXT NOT NULL CHECK (tipo IN ('padrao', 'pessoa')),
  sujeito TEXT NOT NULL DEFAULT '',
  pacotes TEXT NOT NULL DEFAULT '[]',    -- JSON: slugs
  documentos TEXT NOT NULL DEFAULT '{}', -- JSON: {slug: [títulos]}; pacote fora do mapa vale inteiro
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tipo, sujeito)
);

-- Quem concedeu, revogou ou mudou regra. Sem token nem conteúdo.
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  ator TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT ''
);

ALTER TABLE chaves ADD COLUMN pessoa TEXT;         -- preenchida só em chave emitida por OAuth; o escopo vem de acesso_regras
ALTER TABLE chaves ADD COLUMN cliente_oauth TEXT;

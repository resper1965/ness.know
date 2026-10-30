-- ness.KNOW: pacotes de conhecimento (normas, leis, frameworks), documentos, trechos e chaves de API.

CREATE TABLE pacotes (
  slug TEXT PRIMARY KEY,                -- ex.: seguranca-conformidade
  nome TEXT NOT NULL,
  descricao TEXT,
  instrucoes TEXT NOT NULL DEFAULT '',  -- como um agente deve usar o pacote ao responder
  versao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- escopo é sempre 'pacote' e dono é o slug; as colunas ficam para o código de busca ser o mesmo do faBRAINzio.
CREATE TABLE documentos (
  id TEXT PRIMARY KEY,
  escopo TEXT NOT NULL,
  dono TEXT NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT,
  fonte TEXT,
  versao TEXT,
  vigencia TEXT,
  ativo_ref TEXT,
  r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'ok',    -- ok | erro
  erro TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX documentos_dono ON documentos (escopo, dono);

CREATE VIRTUAL TABLE trechos_fts USING fts5(
  documento_id UNINDEXED, escopo UNINDEXED, dono UNINDEXED, texto,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Chaves de API (uma por cliente). O token só existe em hash; cada chave vê só os pacotes listados.
CREATE TABLE chaves (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  pacotes TEXT NOT NULL DEFAULT '[]',   -- JSON: slugs liberados
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  usado_em TEXT
);

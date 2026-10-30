-- Correspondência entre frameworks pelo SCF STRM (NIST IR 8477). Conteúdo carregado por scripts/strm-para-sql.mjs.
CREATE TABLE strm_frameworks (
  id TEXT PRIMARY KEY,            -- nome do arquivo sem "scf-strm-" e ".xlsx", ex.: general-iso-27002-2022
  nome TEXT NOT NULL,             -- "Focal Document" da planilha
  versao_scf TEXT,                -- ex.: 2026.1
  itens INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE scf_controles (
  scf TEXT PRIMARY KEY,           -- ex.: MON-01
  nome TEXT,
  descricao TEXT
);
CREATE TABLE strm (
  framework TEXT NOT NULL,
  item TEXT NOT NULL,             -- ex.: 8.16, DE.CM-01
  item_nome TEXT,
  relacao TEXT NOT NULL,          -- igual | subconjunto | superconjunto | intersecao
  forca INTEGER,                  -- 0 a 10, pode faltar
  scf TEXT NOT NULL
);
CREATE INDEX strm_item ON strm (framework, item);
CREATE INDEX strm_scf ON strm (scf, framework);

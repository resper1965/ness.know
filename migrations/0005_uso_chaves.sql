-- Uso por chave: chamadas por dia e ferramenta. Não guarda o texto da consulta.
CREATE TABLE uso_chaves (
  chave_id TEXT NOT NULL,
  dia TEXT NOT NULL,         -- AAAA-MM-DD (UTC)
  ferramenta TEXT NOT NULL,  -- initialize, tools/list ou o nome da ferramenta chamada
  chamadas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chave_id, dia, ferramenta)
);

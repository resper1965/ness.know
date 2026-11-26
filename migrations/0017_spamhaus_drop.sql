-- Redes (CIDR) em `indicadores`: ini e fim são a faixa em texto de largura fixa (família + hexadecimal), para o SQL achar a rede que contém um IP.
ALTER TABLE indicadores ADD COLUMN ini TEXT;
ALTER TABLE indicadores ADD COLUMN fim TEXT;
CREATE INDEX indicadores_faixa ON indicadores (tipo, ini, fim);

-- Spamhaus DROP (redes alugadas ou sequestradas por quadrilhas). Termos (spamhaus.org/blocklists/drop-fair-use-policy/):
-- 2.1 gratuito; 3.1 conteúdo com direito autoral e de banco de dados, sem licença de redistribuição; 3.2 proibido usar o nome Spamhaus em material
-- comercial ou promocional; 4.2 manter atualizado e revisar antes de importar em filtros. Por isso: uso interno da ness., e o que sai da lista expira na hora.
INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, exige_chave, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('spamhaus-drop', 'DROP (Spamhaus)', 'https://www.spamhaus.org/drop/drop_v4.json',
   'Gratuito (termos do DROP, 2.1). Conteúdo com direito autoral e de banco de dados, sem licença de redistribuição (3.1): uso interno da ness.',
   'https://www.spamhaus.org/blocklists/drop-fair-use-policy/',
   'Dados: DROP, Don''t Route or Peer (Spamhaus). Uso interno: os termos (3.2) proíbem usar o nome Spamhaus em material comercial ou promocional; não o cite em proposta, relatório ou material para cliente.',
   0, 'lote', 74, 360, 24);

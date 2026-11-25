-- Fontes externas e públicas (CISA KEV, EPSS, avisos de fabricante…): catálogo, log de coleta e os dados coletados.
-- Nada interno da ness. entra aqui. Datas em ISO 8601 UTC ("2026-11-25T21:00:00.000Z"), comparáveis como texto.
CREATE TABLE fontes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  licenca TEXT NOT NULL,
  termos_url TEXT,
  atribuicao TEXT,                      -- frase que acompanha toda resposta que usa a fonte
  exige_chave INTEGER NOT NULL DEFAULT 0,
  modo TEXT NOT NULL DEFAULT 'lote',    -- lote: coletada pelo cron; ao_vivo: consultada na hora, com cache
  ordem INTEGER NOT NULL DEFAULT 100,   -- a coleta roda em ordem crescente (o EPSS depende do KEV)
  frequencia_min INTEGER NOT NULL,
  ttl_horas INTEGER NOT NULL,           -- passado o TTL sem coleta bem-sucedida, a resposta avisa que o dado pode estar desatualizado
  ativa INTEGER NOT NULL DEFAULT 1,
  ultima_tentativa TEXT,
  ultimo_sucesso TEXT,
  ultimo_erro TEXT,
  erro_msg TEXT,
  versao TEXT,
  detalhe TEXT,
  etag TEXT,
  itens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE coletas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  status TEXT NOT NULL,                 -- ok | erro
  alterado INTEGER NOT NULL DEFAULT 0,
  itens INTEGER NOT NULL DEFAULT 0,
  erro TEXT
);
CREATE INDEX coletas_fonte ON coletas (fonte, inicio);

CREATE TABLE kev (
  cve TEXT PRIMARY KEY,
  fornecedor TEXT NOT NULL,
  produto TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  data_inclusao TEXT NOT NULL,          -- AAAA-MM-DD
  prazo TEXT,
  acao TEXT,
  ransomware TEXT,                      -- Known | Unknown
  triagem_forense TEXT,
  notas TEXT,
  cwes TEXT NOT NULL DEFAULT '[]',
  primeiro_visto TEXT NOT NULL,
  ultimo_visto TEXT NOT NULL,
  removido_em TEXT                      -- saiu do catálogo: fica 90 dias marcado, não some na hora
);
CREATE INDEX kev_inclusao ON kev (data_inclusao);

CREATE TABLE epss (
  cve TEXT PRIMARY KEY,
  score REAL NOT NULL,
  percentil REAL NOT NULL,
  data_modelo TEXT NOT NULL
);

CREATE TABLE avisos (
  id TEXT PRIMARY KEY,                  -- fonte:ref
  fonte TEXT NOT NULL,
  fornecedor TEXT NOT NULL,
  ref TEXT NOT NULL,
  titulo TEXT NOT NULL,
  resumo TEXT,
  url TEXT NOT NULL,
  cves TEXT NOT NULL DEFAULT '[]',
  publicado_em TEXT,
  atualizado_em TEXT,
  primeiro_visto TEXT NOT NULL
);
CREATE INDEX avisos_fornecedor ON avisos (fornecedor, publicado_em);

-- Cache das consultas ao vivo (NVD, FIRST): o D1 serve, sem criar KV.
CREATE TABLE cache (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  expira_em TEXT NOT NULL
);

INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, ordem, frequencia_min, ttl_horas) VALUES
  ('kev', 'CISA KEV', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'Domínio público (CISA)', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
   'Dados: CISA, Known Exploited Vulnerabilities Catalog (domínio público)', 10, 1440, 48),
  ('epss', 'EPSS (FIRST)', 'https://epss.empiricalsecurity.com/epss_scores-current.csv.gz', 'Uso gratuito com atribuição à FIRST', 'https://www.first.org/epss/',
   'Dados: EPSS, FIRST.org (first.org/epss). Probabilidade de exploração, separada do KEV', 20, 1440, 72),
  ('msrc', 'Microsoft MSRC', 'https://api.msrc.microsoft.com/cvrf/v3.0/updates', 'API pública do MSRC', 'https://www.microsoft.com/msrc',
   'Dados: Microsoft Security Response Center', 30, 1440, 72),
  ('fortinet', 'Fortinet PSIRT', 'https://filestore.fortinet.com/fortiguard/rss/ir.xml', 'Feed RSS público (FortiGuard)', 'https://www.fortiguard.com/psirt',
   'Dados: Fortinet PSIRT (fortiguard.com/psirt)', 40, 360, 48);

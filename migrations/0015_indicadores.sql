-- Inteligência de ameaças: indicadores normalizados (ip, dominio, url, hash) vindos de fontes abertas, com primeira e última vez visto e expiração.
-- O que sai da fonte ou passa do prazo fica marcado como expirado e só é apagado 90 dias depois. Nada aqui é veredito: é o que cada fonte lista.
CREATE TABLE indicadores (
  id TEXT PRIMARY KEY,                  -- fonte|tipo|valor
  tipo TEXT NOT NULL,                   -- ip | dominio | url | hash
  valor TEXT NOT NULL,
  fonte TEXT NOT NULL,
  familia TEXT,                         -- família ou ameaça nomeada pela fonte; vazio quando a fonte não informa
  ameaca TEXT,                          -- tipo de ameaça (botnet_c2, payload_delivery, malware_download…)
  confianca INTEGER,                    -- 0 a 100, só quando a fonte informa; desconhecido fica vazio, nunca zero
  tags TEXT NOT NULL DEFAULT '[]',
  host TEXT,                            -- para url: o host, para achar URLs de um IP ou domínio
  referencia TEXT,                      -- página do indicador na fonte (https)
  data_fonte TEXT,                      -- quando a fonte viu pela primeira vez (ISO)
  primeiro_visto TEXT NOT NULL,         -- quando o ness.know viu pela primeira vez
  ultimo_visto TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  expirado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX indicadores_valor ON indicadores (tipo, valor);
CREATE INDEX indicadores_host ON indicadores (host);
CREATE INDEX indicadores_novos ON indicadores (primeiro_visto);
CREATE INDEX indicadores_fonte ON indicadores (fonte, expirado);

INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, exige_chave, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('feodo', 'Feodo Tracker (abuse.ch)', 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', 'Dados abertos do abuse.ch (CC0 segundo o projeto; termos a conferir)', 'https://abuse.ch/',
   'Dados: Feodo Tracker, abuse.ch', 0, 'lote', 70, 60, 6),
  ('threatfox', 'ThreatFox (abuse.ch)', 'https://threatfox-api.abuse.ch/api/v1/', 'Dados abertos do abuse.ch (CC0 segundo o projeto; termos a conferir); Auth-Key gratuita', 'https://abuse.ch/',
   'Dados: ThreatFox, abuse.ch', 1, 'lote', 71, 60, 6),
  ('urlhaus', 'URLhaus (abuse.ch)', 'https://urlhaus-api.abuse.ch/v1/urls/recent/limit/1000/', 'Dados abertos do abuse.ch (CC0 segundo o projeto; termos a conferir); Auth-Key gratuita', 'https://abuse.ch/',
   'Dados: URLhaus, abuse.ch', 1, 'lote', 72, 60, 6),
  ('malwarebazaar', 'MalwareBazaar (abuse.ch)', 'https://mb-api.abuse.ch/api/v1/', 'Dados abertos do abuse.ch (CC0 segundo o projeto; termos a conferir); Auth-Key gratuita', 'https://abuse.ch/',
   'Dados: MalwareBazaar, abuse.ch', 1, 'lote', 73, 30, 3);

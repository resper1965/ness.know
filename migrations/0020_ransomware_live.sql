-- Atividade de ransomware (Ransomware.live, API PRO): vítimas anunciadas em sites de vazamento. São alegações dos grupos criminosos, não incidentes confirmados.
-- Não se guarda a descrição escrita pelo grupo (pode trazer dados do vazamento) nem o endereço onion do post: só quem, onde, quando e o link da própria Ransomware.live.
CREATE TABLE vitimas_ransomware (
  id TEXT PRIMARY KEY,                 -- id da API
  grupo TEXT NOT NULL,
  vitima TEXT NOT NULL,
  dominio TEXT,
  pais TEXT,                           -- ISO 3166-1 alfa-2; vazio quando a fonte não informa
  setor TEXT,                          -- vazio quando a fonte não informa (nunca "desconhecido" como valor)
  descoberta TEXT NOT NULL,            -- ISO 8601 UTC: quando a Ransomware.live viu o anúncio
  ataque TEXT,                         -- data do ataque segundo o grupo
  url TEXT,                            -- página da vítima na Ransomware.live (https)
  primeiro_visto TEXT NOT NULL,
  ultimo_visto TEXT NOT NULL
);
CREATE INDEX vitimas_descoberta ON vitimas_ransomware (descoberta);
CREATE INDEX vitimas_grupo ON vitimas_ransomware (grupo, descoberta);
CREATE INDEX vitimas_pais ON vitimas_ransomware (pais, descoberta);

INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, exige_chave, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('ransomware-live', 'Ransomware.live (API PRO)', 'https://api-pro.ransomware.live/victims/recent',
   'Uso comercial aprovado pelo dono da Ransomware.live (informado pelo dono em 26/11/2026). Termos: atribuição à Ransomware.live, uso justo (dados em cache de 30 min), sem redistribuição comercial dos dados.',
   'https://www.ransomware.live/t&c',
   'Dados: Ransomware.live (ransomware.live). Alegações de grupos criminosos, não confirmadas.', 1, 'lote', 75, 60, 6);

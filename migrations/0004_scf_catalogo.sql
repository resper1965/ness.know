-- Catálogo do SCF (scf-full JSON): como avaliar cada controle, que evidência pedir e critérios de maturidade.
-- Carregado por scripts/scf-catalogo-para-sql.mjs; usado pela ferramenta detalhar_controle.
ALTER TABLE scf_controles ADD COLUMN dominio TEXT;
ALTER TABLE scf_controles ADD COLUMN pergunta TEXT;
ALTER TABLE scf_controles ADD COLUMN peso INTEGER;
ALTER TABLE scf_controles ADD COLUMN cadencia TEXT;
ALTER TABLE scf_controles ADD COLUMN funcao_csf TEXT;   -- JSON: ["Govern", …]
ALTER TABLE scf_controles ADD COLUMN maturidade TEXT;   -- JSON: [{nivel, rotulo, criterio}] de 0 a 5
ALTER TABLE scf_controles ADD COLUMN evidencias TEXT;   -- JSON: ids da lista de evidências (E-…)
ALTER TABLE scf_controles ADD COLUMN legado TEXT;       -- JSON: ids da versão anterior do SCF
CREATE TABLE scf_objetivos (
  ao_id TEXT PRIMARY KEY,         -- ex.: MON-02_A01
  scf TEXT NOT NULL,
  objetivo TEXT NOT NULL
);
CREATE INDEX scf_objetivos_scf ON scf_objetivos (scf);
CREATE TABLE scf_evidencias (
  erl_id TEXT PRIMARY KEY,        -- ex.: E-MON-01
  area TEXT,
  artefato TEXT NOT NULL,
  descricao TEXT
);

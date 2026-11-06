-- Skills: procedimentos curtos que dizem ao agente como usar as normas. `normas` é {slug: [títulos]}: a chave só enxerga a
-- skill se tiver esses pacotes (lista vazia = só o pacote) e, no pacote restrito, essas normas. {} = vale para toda chave.
CREATE TABLE skills (
  nome TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  normas TEXT NOT NULL DEFAULT '{}',
  corpo TEXT NOT NULL,
  versao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

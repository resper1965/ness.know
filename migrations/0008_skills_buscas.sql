-- Buscas de continuação que a skill declara (JSON de textos). O faBRAINzio as executa na busca prévia, porque o modelo pequeno
-- não as faz sozinho. Skill antiga fica com [].
ALTER TABLE skills ADD COLUMN buscas TEXT NOT NULL DEFAULT '[]';

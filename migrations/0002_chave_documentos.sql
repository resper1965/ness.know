-- Chave restrita a algumas normas de um pacote: JSON {slug: [títulos]}. Pacote ausente do mapa = pacote inteiro
-- (inclusive normas carregadas depois). O título é a identidade estável: recarregar uma norma troca o id, não o título.
ALTER TABLE chaves ADD COLUMN documentos TEXT NOT NULL DEFAULT '{}';

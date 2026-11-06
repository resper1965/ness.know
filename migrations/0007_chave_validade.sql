-- Validade opcional da chave (UTC, AAAA-MM-DD HH:MM:SS). Nula = não expira. Chave vencida recebe 401 como a revogada.
ALTER TABLE chaves ADD COLUMN expira_em TEXT;

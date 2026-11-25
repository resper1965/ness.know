-- Documentação oficial consultada ao vivo (MCP públicos de Microsoft Learn e Cloudflare): sem cópia, só trecho curto e link.
-- Entram no catálogo para aparecerem em saude_fontes e para a resposta citar fonte e data da consulta.
INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('learn', 'Microsoft Learn', 'https://learn.microsoft.com/api/mcp', 'Documentação pública da Microsoft; só trecho curto com link, sem cópia', NULL,
   'Fonte: Microsoft Learn (learn.microsoft.com)', 'ao_vivo', 50, 1440, 24),
  ('cf-docs', 'Documentação da Cloudflare', 'https://docs.mcp.cloudflare.com/mcp', 'Documentação pública da Cloudflare; só trecho curto com link, sem cópia', NULL,
   'Fonte: Cloudflare Docs (developers.cloudflare.com)', 'ao_vivo', 51, 1440, 24),
  ('cf-blog', 'Blog da Cloudflare', 'https://blog.mcp.cloudflare.com/mcp', 'Blog público da Cloudflare; só trecho curto com link, sem cópia', NULL,
   'Fonte: Cloudflare Blog (blog.cloudflare.com)', 'ao_vivo', 52, 1440, 24);
UPDATE fontes SET modo = 'ao_vivo' WHERE id IN ('learn', 'cf-docs', 'cf-blog');

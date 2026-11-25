-- Estado de provedores (páginas de status oficiais) e da internet (Cloudflare Radar), consultados ao vivo com cache curto.
INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, exige_chave, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('cf-status', 'Status da Cloudflare', 'https://www.cloudflarestatus.com', 'Página de status pública', NULL, 'Fonte: cloudflarestatus.com', 0, 'ao_vivo', 60, 1440, 24),
  ('atera-status', 'Status da Atera', 'https://status.atera.com', 'Página de status pública', NULL, 'Fonte: status.atera.com', 0, 'ao_vivo', 61, 1440, 24),
  ('kaseya-status', 'Status da Kaseya (Datto RMM)', 'https://status.kaseya.com', 'Página de status pública', NULL, 'Fonte: status.kaseya.com', 0, 'ao_vivo', 62, 1440, 24),
  ('gw-status', 'Status do Google Workspace', 'https://www.google.com/appsstatus/dashboard/', 'Painel de status público', NULL, 'Fonte: Google Workspace Status Dashboard', 0, 'ao_vivo', 63, 1440, 24),
  ('azure-status', 'Status do Azure', 'https://azure.status.microsoft/en-us/status/', 'Feed RSS público', NULL, 'Fonte: Azure Status (azure.status.microsoft)', 0, 'ao_vivo', 64, 1440, 24),
  ('action1-status', 'Status da Action1', 'https://status.action1.com/', 'Página de status pública (formato não documentado)', NULL, 'Fonte: status.action1.com', 0, 'ao_vivo', 65, 1440, 24),
  ('radar', 'Cloudflare Radar', 'https://api.cloudflare.com/client/v4/radar/', 'API do Radar; token gratuito com permissão só de leitura do Radar', 'https://developers.cloudflare.com/radar/', 'Dados: Cloudflare Radar (radar.cloudflare.com)', 1, 'ao_vivo', 66, 1440, 24);

-- CIRCL hashlookup (hashes de arquivos conhecidos, como a NSRL), ao vivo e sem chave. Licença: dados CC-BY; a página do serviço
-- (circl.lu/services/hashlookup/) diz que podem ser usados comercial e não comercialmente, referenciando essa página.
INSERT INTO fontes (id, nome, url, licenca, termos_url, atribuicao, exige_chave, modo, ordem, frequencia_min, ttl_horas) VALUES
  ('circl-hashlookup', 'CIRCL hashlookup (arquivos conhecidos)', 'https://hashlookup.circl.lu/', 'CC-BY: uso comercial e não comercial permitido, com referência ao CIRCL; serviço gratuito, sem garantia de disponibilidade', 'https://www.circl.lu/services/hashlookup/', 'Dados: CIRCL hashlookup (circl.lu/services/hashlookup/), CC-BY. Lista arquivos conhecidos; não é veredito de segurança.', 0, 'ao_vivo', 68, 1440, 24);

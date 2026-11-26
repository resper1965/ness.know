-- Termos do abuse.ch (abuse.ch/terms-of-use, seções 3 e 4): Feodo Tracker é CC0, inclusive para uso comercial. ThreatFox, URLhaus e MalwareBazaar são
-- gratuitos só para uso sem fins lucrativos; uso por empresa pode exigir assinatura paga (gerenciada pela Spamhaus). A ness. é empresa e a regra é custo zero:
-- as três ficam pausadas até haver decisão (assinar a API comercial ou continuar sem elas). Para retomar: UPDATE fontes SET ativa = 1 WHERE id = '...'.
UPDATE fontes SET licenca = 'CC0, inclusive para uso comercial (abuse.ch, termos de uso, seção 3.4)', termos_url = 'https://abuse.ch/terms-of-use/' WHERE id = 'feodo';
UPDATE fontes SET ativa = 0, termos_url = 'https://abuse.ch/terms-of-use/',
  licenca = 'Gratuito só para uso sem fins lucrativos; uso por empresa pode exigir assinatura paga (abuse.ch, termos de uso, seção 4). Pausada até decisão.'
  WHERE id IN ('threatfox', 'urlhaus', 'malwarebazaar');

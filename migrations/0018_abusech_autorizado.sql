-- O abuse.ch autorizou por escrito o uso descrito pela NESS (informado pelo dono em 26/11/2026): base de conhecimento interna, consultada pela
-- própria equipe de SOC e NOC, sem revenda, sem redistribuição e sem treino de IA. ThreatFox, URLhaus e MalwareBazaar voltam a coletar.
-- O e-mail de autorização fica com a NESS (não vai para o repositório). Se o uso mudar, pedir de novo.
UPDATE fontes SET ativa = 1, termos_url = 'https://abuse.ch/terms-of-use/',
  licenca = 'Uso interno da NESS autorizado por escrito pelo abuse.ch (consulta pela equipe de SOC e NOC; sem revenda, sem redistribuição, sem treino de IA). Termos gerais: gratuito só para uso sem fins lucrativos; uso comercial exige assinatura (seção 4).'
  WHERE id IN ('threatfox', 'urlhaus', 'malwarebazaar');

-- Corrige o texto da licença das três fontes do abuse.ch: o dono combinou o uso diretamente com o abuse.ch (comunicação pessoal, informada em 26/11/2026),
-- não por e-mail guardado pela NESS. O escopo do que foi combinado continua o mesmo: uso interno (SOC e NOC), sem revenda, sem redistribuição, sem treino de IA.
UPDATE fontes SET licenca = 'Uso interno da NESS autorizado pelo abuse.ch (combinado diretamente pelo dono, informado em 26/11/2026): consulta pela equipe de SOC e NOC; sem revenda, sem redistribuição, sem treino de IA. Termos gerais: gratuito só para uso sem fins lucrativos; uso comercial exige assinatura (seção 4).'
  WHERE id IN ('threatfox', 'urlhaus', 'malwarebazaar');

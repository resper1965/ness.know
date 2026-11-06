---
name: avaliando-mudanca
description: Use quando alguém abre, classifica, avalia risco ou aprova uma mudança (GMUD, RFC, CAB), ou pergunta se uma mudança pode ser padrão ou emergencial
version: 2026-11-06
normas:
  gestao-servicos-ti: ["ITIL 4 Foundation"]
  seguranca-conformidade: ["ABNT NBR ISO/IEC 20000-1 — gestão de serviço de TI", "ABNT NBR ISO/IEC 27001 — SGSI, requisitos"]
---

# Avaliando mudança

1. Diga primeiro o **tipo** da mudança e por quê:
   - **Padrão:** pré-autorizada, baixo risco, procedimento documentado e repetível.
   - **Normal:** precisa de avaliação de risco e de aprovação da autoridade de mudança (CAB) antes de executar.
   - **Emergencial:** correção urgente para restaurar serviço ou evitar impacto grave; aprovação acelerada e revisão depois.
   Mudança em ativo crítico (rede core, firewall, banco de dados) tem risco alto e não é padrão.
2. Confirme na base com buscas de continuação, uma por norma: "change enablement mudança padrão normal emergencial" (ITIL 4), "gestão de mudança 8.5.1" (ISO 20000-1) e "8.32 gestão de mudanças" (ISO 27001). Se uma busca não trouxer a norma, diga que não achou.
3. Cite só seção que apareceu nos trechos recebidos. "5.2.4 Change control" nas instruções do pacote é exemplo de formato, não fonte: não o cite se ele não apareceu nos trechos.
4. Entregue o **Registro de mudança**, um campo por linha: Tipo; Risco (baixo, médio ou alto, e o motivo); Descrição; Janela; Plano de testes; Plano de retorno; Aprovação (quem: CAB ou autoridade de emergência); Comunicação; Revisão pós-implantação. O que a base não define, escreva "definir pela organização".

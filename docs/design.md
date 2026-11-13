# Design da interface

O painel (`public/index.html`), a página de envio (`public/enviar.html`) e a documentação pública (`public/docs.html`) seguem o **design system ness.**, no tema escuro: BlueDot `#00ade8` como único accent, raio 0, hairlines, sem gradiente, sombra ou blur, e Montserrat, Inter e JetBrains Mono.

- **Tokens:** cada página traz o mesmo bloco `:root` com os valores do `tokens.json` do pacote do design system (decisões de 13/11/2026: fundo Tinta `#0e1116`, cartões `#16191f`, erro `#f87171`). Os nomes locais (`--paper`, `--surface`, `--ink`, `--bad`…) apontam para eles. Hex de cor só nesse bloco. O bloco fica dentro de cada arquivo, e não num CSS à parte, porque `/enviar` e `/docs` são públicos e um arquivo novo precisaria de Bypass no Access.
- **Para atualizar o sistema:** troque os valores do bloco `:root` nas três páginas e rode `npm test`: `test/design.test.ts` confere os tokens e recusa a paleta antiga.
- **Marca e texto:** o produto é `ness.know` (caixa baixa, ponto em BlueDot). Em texto corrido, a empresa é NESS. O nome de sistema `ness.KNOW` continua nos testes e no campo `fonte` da API (contrato com o faBRAINzio), e não é texto de interface.
- **Contraste:** todos os textos passam de 4,5:1 (3:1 para texto grande). O vermelho de erro `#f87171` dá cerca de 6,4:1 nos cartões.

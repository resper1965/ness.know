# Gabaritos de busca

Perguntas com a resposta esperada, para medir a busca de cada pacote com `scripts/avaliar-busca.mjs`. Cada arquivo é `[{pergunta, documento, contem, aceita?}]`: o trecho certo é de um documento cujo título contém `documento` e tem, na seção ou no texto, um dos `contem`.

```powershell
node scripts/avaliar-busca.mjs docs/gabaritos/<pacote>.json https://know.ness.com.br <pacote>
```

Cada resposta esperada foi conferida contra os trechos reais do pacote (existe pelo menos um trecho que a satisfaz). Os gabaritos não trazem o texto das normas, só números de seção e palavras de título.

## Resultado de 03/11/2026 (modo híbrido, o padrão)

| Pacote | Perguntas | Certo em 1º | Certo no top 5 | MRR@10 |
| --- | ---: | ---: | ---: | ---: |
| `legislacao-digital` | 12 | 75% | 100% | 0,85 |
| `crimes-ciberneticos-e-ti` | 14 | 79% | 100% | 0,88 |
| `forense-digital` | 12 | 75% | 100% | 0,88 |
| `dispositivos-medicos` | 10 | 50% | 80% | 0,60 |

- A busca semântica sozinha foi a melhor em legislação (83% em 1º) e em crimes (86%); a fusão com pesos iguais foi a melhor em forense (83%). Com 10 a 14 perguntas por pacote a diferença é de uma ou duas perguntas: não é motivo para mudar o padrão.
- O rerank melhorou dois pacotes e piorou dois: continua desligado.
- `dispositivos-medicos` está abaixo dos outros por causa da extração do PDF, não da busca: 254 dos 255 trechos têm o rótulo de seção `Page N` (lacuna 2.9 em [lacunas.md](../lacunas.md)).

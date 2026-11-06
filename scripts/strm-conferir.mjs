// Conferência do STRM carregado contra as planilhas de uma versão anterior: funções puras, testadas em test/strm-conferir.test.ts.
// Cada lado é uma lista de frameworks {id, nome, ligacoes: [{item, itemNome, relacao, forca, scf}]}.
// A comparação é por framework e por item (a numeração do próprio framework é estável); os controles SCF foram renumerados no 2026.3,
// então o par item × controle não serve para comparar versões.

const itensDe = (p) => new Set(p.ligacoes.map((l) => l.item));

/**
 * Um registro por framework presente nos dois lados, e os que só existem num deles.
 * Falha (falhas++) quando um framework comum perde mais de `limite`% dos itens, ou quando um framework da versão anterior sumiu.
 * Mudança grande no número de ligações só é sinalizada (aviso): a renumeração do SCF junta e separa controles.
 */
export function comparar(antigas, novas, { limite = 2, limiteLigacoes = 15 } = {}) {
  const porId = (xs) => new Map(xs.map((p) => [p.id, p]));
  const a = porId(antigas);
  const n = porId(novas);
  const comuns = [];
  for (const [id, pa] of a) {
    const pn = n.get(id);
    if (!pn) continue;
    const ia = itensDe(pa);
    const inn = itensDe(pn);
    const perdidos = [...ia].filter((i) => !inn.has(i));
    const novos = [...inn].filter((i) => !ia.has(i));
    const perdaPct = ia.size ? (perdidos.length / ia.size) * 100 : 0;
    const varLig = pa.ligacoes.length ? ((pn.ligacoes.length - pa.ligacoes.length) / pa.ligacoes.length) * 100 : 0;
    comuns.push({
      id,
      itensAntes: ia.size,
      itensDepois: inn.size,
      perdidos,
      novos,
      ligacoesAntes: pa.ligacoes.length,
      ligacoesDepois: pn.ligacoes.length,
      perdaPct,
      varLigacoesPct: varLig,
      falha: perdaPct > limite,
      aviso: Math.abs(varLig) > limiteLigacoes,
    });
  }
  const soAntigo = [...a.keys()].filter((id) => !n.has(id));
  const soNovo = [...n.keys()].filter((id) => !a.has(id));
  return { comuns, soAntigo, soNovo, falhas: comuns.filter((c) => c.falha).length + soAntigo.length };
}

/** Frameworks para a conferência à mão: os pedidos por trecho do id ("27002-2022"), cada um com o primeiro que casa. */
export function escolher(novas, trechos) {
  return trechos.flatMap((t) => {
    const p = novas.find((x) => x.id.includes(t));
    return p ? [p] : [];
  });
}

/** Até `n` itens sorteados de cada framework escolhido, com as ligações dos dois lados. `rnd` é injetável para teste. */
export function amostrar(escolhidos, antigas, n = 30, rnd = Math.random) {
  const a = new Map(antigas.map((p) => [p.id, p]));
  return escolhidos.map((p) => {
    const itens = [...itensDe(p)];
    const sorteados = [];
    const alvo = Math.min(n, itens.length); // fixo: itens encolhe a cada item tirado
    while (sorteados.length < alvo) sorteados.push(...itens.splice(Math.floor(rnd() * itens.length), 1));
    const anterior = a.get(p.id);
    return {
      id: p.id,
      itens: sorteados.map((item) => ({
        item,
        nome: p.ligacoes.find((l) => l.item === item)?.itemNome ?? null,
        depois: p.ligacoes.filter((l) => l.item === item).map((l) => `${l.scf} ${l.relacao} ${l.forca ?? "-"}`),
        antes: anterior ? anterior.ligacoes.filter((l) => l.item === item).map((l) => `${l.scf} ${l.relacao} ${l.forca ?? "-"}`) : null,
      })),
    };
  });
}

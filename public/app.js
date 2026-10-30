// ness.KNOW — admin. Todo texto vindo do servidor entra por textContent.
const $ = (s) => document.querySelector(s);
const el = (tag, txt, cls) => {
  const e = document.createElement(tag);
  if (txt != null) e.textContent = txt;
  if (cls) e.className = cls;
  return e;
};
const botao = (txt, cls, aoClicar) => {
  const b = el("button", txt, cls);
  b.type = "button";
  if (aoClicar) b.addEventListener("click", aoClicar);
  return b;
};
const celula = (conteudo, cls) => {
  const td = el("td", null, cls);
  td.append(...[conteudo].flat().filter((x) => x != null).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return td;
};
const esqueleto = (colunas, linhas = 3) =>
  Array.from({ length: linhas }, () => {
    const tr = el("tr", null, "esqueleto");
    for (let i = 0; i < colunas; i++) tr.append(celula(el("span"), i > 1 ? "esconde-estreito" : null));
    return tr;
  });
const vazio = (colunas, titulo, texto) => {
  const tr = el("tr");
  const td = el("td", null, "vazio");
  td.colSpan = colunas;
  td.append(el("strong", titulo), texto);
  tr.append(td);
  return tr;
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Datas (o banco grava UTC sem fuso) ---------- */
const dataDe = (s) => (s ? new Date(`${s.replace(" ", "T")}Z`) : null);
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function quando(s) {
  const d = dataDe(s);
  if (!d || Number.isNaN(+d)) return "nunca";
  const min = Math.round((d - Date.now()) / 60000);
  if (min > -1) return "agora";
  if (min > -60) return rel.format(min, "minute");
  if (min > -60 * 24) return rel.format(Math.round(min / 60), "hour");
  if (min > -60 * 24 * 7) return rel.format(Math.round(min / 1440), "day");
  return fmtData.format(d);
}

/* ---------- API ---------- */
class SemAcesso extends Error {}
async function api(caminho, opcoes = {}) {
  let r;
  try {
    r = await fetch(caminho, { credentials: "same-origin", redirect: "manual", ...opcoes, headers: { "content-type": "application/json", ...(opcoes.headers || {}) } });
  } catch {
    throw new Error("Sem conexão com o ness.KNOW. Confira a internet e tente de novo.");
  }
  if (r.status === 401 || r.status === 403 || r.redirected || r.type === "opaqueredirect") throw new SemAcesso();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ? `${j.erro[0].toUpperCase()}${j.erro.slice(1)}.` : `O servidor respondeu ${r.status}. Tente de novo em instantes.`);
  return j;
}
function falhou(err, destino) {
  if (err instanceof SemAcesso) return document.body.classList.add("fora");
  if (destino) {
    destino.textContent = err.message;
    destino.hidden = false;
  } else (document.querySelector(".painel:not([hidden]) .alerta") ?? document.querySelector(".alerta")).textContent = err.message;
}
$("#entrar").addEventListener("click", () => location.reload());

/* ---------- Abas ---------- */
const abas = [...document.querySelectorAll('[role="tab"]')];
function abrir(id, foco = false) {
  for (const a of abas) {
    const ativa = a.getAttribute("aria-controls") === id;
    a.setAttribute("aria-selected", String(ativa));
    a.tabIndex = ativa ? 0 : -1;
    document.getElementById(a.getAttribute("aria-controls")).hidden = !ativa;
    if (ativa && foco) a.focus();
    if (ativa) a.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
}
abas.forEach((a, i) => {
  a.addEventListener("click", () => abrir(a.getAttribute("aria-controls")));
  a.addEventListener("keydown", (e) => {
    const alvo = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: abas.length - 1 }[e.key];
    if (alvo == null) return;
    e.preventDefault();
    abrir(abas[(alvo + abas.length) % abas.length].getAttribute("aria-controls"), true);
  });
});
const inicial = location.hash.slice(1);
if (abas.some((a) => a.getAttribute("aria-controls") === inicial)) abrir(inicial);

/* ---------- Copiar ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copiar]");
  if (!b) return;
  try {
    await navigator.clipboard.writeText(document.getElementById(b.dataset.copiar).textContent);
    b.textContent = "Copiado";
    b.classList.add("feito");
  } catch {
    b.textContent = "Selecione e copie";
  }
  setTimeout(() => {
    b.textContent = "Copiar";
    b.classList.remove("feito");
  }, 1800);
});
function codigo(id, texto) {
  const d = el("div", null, "codigo");
  const pre = el("pre", texto);
  pre.id = id;
  const b = botao("Copiar", "secundario copiar");
  b.dataset.copiar = id;
  d.append(pre, b);
  return d;
}

/* ---------- Estado ---------- */
let pacotes = [];
let nomes = {};
let chaveAtual = null;
let clienteAtual = "claude-code";
let verRevogadas = false;
const filtro = new Set();
const URL_MCP = `${location.origin}/mcp`;

/* ---------- Receitas ---------- */
const receitas = (chave) => [
  { id: "claude-code", nome: "Claude Code", onde: "No terminal, na pasta do projeto. Acrescente --scope user para valer em todos os projetos.", texto: `claude mcp add --transport http ness-know ${URL_MCP} \\\n  --header "Authorization: Bearer ${chave}"` },
  {
    id: "codex",
    nome: "Codex",
    onde: "Em ~/.codex/config.toml, que vale para a CLI e para a extensão. A chave fica na variável NESS_KNOW_TOKEN do sistema, fora do arquivo.",
    texto: `[mcp_servers.ness-know]\nurl = "${URL_MCP}"\nbearer_token_env_var = "NESS_KNOW_TOKEN"\n\n# a chave, uma vez por máquina:\n# Windows:     setx NESS_KNOW_TOKEN "${chave}"\n# macOS/Linux: export NESS_KNOW_TOKEN="${chave}"`,
  },
  { id: "cursor", nome: "Cursor", onde: "Em .cursor/mcp.json no projeto, ou em ~/.cursor/mcp.json para todos.", texto: JSON.stringify({ mcpServers: { "ness-know": { url: URL_MCP, headers: { Authorization: `Bearer ${chave}` } } } }, null, 2) },
  { id: "vscode", nome: "VS Code", onde: "Em .vscode/mcp.json no projeto, para o Copilot em modo agente.", texto: JSON.stringify({ servers: { "ness-know": { type: "http", url: URL_MCP, headers: { Authorization: `Bearer ${chave}` } } } }, null, 2) },
  {
    id: "claude-desktop",
    nome: "Claude Desktop",
    onde: "Em claude_desktop_config.json (Configurações › Desenvolvedor › Editar config). Usa a ponte mcp-remote e exige Node instalado.",
    texto: JSON.stringify({ mcpServers: { "ness-know": { command: "npx", args: ["-y", "mcp-remote", URL_MCP, "--header", `Authorization: Bearer ${chave}`] } } }, null, 2),
  },
  { id: "chatgpt", nome: "ChatGPT e Claude web", onde: "Ainda não é possível.", texto: "Os conectores do ChatGPT e do claude.ai só aceitam OAuth ou acesso sem autenticação.\nO ness.KNOW usa chave no cabeçalho; por enquanto, use um dos outros agentes.", sem: true },
];

function mostrarReceita() {
  const chave = chaveAtual?.token ?? "SUA_CHAVE";
  const lista = receitas(chave);
  const r = lista.find((x) => x.id === clienteAtual) ?? lista[0];
  for (const b of $("#clientes").children) b.setAttribute("aria-pressed", String(b.dataset.id === r.id));
  $("#receita-onde").textContent = r.onde;
  $("#receita-texto").textContent = r.texto;
  $("#receita-bloco").querySelector(".copiar").hidden = !!r.sem;
  $("#receita-nota").textContent = r.sem || r.id === "codex" ? "" : "A chave fica em texto nesse arquivo. Não o envie ao Git.";
  $("#cmd-conferir").textContent = `curl -s ${URL_MCP} \\\n  -H "Authorization: Bearer ${chave}" \\\n  -H "content-type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listar_pacotes","arguments":{}}}'`;

  const estado = $("#estado-chave");
  estado.classList.toggle("sem", !chaveAtual);
  estado.replaceChildren();
  if (chaveAtual) {
    const t = el("span");
    t.append("Os comandos abaixo já usam a chave de ", el("b", chaveAtual.nome), ". Ela some ao recarregar a página.");
    estado.append(t, botao("Usar SUA_CHAVE", "texto", () => ((chaveAtual = null), mostrarReceita())));
  } else {
    estado.append(el("span", "Os comandos abaixo usam SUA_CHAVE no lugar da chave. Gere uma para sair tudo preenchido."), botao("Gerar chave", "texto", () => (abrir("chaves"), $("#nome").focus())));
  }
}
$("#clientes").append(
  ...receitas("").map((r) => {
    const b = botao(r.nome, "chip", () => ((clienteAtual = r.id), mostrarReceita()));
    b.dataset.id = r.id;
    return b;
  }),
);
$("#url-mcp").textContent = URL_MCP;
mostrarReceita();

/* ---------- Pacotes ---------- */
async function carregarPacotes() {
  $("#lista-pacotes").replaceChildren(...esqueleto(4));
  pacotes = (await api("/api/pacotes")).map((p) => ({ ...p, titulos: lerLista(p.titulos) }));
  nomes = Object.fromEntries(pacotes.map((p) => [p.slug, p.nome]));
  $("#n-pacotes").textContent = pacotes.length || "";

  $("#lista-pacotes").replaceChildren(
    ...(pacotes.length
      ? pacotes.flatMap((p) => {
          const tr = el("tr");
          const detalhe = el("tr", null, "detalhe");
          detalhe.hidden = true;
          const abre = botao(null, "abre");
          abre.setAttribute("aria-expanded", "false");
          abre.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-seta"/></svg>';
          abre.append(p.nome);
          abre.addEventListener("click", () => alternarDocumentos(p, abre, detalhe));
          const nome = [abre];
          if (p.descricao) nome.push(el("span", p.descricao, "sub"));
          nome.push(el("code", p.slug, "sub"));
          tr.append(celula(nome), celula(p.versao || "—", "esconde-estreito"), celula(p.atualizado_em ? fmtData.format(dataDe(p.atualizado_em)) : "—", "esconde-estreito"), celula(String(p.documentos), "num"));
          const td = el("td");
          td.colSpan = 4;
          detalhe.append(td);
          return [tr, detalhe];
        })
      : [vazio(4, "Nenhum pacote carregado", "Use o comando abaixo para carregar o primeiro.")]),
  );

  $("#escolha").replaceChildren(...pacotes.map(blocoPacote));
  if (!pacotes.length) $("#escolha").append(el("p", "Carregue um pacote antes de gerar chaves.", "apoio vazio"));
  atualizarFormulario();

  $("#filtros").replaceChildren(
    ...pacotes.map((p) => {
      const b = botao(p.nome, "chip", () => {
        filtro.has(p.slug) ? filtro.delete(p.slug) : filtro.add(p.slug);
        b.setAttribute("aria-pressed", String(filtro.has(p.slug)));
      });
      b.setAttribute("aria-pressed", "false");
      return b;
    }),
  );
}

async function alternarDocumentos(p, abre, detalhe) {
  const abrindo = abre.getAttribute("aria-expanded") !== "true";
  abre.setAttribute("aria-expanded", String(abrindo));
  detalhe.hidden = !abrindo;
  if (!abrindo || detalhe.dataset.carregado) return;
  const caixa = el("div", null, "docs");
  caixa.append(el("p", "Carregando documentos…", "apoio"));
  detalhe.firstChild.replaceChildren(caixa);
  try {
    const docs = await api(`/api/pacotes/${p.slug}/documentos`);
    detalhe.dataset.carregado = "1";
    if (!docs.length) return caixa.replaceChildren(el("p", "Este pacote ainda não tem documentos.", "apoio"));
    const t = el("table");
    t.innerHTML = '<thead><tr><th>Documento</th><th class="esconde-estreito">Versão</th><th>Situação</th></tr></thead>';
    const corpo = el("tbody");
    for (const d of docs) {
      const tr = el("tr");
      const ok = d.status === "ok";
      const situacao = el("span", ok ? "Pronto" : d.status === "erro" ? "Falhou" : "Processando", `badge ${ok ? "ok" : d.status === "erro" ? "bad" : ""}`);
      const s = [situacao];
      if (d.erro) s.push(el("span", d.erro, "sub"));
      const titulo = [el("span", d.titulo, "nome")];
      if (d.tipo || d.vigencia) titulo.push(el("span", [d.tipo, d.vigencia && `vigência ${d.vigencia}`].filter(Boolean).join(", "), "sub"));
      tr.append(celula(titulo), celula(d.versao || "—", "esconde-estreito"), celula(s));
      corpo.append(tr);
    }
    t.append(corpo);
    caixa.replaceChildren(t);
  } catch (err) {
    caixa.replaceChildren(el("p", err instanceof SemAcesso ? "Sua sessão expirou." : err.message, "erro"));
    if (err instanceof SemAcesso) falhou(err);
  }
}

/* ---------- Chaves ---------- */
let chaves = [];
async function carregarChaves() {
  chaves = await api("/api/chaves");
  desenharChaves();
}
function desenharChaves() {
  const ativas = chaves.filter((c) => c.ativo);
  const revogadas = chaves.length - ativas.length;
  $("#n-chaves").textContent = ativas.length || "";
  const ver = $("#ver-revogadas");
  ver.hidden = !revogadas;
  ver.textContent = verRevogadas ? "Esconder revogadas" : `Mostrar ${plural(revogadas, "revogada", "revogadas")}`;
  const visiveis = verRevogadas ? chaves : ativas;
  $("#lista-chaves").replaceChildren(
    ...(visiveis.length
      ? visiveis.map((c) => {
          const tr = el("tr");
          if (!c.ativo) tr.className = "inativa";
          const criada = dataDe(c.criado_em);
          const nome = [el("span", c.nome, "nome"), el("span", `${c.ativo ? "Criada" : "Revogada; criada"} em ${criada ? fmtData.format(criada) : "—"}`, "sub")];
          const restricoes = lerObjeto(c.documentos);
          const lista = lerLista(c.pacotes).map((s) => {
            const d = el("div", null, "escopo");
            d.append(el("span", nomes[s] ?? s));
            const total = pacotes.find((p) => p.slug === s)?.titulos.length;
            const so = restricoes[s];
            d.append(el("span", so ? `${so.length}${total ? ` de ${total}` : ""} normas: ${so.join(", ")}` : "pacote inteiro", "sub"));
            return d;
          });
          const uso = c.usado_em ? el("span", quando(c.usado_em)) : el("span", "nunca", "apoio");
          if (c.usado_em) uso.title = fmtHora.format(dataDe(c.usado_em));
          const acao = celula(c.ativo ? botao("Revogar", "secundario pequeno", (e) => confirmarRevogacao(c, e.currentTarget.parentElement)) : null, "acao");
          tr.append(celula(nome), celula(lista), celula(uso, "esconde-estreito"), acao);
          return tr;
        })
      : [vazio(4, "Nenhuma chave ativa", "Gere a primeira ao lado para conectar um agente.")]),
  );
}
$("#ver-revogadas").addEventListener("click", () => ((verRevogadas = !verRevogadas), desenharChaves()));

function confirmarRevogacao(c, td) {
  const caixa = el("span", null, "confirma");
  const voltar = () => desenharChaves();
  const sim = botao("Confirmar", "perigo pequeno", async () => {
    sim.disabled = true;
    sim.textContent = "Revogando…";
    try {
      await api(`/api/chaves/${c.id}`, { method: "DELETE" });
      await carregarChaves();
    } catch (err) {
      falhou(err);
      voltar();
    }
  });
  sim.title = "O agente perde o acesso na hora.";
  caixa.append(botao("Cancelar", "secundario pequeno", voltar), sim);
  td.replaceChildren(caixa);
  caixa.addEventListener("keydown", (e) => e.key === "Escape" && voltar());
  sim.focus();
}

/* ---------- Nova chave ---------- */
const lerLista = (x) => {
  try {
    const v = typeof x === "string" ? JSON.parse(x) : x;
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
};
const lerObjeto = (x) => {
  try {
    const v = JSON.parse(x || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/** Um pacote no formulário: caixa do pacote inteiro e, aberta, a lista das normas para escolher uma a uma. */
function blocoPacote(p) {
  const bloco = el("div", null, "pac");
  bloco.dataset.slug = p.slug;
  const topo = el("div", null, "pac-topo");
  const l = el("label");
  const c = el("input");
  Object.assign(c, { type: "checkbox", checked: true, className: "p" });
  const t = el("span", p.nome);
  const resumo = el("small");
  t.append(resumo);
  l.append(c, t);
  const ver = botao(`Normas (${p.titulos.length})`, "texto");
  ver.setAttribute("aria-expanded", "false");
  const normas = el("div", null, "normas");
  normas.hidden = true;
  normas.id = `normas-${p.slug}`;
  ver.setAttribute("aria-controls", normas.id);
  if (!p.titulos.length) ver.hidden = true;
  ver.addEventListener("click", () => {
    normas.hidden = !normas.hidden;
    ver.setAttribute("aria-expanded", String(!normas.hidden));
  });
  for (const titulo of p.titulos) {
    const ln = el("label");
    const cn = el("input");
    Object.assign(cn, { type: "checkbox", checked: true, value: titulo, className: "n" });
    ln.append(cn, el("span", titulo));
    normas.append(ln);
  }
  c.addEventListener("change", () => normas.querySelectorAll("input").forEach((x) => (x.checked = c.checked)));
  topo.append(l, ver);
  bloco.append(topo, normas);
  return bloco;
}

/** Lê o formulário: pacotes com ao menos uma norma marcada e, para os parciais, os títulos escolhidos. */
function escolha() {
  const pacotesEscolhidos = [];
  const documentos = {};
  for (const b of document.querySelectorAll("#escolha .pac")) {
    const todas = [...b.querySelectorAll("input.n")];
    const sim = todas.filter((x) => x.checked).map((x) => x.value);
    const inteiro = todas.length ? sim.length === todas.length : b.querySelector("input.p").checked;
    if (!inteiro && !sim.length) continue;
    pacotesEscolhidos.push(b.dataset.slug);
    if (!inteiro) documentos[b.dataset.slug] = sim;
  }
  return { pacotes: pacotesEscolhidos, documentos };
}

function atualizarFormulario() {
  const blocos = [...document.querySelectorAll("#escolha .pac")];
  for (const b of blocos) {
    const todas = [...b.querySelectorAll("input.n")];
    const n = todas.filter((x) => x.checked).length;
    const p = b.querySelector("input.p");
    if (todas.length) {
      p.checked = n === todas.length;
      p.indeterminate = n > 0 && n < todas.length;
    }
    b.querySelector("small").textContent = !todas.length
      ? "sem normas carregadas"
      : p.checked
        ? "pacote inteiro, inclusive normas futuras"
        : n
          ? `${n} de ${todas.length} normas`
          : "fora desta chave";
  }
  const { pacotes: escolhidos } = escolha();
  const tudo = blocos.every((b) => b.querySelector("input.p").checked);
  $("#todos").hidden = !blocos.length;
  $("#todos").textContent = tudo ? "Desmarcar todos" : "Marcar todos";
  $("#gerar").disabled = !$("#nome").value.trim() || !escolhidos.length;
}
$("#nome").addEventListener("input", atualizarFormulario);
$("#escolha").addEventListener("change", atualizarFormulario);
$("#todos").addEventListener("click", () => {
  const marcar = !document.querySelectorAll("#escolha .pac").length || ![...document.querySelectorAll("#escolha input.p")].every((x) => x.checked);
  document.querySelectorAll("#escolha input").forEach((c) => {
    c.checked = marcar;
    c.indeterminate = false;
  });
  atualizarFormulario();
});

$("#nova").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = $("#nova-erro");
  erro.hidden = true;
  const nome = $("#nome").value.trim();
  const { pacotes: pacotesEscolhidos, documentos } = escolha();
  if (!nome || !pacotesEscolhidos.length) return;
  const b = $("#gerar");
  b.disabled = true;
  b.textContent = "Gerando…";
  try {
    const r = await api("/api/chaves", { method: "POST", body: JSON.stringify({ nome, pacotes: pacotesEscolhidos, documentos }) });
    chaveAtual = { nome, token: r.token };
    mostrarReceita();
    const caixa = el("div", null, "callout");
    caixa.append(el("strong", `Chave de ${nome} criada. Copie agora: ela não aparece de novo.`), codigo("token-novo", r.token), botao("Ver como conectar com esta chave", "texto", () => abrir("conectar", true)));
    $("#nova-saida").replaceChildren(caixa);
    $("#nome").value = "";
    await carregarChaves();
  } catch (err) {
    falhou(err, erro);
  } finally {
    b.textContent = "Gerar chave";
    atualizarFormulario();
  }
});

/* ---------- Teste de busca ---------- */
const ORIGEM = { textual: "por palavras", semantica: "por significado", hibrida: "combinada" };
$("#teste").addEventListener("submit", async (e) => {
  e.preventDefault();
  const consulta = $("#consulta").value.trim();
  if (!consulta) return $("#consulta").focus();
  const out = $("#resultado");
  const b = $("#buscar");
  b.disabled = true;
  b.textContent = "Buscando…";
  out.replaceChildren(el("p", "Procurando nos pacotes…", "resumo"));
  const inicio = performance.now();
  try {
    const r = await api("/api/busca", { method: "POST", body: JSON.stringify({ consulta, limite: 8, modo: $("#modo").value, pacotes: [...filtro] }) });
    const ms = Math.round(performance.now() - inicio);
    const onde = filtro.size ? [...filtro].map((s) => nomes[s] ?? s).join(", ") : "todos os pacotes";
    const resumo = el("div", null, "resumo");
    resumo.append(el("span", `${plural(r.length, "trecho", "trechos")} em ${onde}`), el("span", `${ms} ms`));
    if (!r.length) {
      const v = el("div", null, "vazio");
      v.append(el("strong", "Nenhum trecho encontrado"), "Tente outras palavras, o código da cláusula (ex.: A.5.24) ou a busca por significado.");
      return out.replaceChildren(resumo, v);
    }
    out.replaceChildren(
      resumo,
      ...r.map((t, i) => {
        const d = el("article", null, "trecho");
        const corpo = el("div");
        const meta = el("div", null, "info");
        if (t.versao) meta.append(el("span", `versão ${t.versao}`));
        meta.append(el("span", `encontrado ${ORIGEM[t.origem] ?? t.origem}`));
        corpo.append(el("h3", t.secao ? `${t.titulo}, ${t.secao}` : t.titulo), meta, el("p", t.trecho));
        d.append(el("span", String(i + 1), "pos"), corpo);
        return d;
      }),
    );
  } catch (err) {
    if (err instanceof SemAcesso) return falhou(err);
    out.replaceChildren(el("p", err.message, "erro resumo"));
  } finally {
    b.disabled = false;
    b.textContent = "Buscar";
  }
});

/* ---------- Início ---------- */
(async () => {
  $("#lista-chaves").replaceChildren(...esqueleto(4));
  try {
    $("#eu").textContent = (await api("/api/eu")).email;
    await carregarPacotes();
    await carregarChaves();
  } catch (err) {
    falhou(err);
  }
})();

// ness.KNOW — admin. Todo texto vindo do servidor entra por textContent.
const $ = (s) => document.querySelector(s);
const el = (tag, txt, cls) => {
  const e = document.createElement(tag);
  if (txt != null) e.textContent = txt;
  if (cls) e.className = cls;
  return e;
};
const linha = (...celulas) => {
  const tr = el("tr");
  for (const c of celulas) {
    const td = el("td");
    if (c && typeof c === "object" && "cls" in c) {
      td.className = c.cls;
      td.append(c.v ?? "");
    } else td.append(c instanceof Node ? c : document.createTextNode(c ?? ""));
    tr.append(td);
  }
  return tr;
};
const vazio = (colunas, texto) => {
  const tr = el("tr");
  const td = el("td", texto, "vazio");
  td.colSpan = colunas;
  tr.append(td);
  return tr;
};

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, { credentials: "same-origin", ...opcoes, headers: { "content-type": "application/json", ...(opcoes.headers || {}) } });
  if (r.status === 401 || r.redirected) throw new Error("Sua sessão expirou ou este e-mail não tem acesso. Recarregue a página para entrar de novo.");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `O servidor respondeu ${r.status}. Tente de novo.`);
  return j;
}

/* ---------- Abas ---------- */
const abas = [...document.querySelectorAll('[role="tab"]')];
function abrir(id, foco = false) {
  for (const a of abas) {
    const ativa = a.getAttribute("aria-controls") === id;
    a.setAttribute("aria-selected", String(ativa));
    a.tabIndex = ativa ? 0 : -1;
    document.getElementById(a.getAttribute("aria-controls")).hidden = !ativa;
    if (ativa && foco) a.focus();
  }
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
}
abas.forEach((a, i) => {
  a.addEventListener("click", () => abrir(a.getAttribute("aria-controls")));
  a.addEventListener("keydown", (e) => {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!passo) return;
    e.preventDefault();
    abrir(abas[(i + passo + abas.length) % abas.length].getAttribute("aria-controls"), true);
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
  } catch {
    b.textContent = "Selecione e copie";
  }
  setTimeout(() => (b.textContent = "Copiar"), 1800);
});
function blocoCopiavel(id, texto) {
  const d = el("div", null, "bloco");
  const pre = el("pre", texto);
  pre.id = id;
  const b = el("button", "Copiar", "secundario copiar");
  Object.assign(b, { type: "button" });
  b.dataset.copiar = id;
  d.append(pre, b);
  return d;
}

/* ---------- Receitas ---------- */
const URL_MCP = `${location.origin}/mcp`;
let chaveAtual = null;
let clienteAtual = "claude-code";

const receitas = (chave) => [
  { id: "claude-code", nome: "Claude Code", onde: "Terminal, na pasta do projeto. Acrescente --scope user para valer em todos os projetos.", texto: `claude mcp add --transport http ness-know ${URL_MCP} --header "Authorization: Bearer ${chave}"` },
  {
    id: "codex",
    nome: "Codex",
    onde: "~/.codex/config.toml (vale para a CLI e para a extensão). A chave fica na variável NESS_KNOW_TOKEN do sistema.",
    texto: `[mcp_servers.ness-know]\nurl = "${URL_MCP}"\nbearer_token_env_var = "NESS_KNOW_TOKEN"\n\n# a chave, uma vez por máquina:\n# Windows:     setx NESS_KNOW_TOKEN "${chave}"\n# macOS/Linux: export NESS_KNOW_TOKEN="${chave}"`,
  },
  { id: "cursor", nome: "Cursor", onde: ".cursor/mcp.json no projeto, ou ~/.cursor/mcp.json para todos.", texto: JSON.stringify({ mcpServers: { "ness-know": { url: URL_MCP, headers: { Authorization: `Bearer ${chave}` } } } }, null, 2) },
  { id: "vscode", nome: "VS Code", onde: ".vscode/mcp.json no projeto (Copilot em modo agente).", texto: JSON.stringify({ servers: { "ness-know": { type: "http", url: URL_MCP, headers: { Authorization: `Bearer ${chave}` } } } }, null, 2) },
  {
    id: "claude-desktop",
    nome: "Claude Desktop",
    onde: "claude_desktop_config.json, em Configurações › Desenvolvedor › Editar config. Usa a ponte mcp-remote e exige Node instalado.",
    texto: JSON.stringify({ mcpServers: { "ness-know": { command: "npx", args: ["-y", "mcp-remote", URL_MCP, "--header", `Authorization: Bearer ${chave}`] } } }, null, 2),
  },
  { id: "chatgpt", nome: "ChatGPT e Claude web", onde: "Ainda não suportado.", texto: "Os conectores do ChatGPT e do claude.ai só aceitam OAuth ou acesso sem autenticação.\nO ness.KNOW usa chave no cabeçalho; use um dos outros clientes por enquanto.", sem: true },
];

function mostrarReceita() {
  const lista = receitas(chaveAtual?.token ?? "SUA_CHAVE");
  const r = lista.find((x) => x.id === clienteAtual) ?? lista[0];
  for (const b of $("#clientes").children) b.setAttribute("aria-pressed", String(b.dataset.id === r.id));
  $("#receita-onde").textContent = r.onde;
  $("#receita-texto").textContent = r.texto;
  $("#receita-texto").nextElementSibling.hidden = !!r.sem;
  $("#receita-nota").textContent = r.sem ? "" : "A chave vai em texto no arquivo de configuração. Não versione esse arquivo; no Codex ela fica fora dele.";
  const estado = $("#estado-chave");
  estado.replaceChildren();
  if (chaveAtual) estado.append("Receita preenchida com a chave de ", el("b", chaveAtual.nome), ", gerada agora. Ela some ao recarregar a página.");
  else {
    const ir = el("button", "Gere uma chave", "link");
    ir.type = "button";
    ir.addEventListener("click", () => abrir("chaves", true));
    estado.append(ir, " e a receita sai preenchida com ela. Até lá aparece SUA_CHAVE.");
  }
}
$("#clientes").append(
  ...receitas("").map((r) => {
    const b = el("button", r.nome);
    b.type = "button";
    b.dataset.id = r.id;
    b.addEventListener("click", () => ((clienteAtual = r.id), mostrarReceita()));
    return b;
  }),
);
$("#url-mcp").textContent = URL_MCP;
mostrarReceita();

/* ---------- Dados ---------- */
let nomes = {};
async function carregarPacotes() {
  const pacotes = await api("/api/pacotes");
  nomes = Object.fromEntries(pacotes.map((p) => [p.slug, p.nome]));
  $("#n-pacotes").textContent = pacotes.length || "";
  $("#lista-pacotes").replaceChildren(
    ...(pacotes.length
      ? pacotes.map((p) => linha(p.nome, { cls: "esconde-estreito", v: el("code", p.slug) }, p.versao || "", { cls: "num", v: String(p.documentos) }))
      : [vazio(4, "Nenhum pacote carregado. Use o script abaixo para criar o primeiro.")]),
  );
  $("#escolha").replaceChildren(
    ...pacotes.map((p) => {
      const l = el("label");
      const c = el("input");
      Object.assign(c, { type: "checkbox", value: p.slug, checked: true });
      const t = el("span", p.nome);
      t.append(el("small", `${p.documentos} documento${p.documentos === 1 ? "" : "s"}`));
      l.append(c, t);
      return l;
    }),
  );
  if (!pacotes.length) $("#escolha").append(el("span", "Nenhum pacote carregado ainda.", "apoio"));
}

async function carregarChaves() {
  const chaves = await api("/api/chaves");
  $("#n-chaves").textContent = chaves.filter((c) => c.ativo).length || "";
  $("#lista-chaves").replaceChildren(
    ...(chaves.length
      ? chaves.map((c) => {
          const acao = c.ativo ? el("button", "Revogar", "secundario") : el("span", "revogada", "rev");
          if (c.ativo) {
            acao.type = "button";
            acao.addEventListener("click", async () => {
              if (!confirm(`Revogar a chave de "${c.nome}"? Quem usa perde o acesso na hora.`)) return;
              try {
                await api(`/api/chaves/${c.id}`, { method: "DELETE" });
                carregarChaves();
              } catch (err) {
                $("#aviso").textContent = err.message;
              }
            });
          }
          const tr = linha(c.nome, JSON.parse(c.pacotes || "[]").map((s) => nomes[s] ?? s).join(", "), { cls: "esconde-estreito", v: c.usado_em || "nunca" }, acao);
          if (!c.ativo) tr.className = "inativa";
          return tr;
        })
      : [vazio(4, "Nenhuma chave emitida. Gere a primeira ao lado.")]),
  );
}

$("#nova").addEventListener("submit", async (e) => {
  e.preventDefault();
  const saida = $("#nova-saida");
  const pacotes = [...document.querySelectorAll("#escolha input:checked")].map((c) => c.value);
  if (!pacotes.length) return saida.replaceChildren(el("p", "Marque ao menos um pacote.", "erro"));
  const botao = e.submitter;
  botao.disabled = true;
  try {
    const nome = $("#nome").value.trim();
    const r = await api("/api/chaves", { method: "POST", body: JSON.stringify({ nome, pacotes }) });
    chaveAtual = { nome, token: r.token };
    mostrarReceita();
    const caixa = el("div", null, "callout");
    const ir = el("button", "Ver como conectar com esta chave", "link");
    ir.type = "button";
    ir.addEventListener("click", () => abrir("conectar", true));
    caixa.append(el("strong", "Copie a chave agora. Ela não aparece de novo."), blocoCopiavel("token-novo", r.token), ir);
    saida.replaceChildren(caixa);
    $("#nome").value = "";
    carregarChaves();
  } catch (err) {
    saida.replaceChildren(el("p", err.message, "erro"));
  } finally {
    botao.disabled = false;
  }
});

$("#teste").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $("#resultado");
  out.replaceChildren(el("p", "Buscando…", "apoio"));
  try {
    const r = await api("/api/busca", { method: "POST", body: JSON.stringify({ consulta: $("#consulta").value, limite: 8 }) });
    if (!r.length) return out.replaceChildren(el("p", "Nenhum trecho encontrado. Tente outras palavras ou o código da cláusula.", "apoio"));
    out.replaceChildren(
      ...r.map((t) => {
        const d = el("article", null, "trecho");
        d.append(
          el("h3", `${t.titulo}${t.secao ? `, ${t.secao}` : ""}`),
          el("span", `${t.versao ? `versão ${t.versao}, ` : ""}busca ${t.origem}`, "meta"),
          el("p", t.trecho),
        );
        return d;
      }),
    );
  } catch (err) {
    out.replaceChildren(el("p", err.message, "erro"));
  }
});

(async () => {
  try {
    $("#eu").textContent = (await api("/api/eu")).email;
    await carregarPacotes();
    await carregarChaves();
  } catch (err) {
    $("#aviso").textContent = err.message;
  }
})();

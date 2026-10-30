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
    td.append(c instanceof Node ? c : document.createTextNode(c ?? ""));
    tr.append(td);
  }
  return tr;
};

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, { credentials: "same-origin", ...opcoes, headers: { "content-type": "application/json", ...(opcoes.headers || {}) } });
  if (r.status === 401 || r.redirected) throw new Error("sessão expirada ou sem permissão; recarregue a página");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
  return j;
}

const URL_MCP = `${location.origin}/mcp`;

async function carregarPacotes() {
  const pacotes = await api("/api/pacotes");
  $("#pacotes").replaceChildren(...pacotes.map((p) => linha(p.slug, p.nome, p.versao || "", String(p.documentos))));
  $("#escolha").replaceChildren(
    ...pacotes.map((p) => {
      const l = el("label");
      const c = el("input");
      Object.assign(c, { type: "checkbox", value: p.slug, checked: true });
      l.append(c, document.createTextNode(p.nome));
      return l;
    }),
  );
  if (!pacotes.length) $("#escolha").append(el("span", "Nenhum pacote carregado ainda.", "apoio"));
}

async function carregarChaves() {
  const chaves = await api("/api/chaves");
  $("#chaves").replaceChildren(
    ...chaves.map((c) => {
      const acao = c.ativo ? el("button", "Revogar", "secundario") : el("span", "revogada", "apoio");
      if (c.ativo)
        acao.addEventListener("click", async () => {
          if (!confirm(`Revogar a chave "${c.nome}"? Quem usa para de acessar na hora.`)) return;
          await api(`/api/chaves/${c.id}`, { method: "DELETE" });
          carregarChaves();
        });
      return linha(c.nome, JSON.parse(c.pacotes || "[]").join(", "), c.usado_em || "nunca", acao);
    }),
  );
}

$("#nova").addEventListener("submit", async (e) => {
  e.preventDefault();
  const saida = $("#nova-saida");
  const pacotes = [...document.querySelectorAll("#escolha input:checked")].map((c) => c.value);
  try {
    const r = await api("/api/chaves", { method: "POST", body: JSON.stringify({ nome: $("#nome").value, pacotes }) });
    const caixa = el("div", null, "callout");
    caixa.append(
      el("strong", "Copie agora: esta chave não aparece de novo."),
      el("pre", r.token),
      el("p", "Endereço MCP (HTTP):", "apoio"),
      el("pre", URL_MCP),
      el("p", "Claude Code:", "apoio"),
      el("pre", `claude mcp add --transport http ness-know ${URL_MCP} --header "Authorization: Bearer ${r.token}"`),
    );
    saida.replaceChildren(caixa);
    $("#nome").value = "";
    carregarChaves();
  } catch (err) {
    saida.replaceChildren(el("p", err.message, "erro"));
  }
});

$("#teste").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $("#resultado");
  out.replaceChildren(el("p", "Buscando…", "apoio"));
  try {
    const r = await api("/api/busca", { method: "POST", body: JSON.stringify({ consulta: $("#consulta").value, limite: 8 }) });
    if (!r.length) return out.replaceChildren(el("p", "Nada encontrado.", "apoio"));
    out.replaceChildren(
      ...r.map((t) => {
        const d = el("div", null, "trecho");
        d.append(el("h2", `${t.titulo}${t.versao ? ` (${t.versao})` : ""}${t.secao ? ` · ${t.secao}` : ""}`), el("span", `busca ${t.origem}`, "apoio"), el("p", t.trecho));
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
    await Promise.all([carregarPacotes(), carregarChaves()]);
  } catch (err) {
    document.querySelector("main").prepend(el("p", err.message, "erro"));
  }
})();

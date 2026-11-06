// Lê um SKILL.md: frontmatter (name, description, version, normas, buscas) e corpo. O `normas` é um bloco com um pacote por linha e
// a lista de títulos em JSON: `  seguranca-conformidade: ["ISO 27001"]`. O `buscas` é um bloco de itens `  - texto da busca`.
export function lerSkill(texto) {
  const m = texto.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("SKILL.md sem frontmatter");
  const campos = {};
  const normas = {};
  const buscas = [];
  let emNormas = false;
  let emBuscas = false;
  for (const linha of m[1].split("\n")) {
    if (/^normas:\s*$/.test(linha)) {
      emNormas = true;
      emBuscas = false;
      continue;
    }
    if (/^buscas:\s*$/.test(linha)) {
      emBuscas = true;
      emNormas = false;
      continue;
    }
    const item = emBuscas && linha.match(/^\s+-\s+(.+?)\s*$/);
    if (item) {
      buscas.push(item[1]);
      continue;
    }
    const filho = emNormas && linha.match(/^\s+([a-z0-9-]+):\s*(\[.*\])\s*$/);
    if (filho) {
      normas[filho[1]] = JSON.parse(filho[2]);
      continue;
    }
    emNormas = false;
    emBuscas = false;
    const k = linha.match(/^([a-z]+):\s*(.*)$/);
    if (k) campos[k[1]] = k[2].trim();
  }
  if (!campos.name) throw new Error("SKILL.md sem name");
  if (!campos.description) throw new Error("SKILL.md sem description");
  return { nome: campos.name, descricao: campos.description, versao: campos.version ?? null, normas, buscas, corpo: m[2].trim() };
}

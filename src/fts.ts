// Consulta FTS5 a partir de texto livre: termos de 4+ letras e códigos de cláusula como frase.
export function consultaFts(pergunta: string): string | null {
  const t = pergunta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Códigos (A.8.16, CLD.9.5.1, 8.3.4.2, Art. 6) viram frase: o FTS separa "a.8.16" em a / 8 / 16, curtos demais para virar termo.
  const codigos = (t.match(/\b(?:[a-z]{1,4}\.\s?)?\d+(?:\.\d+)+\b|\bart\.?\s?\d+/g) ?? []).map((c) => c.split(/[^a-z0-9]+/).filter(Boolean).join(" "));
  const termos = [...new Set([...codigos, ...(t.match(/[a-z0-9]{4,}/g) ?? [])])];
  return termos.length ? termos.slice(0, 8).map((x) => `"${x}"`).join(" OR ") : null;
}

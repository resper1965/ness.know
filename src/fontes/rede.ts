// Endereços e redes (CIDR) em números, para saber se um IP cai dentro de uma rede listada. IPv4 e IPv6, sem dependência.
export type Familia = 4 | 6;
export interface Ip {
  fam: Familia;
  n: bigint;
}
export interface Rede {
  fam: Familia;
  ini: bigint;
  fim: bigint;
  /** Forma canônica para guardar e comparar: endereço em minúsculas e prefixo. */
  canon: string;
}

export function parseIp(texto: string): Ip | null {
  const s = texto.trim().toLowerCase();
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    return o.every((x) => x <= 255) ? { fam: 4, n: BigInt(((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3]) } : null;
  }
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(":") || /:::/.test(s) || (s.match(/::/g) ?? []).length > 1) return null;
  const [cabeca, cauda] = s.split("::");
  const grupos = (p: string | undefined) => (p ? p.split(":") : []);
  const a = grupos(cabeca);
  const b = s.includes("::") ? grupos(cauda) : [];
  const completo = s.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  if ((s.includes("::") && a.length + b.length > 7) || completo.length !== 8 || completo.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return { fam: 6, n: completo.reduce((acc, g) => (acc << 16n) | BigInt(`0x${g}`), 0n) };
}

export function parseCidr(texto: string): Rede | null {
  const m = texto.trim().toLowerCase().match(/^([^/]+)\/(\d{1,3})$/);
  if (!m) return null;
  const ip = parseIp(m[1]);
  const bits = ip?.fam === 4 ? 32 : 128;
  const prefixo = Number(m[2]);
  if (!ip || prefixo > bits) return null;
  const host = BigInt(bits - prefixo);
  const ini = (ip.n >> host) << host;
  return { fam: ip.fam, ini, fim: ini | ((1n << host) - 1n), canon: `${m[1]}/${prefixo}` };
}

/** Chave de texto de largura fixa: a comparação de texto no SQL vale como comparação de número, dentro da mesma família. */
export const chave = (fam: Familia, n: bigint): string => `${fam}:${n.toString(16).padStart(fam === 4 ? 8 : 32, "0")}`;

import { describe, expect, it } from "vitest";
import { chave, parseCidr, parseIp } from "../src/fontes/rede";

describe("rede: IPs e CIDRs em números", () => {
  it("IPv4: valida os quatro números e a ordem", () => {
    expect(parseIp("1.2.3.4")).toEqual({ fam: 4, n: 16909060n });
    for (const ruim of ["1.2.3", "1.2.3.256", "1.2.3.4.5", "a.b.c.d", "1.2.3.4/24", ""]) expect(parseIp(ruim), ruim).toBeNull();
  });
  it("IPv6: aceita :: e rejeita o que não fecha 8 grupos", () => {
    expect(parseIp("::1")).toEqual({ fam: 6, n: 1n });
    expect(parseIp("2001:db8::1")!.n).toBe(0x20010db8000000000000000000000001n);
    expect(parseIp("2001:DB8:0:0:0:0:0:1")!.n).toBe(parseIp("2001:db8::1")!.n);
    for (const ruim of ["1::2::3", "2001:db8:::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "gggg::1", "12345::1", ":"]) expect(parseIp(ruim), ruim).toBeNull();
  });
  it("CIDR: faixa inicial e final, prefixo válido, e a forma canônica", () => {
    expect(parseCidr("1.10.16.0/20")).toMatchObject({ fam: 4, canon: "1.10.16.0/20" });
    const r = parseCidr("1.10.16.0/20")!;
    expect(r.fim - r.ini).toBe(4095n);
    const meio = parseCidr("10.1.2.3/24")!; // bits de host são zerados na faixa
    expect(meio.ini).toBe(parseIp("10.1.2.0")!.n);
    expect(meio.fim).toBe(parseIp("10.1.2.255")!.n);
    expect(parseCidr("1.2.3.4/32")!.ini).toBe(parseCidr("1.2.3.4/32")!.fim);
    expect(parseCidr("2001:678:254::/48")).toMatchObject({ fam: 6, canon: "2001:678:254::/48" });
    for (const ruim of ["1.2.3.4/33", "1.2.3.4", "1.2.3.4/", "/24", "1.2.3.4/x", "::1/129", "300.1.1.1/8"]) expect(parseCidr(ruim), ruim).toBeNull();
  });
  it("a chave de texto ordena como o número, dentro da família", () => {
    const a = chave(4, parseIp("9.255.255.255")!.n);
    const b = chave(4, parseIp("10.0.0.0")!.n);
    expect(a < b).toBe(true);
    expect(chave(6, parseIp("2001:db8::1")!.n) < chave(6, parseIp("2001:db8::2")!.n)).toBe(true);
    expect(chave(4, 1n)).toHaveLength(10);
    expect(chave(6, 1n)).toHaveLength(34);
  });
});

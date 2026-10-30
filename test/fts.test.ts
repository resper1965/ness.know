import { describe, expect, it } from "vitest";
import { consultaFts } from "../src/fts";

describe("fts", () => {
  it("consultaFts tira acento, curtas e duplicadas", () => {
    expect(consultaFts("Qual a situação do link? link")).toBe('"qual" OR "situacao" OR "link"');
    expect(consultaFts("o que diz o A.8.16 e o Art. 6º?")).toBe('"a 8 16" OR "art 6"');
    expect(consultaFts("controle CLD.9.5.1 da 27017")).toBe('"cld 9 5 1" OR "controle" OR "27017"');
    expect(consultaFts("ok e a")).toBeNull();
  });
});

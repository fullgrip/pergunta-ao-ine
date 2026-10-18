import { describe, expect, it } from "vitest";
import { questionConstraints } from "../lib/analysis";
import { followUpQuestions } from "../lib/followups";

const ALL = ["0014711", "0012653", "0012918", "0012136", "0013312", "0012765", "0014137", "0012255", "0012256", "0012909", "0013044", "0012260", "0014580", "0013249"];

describe("perguntas seguintes", () => {
  it("sugere temas relacionados e uma comparação", () => {
    expect(followUpQuestions({ indicatorId: "0014711", territories: ["Faro"] })).toEqual([
      "Quanto se ganha em Faro?", "Quanto custa comprar casa em Faro?", "Rendas em Faro e em Portimão",
    ]);
    expect(followUpQuestions({ indicatorId: "0012260", territories: ["Faro"] }, "en")).toEqual(["How many people live in Faro?", "How much do people earn in Faro?", "Crime in Faro and Portimão"]);
  });

  it("cada sugestão, em PT e EN, é reconhecida no tema certo pela própria app", () => {
    for (const id of ALL) for (const lang of ["pt", "en"] as const) {
      const place = id === "0012136" ? "Algarve" : "Lagos";
      for (const question of followUpQuestions({ indicatorId: id, territories: [place] }, lang)) {
        const parsed = questionConstraints(question);
        expect(parsed.territoryIds.length, question).toBeGreaterThan(0);
        expect(ALL, question).toContain(parsed.indicatorId);
      }
    }
  });

  it("a comparação junta as duas cidades no tema da resposta", () => {
    const [, , comparison] = followUpQuestions({ indicatorId: "0012653", territories: ["Lagos"] });
    const parsed = questionConstraints(comparison);
    expect(parsed.indicatorId).toBe("0012653");
    expect(parsed.territoryIds).toHaveLength(2);
  });
});

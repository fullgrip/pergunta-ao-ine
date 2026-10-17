import { describe, expect, it } from "vitest";
import { sameQuarterComparison, seriesSummary } from "../lib/analysis";
import { verifiedSnapshot } from "../lib/ine/snapshot";
import { getIndicator } from "../lib/ine/catalog";

const indicator = getIndicator("0012136")!;
const territory = indicator.supportedTerritories[0];

describe("comparação homóloga do desemprego", () => {
  it("conserva os oito trimestres oficiais e compara o segundo trimestre homólogo", () => {
    const observations = verifiedSnapshot(indicator, territory)?.observations ?? [];
    expect(observations).toHaveLength(8);
    const comparison = sameQuarterComparison(observations);
    expect(comparison?.previous.periodCode).toBe("S5A20252");
    expect(comparison?.previous.value).toBe(4.5);
    expect(comparison?.current.periodCode).toBe("S5A20262");
    expect(comparison?.current.value).toBe(4.2);
    expect(comparison?.percentagePointChange).toBeCloseTo(-0.3);
    expect(seriesSummary(observations)?.first.periodCode).toBe("S5A20252");
  });

  it("não conclui uma tendência a partir de trimestres diferentes", () => {
    const observations = verifiedSnapshot(indicator, territory)?.observations ?? [];
    const recent = observations.slice(-4);
    expect(sameQuarterComparison(recent)).toBeNull();
    expect(seriesSummary(recent)?.absolute).toBeNull();
  });
});

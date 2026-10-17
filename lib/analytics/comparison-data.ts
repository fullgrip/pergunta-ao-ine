import verifiedRents from "@/data/snapshots/rent-four-municipalities-2021-2025.json";
import { buildComparison } from "@/lib/analytics/comparison";
import { citySnapshot, type CitySeries } from "@/lib/city";
import { getIndicator } from "@/lib/ine/catalog";
import { readSavedObservation, type SavedObservation } from "@/lib/ine/observation-store";
import type { Indicator, Territory } from "@/lib/ine/types";
import { getMunicipalityById } from "@/lib/municipalities";
import { COMPARISON_INDICATORS, DEFAULT_COMPARISON_IDS } from "./comparison-options";

export { COMPARISON_INDICATORS, DEFAULT_COMPARISON_IDS };

export function comparisonIndicator(slug: string): Indicator | null {
  if (!COMPARISON_INDICATORS.includes(slug as (typeof COMPARISON_INDICATORS)[number])) return null;
  return getIndicator(slug) ?? null;
}

export function comparisonTerritories(ids: string[]): Territory[] | null {
  if (ids.length < 2 || ids.length > 4 || new Set(ids).size !== ids.length) return null;
  const found = ids.map(getMunicipalityById);
  return found.every(Boolean) ? found as Territory[] : null;
}

export function seededComparisonSeries(): CitySeries[] {
  const otherPortimaoIndicators = citySnapshot("portimao")?.series.filter((item) => item.indicatorId !== "0014711") ?? [];
  return [...(verifiedRents as { series: CitySeries[] }).series, ...otherPortimaoIndicators];
}

export function comparisonPeriod(indicator: Indicator): { period: string; periodCode: string } {
  const period = indicator.years.at(-1) ?? "2025";
  return { period, periodCode: `S7A${period}` };
}

function savedAsSeries(saved: SavedObservation, indicator: Indicator, territory: Territory): CitySeries {
  return {
    theme: indicator.id === "0014711" ? "Habitação" : indicator.id === "0012918" ? "População" : indicator.id === "0012653" ? "Rendimento" : indicator.id === "0013312" ? "Turismo" : "Ambiente",
    indicatorId: indicator.id, indicatorName: indicator.name, description: indicator.dimensionDescription,
    unit: indicator.unit, territoryId: territory.id, territory: territory.name, sourceUrl: indicator.sourceUrl,
    observations: [{ period: saved.period, periodCode: saved.periodCode, value: saved.value,
      displayValue: saved.displayValue, sourceUrl: saved.sourceUrl, collectedAt: saved.savedAt.slice(0, 10) }],
  };
}

/** Reads only bundled and persisted, verified observations; never calls the INE. */
export async function loadComparison(indicator: Indicator, territories: Territory[]) {
  const seeded = seededComparisonSeries();
  const { periodCode } = comparisonPeriod(indicator);
  const saved = await Promise.all(territories.map(async (territory) => {
    if (seeded.some((item) => item.indicatorId === indicator.id && item.territoryId === territory.id &&
      item.observations.some((row) => row.periodCode === periodCode && row.value !== null))) return null;
    return readSavedObservation(indicator.id, territory.id, periodCode);
  }));
  const additional = saved.flatMap((item, index) => item ? [savedAsSeries(item, indicator, territories[index])] : []);
  return buildComparison(territories, indicator, [...seeded, ...additional], verifiedRents.collectedAt.slice(0, 10));
}

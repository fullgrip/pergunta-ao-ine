import type { CitySeries } from "../city";
import type { Indicator, Territory } from "../ine/types";

export type ComparisonCell = {
  territoryId: string;
  territory: string;
  value: number | null;
  displayValue: string;
  sourceUrl: string | null;
  collectedAt: string | null;
};

export type ComparisonPeriod = {
  period: string;
  periodCode: string;
  cells: ComparisonCell[];
};

export type ComparisonRank = {
  territoryId: string;
  territory: string;
  value: number;
  rank: number;
  sourceUrl: string;
};

export type ComparisonResult = {
  indicator: Pick<Indicator, "id" | "name" | "shortName" | "unit" | "frequency" | "dimensionDescription" | "sourceUrl">;
  territories: Territory[];
  periods: ComparisonPeriod[];
  selectedPeriod: string | null;
  selectedPeriodCode: string | null;
  ranking: ComparisonRank[];
  rankingReason: string | null;
  availableCount: number;
  snapshotDate: string;
  sourceMode: "verified_snapshot";
};

function periodOrder(value: string): number {
  const year = Number(value.match(/20\d{2}/)?.[0] ?? 0);
  const quarter = Number(value.match(/S5A20\d{2}([1-4])/)?.[1] ?? 0);
  return year * 10 + quarter;
}

/** Aligns observations by official period code. A rank is valid only with one value for every selected city. */
export function buildComparison(
  territories: Territory[],
  indicator: Indicator,
  series: CitySeries[],
  snapshotDate: string,
): ComparisonResult {
  const relevant = series.filter((item) => item.indicatorId === indicator.id && item.unit === indicator.unit);
  const periods = new Map<string, string>();
  const observations = new Map<string, CitySeries["observations"][number]>();
  for (const item of relevant) for (const observation of item.observations) {
    periods.set(observation.periodCode, observation.period);
    const key = `${item.territoryId}:${observation.periodCode}`;
    const previous = observations.get(key);
    if (!previous || previous.value === null && observation.value !== null ||
      previous.value !== null && observation.value !== null && (observation.collectedAt ?? "") > (previous.collectedAt ?? "")) {
      observations.set(key, observation);
    }
  }
  const aligned = [...periods]
    .sort(([a], [b]) => periodOrder(a) - periodOrder(b) || a.localeCompare(b))
    .map(([periodCode, period]) => ({
      period,
      periodCode,
      cells: territories.map((territory): ComparisonCell => {
        const observation = observations.get(`${territory.id}:${periodCode}`);
        return {
          territoryId: territory.id,
          territory: territory.name,
          value: observation?.value ?? null,
          displayValue: observation?.value == null ? "Sem dado" : observation.displayValue,
          sourceUrl: observation?.value == null ? null : observation.sourceUrl,
          collectedAt: observation?.value == null ? null : observation.collectedAt ?? snapshotDate,
        };
      }),
    }));
  const latestCommon = [...aligned].reverse().find((period) => period.cells.every((cell) => cell.value !== null));
  const selected = latestCommon ?? aligned.at(-1);
  const availableCount = selected?.cells.filter((cell) => cell.value !== null).length ?? 0;
  const complete = territories.length >= 2 && availableCount === territories.length;
  const ranking = complete && selected ? selected.cells
    .filter((cell): cell is ComparisonCell & { value: number; sourceUrl: string } => cell.value !== null && cell.sourceUrl !== null)
    .sort((a, b) => b.value - a.value || a.territory.localeCompare(b.territory, "pt-PT"))
    .map((cell, index) => ({ territoryId: cell.territoryId, territory: cell.territory, value: cell.value, rank: index + 1, sourceUrl: cell.sourceUrl })) : [];
  const rankingReason = complete ? null : territories.length < 2
    ? "Seleciona pelo menos dois municípios para comparar."
    : !selected
      ? "Ainda não há observações verificadas para este indicador e estes municípios."
      : `Faltam valores do mesmo período para ${territories.length - availableCount} dos ${territories.length} municípios selecionados. Sem dados comparáveis, não há ranking.`;
  return {
    indicator: { id: indicator.id, name: indicator.name, shortName: indicator.shortName, unit: indicator.unit, frequency: indicator.frequency, dimensionDescription: indicator.dimensionDescription, sourceUrl: indicator.sourceUrl },
    territories, periods: aligned, selectedPeriod: selected?.period ?? null, selectedPeriodCode: selected?.periodCode ?? null,
    ranking, rankingReason, availableCount, snapshotDate, sourceMode: "verified_snapshot",
  };
}

import portimao from "../../data/snapshots/portimao-2026-10-17.json";
import algarve from "../../data/snapshots/algarve-unemployment-2026-q2.json";
import rentBatch from "../../data/snapshots/rent-four-municipalities-2021-2025.json";
import type { Indicator, IneResponse, Territory } from "./types";

export const SNAPSHOT_DATE = "2026-10-17";
export function verifiedSnapshot(indicator: Indicator, territory: Territory, startYear?: number, endYear?: number): IneResponse | null {
  const source = indicator.id === "0012136" && territory.id === "15" ? algarve
    : indicator.id === "0014711" ? rentBatch.series.find((item) => item.territoryId === territory.id)
    : portimao.series.find((item) => item.indicatorId === indicator.id && item.territoryId === territory.id);
  if (!source) return null;
  const observations = source.observations.filter((row) => {
    const year = Number(row.period.match(/20\d{2}/)?.[0]);
    return (!startYear || year >= startYear) && (!endYear || year <= endYear);
  }).map((row) => ({ territoryId: territory.id, territory: territory.name, period: row.period, periodCode: row.periodCode, value: row.value, displayValue: row.displayValue }));
  if (!observations.length) return null;
  return { observations, extractedAt: "collectedAt" in source ? source.collectedAt : SNAPSHOT_DATE, lastUpdated: indicator.id === "0014711" ? rentBatch.lastUpdated : "lastUpdated" in source ? source.lastUpdated : "Ver fonte", warnings: [...("warnings" in source ? source.warnings : []), `Snapshot oficial verificado em ${SNAPSHOT_DATE}; pode não incluir valores mais recentes.`] };
}

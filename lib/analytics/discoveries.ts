import type { CityDashboard, CityMetric } from "../city";
import rentSnapshot from "../../data/snapshots/rent-four-municipalities-2021-2025.json";
import { percentChange } from "../analysis";

export type DiscoveryPeer = { territory: string; territoryId: string; first: { period: string; value: number; sourceUrl: string }; last: { period: string; value: number; sourceUrl: string }; percent: number };
export type Discovery = { id: string; title: string; territory: string; territoryId: string; indicatorId: string; indicatorName: string; unit: string; first: { period: string; value: number; sourceUrl: string }; last: { period: string; value: number; sourceUrl: string }; absolute: number; percent: number; formula: string; sourceUrl: string; snapshotDate: string; peers?: DiscoveryPeer[] };
export function discoveryCandidates(city: CityDashboard): Discovery[] {
  return (city.metrics ?? []).flatMap((metric: CityMetric) => {
    const series = city.series.find((item) => item.indicatorId === metric.indicatorId && item.territoryId === metric.territoryId);
    if (!series || metric.first.value === null || metric.last.value === null || metric.absolute === null || metric.percent === null) return [];
    if (Math.abs(metric.percent) < 10 || Math.abs(metric.first.value) < 5) return [];
    const direction = metric.absolute >= 0 ? "subiu" : "desceu";
    return [{
      id: `${city.city.slug}-${series.indicatorId}-${metric.first.period}-${metric.last.period}`,
      title: `${series.indicatorId === "0014711" ? "A mediana das rendas de novos contratos" : series.indicatorName} ${direction} em ${city.city.name}`,
      territory: city.city.name, territoryId: city.city.id, indicatorId: series.indicatorId, indicatorName: series.indicatorName, unit: series.unit,
      first: { period: metric.first.period, value: metric.first.value, sourceUrl: metric.first.sourceUrl },
      last: { period: metric.last.period, value: metric.last.value, sourceUrl: metric.last.sourceUrl },
      absolute: metric.absolute, percent: metric.percent,
      formula: "((valor final − valor inicial) / |valor inicial|) × 100",
      sourceUrl: series.sourceUrl, snapshotDate: city.collectedAt,
    }];
  });
}

/** Pick the strongest verified change within one municipality, without comparing unlike units. */
export function strongestMunicipalDiscovery(city: CityDashboard): Discovery | null {
  const candidates = (city.metrics ?? []).flatMap((metric) => {
    const series = city.series.find((item) => item.indicatorId === metric.indicatorId && item.territoryId === city.city.id);
    if (!series || metric.first.value === null || metric.last.value === null || metric.percent === null || metric.absolute === null) return [];
    if (!Number.isFinite(metric.percent) || metric.first.periodCode === metric.last.periodCode || Math.abs(metric.percent) < 0.05) return [];
    if (!metric.first.sourceUrl.startsWith("https://www.ine.pt/") || !metric.last.sourceUrl.startsWith("https://www.ine.pt/")) return [];
    const direction = metric.absolute > 0 ? "subiu" : "desceu";
    const subject = series.indicatorId === "0014711" ? "A renda mediana dos novos contratos" : series.indicatorName;
    return [{
      id: `${city.city.id}-${series.indicatorId}-${metric.first.periodCode}-${metric.last.periodCode}`,
      title: `${subject} ${direction} em ${city.city.name} entre ${metric.first.period} e ${metric.last.period}`,
      territory: city.city.name, territoryId: city.city.id,
      indicatorId: series.indicatorId, indicatorName: series.indicatorName, unit: series.unit,
      first: { period: metric.first.period, value: metric.first.value, sourceUrl: metric.first.sourceUrl },
      last: { period: metric.last.period, value: metric.last.value, sourceUrl: metric.last.sourceUrl },
      absolute: metric.absolute, percent: metric.percent,
      formula: "((valor final − valor inicial) / |valor inicial|) × 100",
      sourceUrl: series.sourceUrl, snapshotDate: city.collectedAt,
    } satisfies Discovery];
  });
  return candidates.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent) || a.indicatorId.localeCompare(b.indicatorId))[0] ?? null;
}

/** Maior variação percentual entre quatro municípios, mesmo indicador e período. */
export function strongestVerifiedDiscovery(): Discovery | null {
  const peers: DiscoveryPeer[] = rentSnapshot.series.flatMap((series) => {
    if (series.indicatorId !== "0014711" || series.unit !== "€/m²") return [];
    const first = series.observations.find((row) => row.period === "2021");
    const last = series.observations.find((row) => row.period === "2025");
    if (!first || !last || first.value === null || last.value === null) return [];
    const percent = percentChange(first.value, last.value);
    if (percent === null) return [];
    return [{ territory: series.territory, territoryId: series.territoryId,
      first: { period: first.period, value: first.value, sourceUrl: first.sourceUrl },
      last: { period: last.period, value: last.value, sourceUrl: last.sourceUrl }, percent }];
  });
  if (peers.length !== 4 || new Set(peers.map((peer) => peer.territoryId)).size !== 4) return null;
  const ranked = [...peers].sort((a, b) => b.percent - a.percent);
  const winner = ranked[0];
  const winnerSeries = rentSnapshot.series.find((series) => series.territoryId === winner.territoryId)!;
  return {
    id: `maior-variacao-renda-${winner.territoryId}-2021-2025`,
    title: `${winner.territory} teve a maior subida percentual da renda mediana de novos contratos entre estes quatro municípios`,
    territory: winner.territory, territoryId: winner.territoryId,
    indicatorId: winnerSeries.indicatorId, indicatorName: winnerSeries.indicatorName, unit: winnerSeries.unit,
    first: winner.first, last: winner.last,
    absolute: winner.last.value - winner.first.value, percent: winner.percent,
    formula: "((valor final − valor inicial) / |valor inicial|) × 100",
    sourceUrl: winnerSeries.sourceUrl, snapshotDate: rentSnapshot.collectedAt,
    peers: ranked,
  };
}

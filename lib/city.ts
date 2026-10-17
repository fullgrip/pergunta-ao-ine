import snapshot from "../data/snapshots/portimao-2026-10-17.json";
import rentSnapshot from "../data/snapshots/rent-four-municipalities-2021-2025.json";
import { getIndicator } from "./ine/catalog";
import { fetchBatchObservations } from "./ine/client";
import { absoluteChange, percentChange } from "./analysis";
import { getMunicipalityBySlug, municipalitySlug } from "./municipalities";

export type CityObservation = { period: string; periodCode: string; value: number | null; displayValue: string; sourceUrl: string; collectedAt?: string };
export type CitySeries = { theme: string; indicatorId: string; indicatorName: string; description: string; unit: string; territoryId: string; territory: string; sourceUrl: string; observations: CityObservation[] };
export type CityMetric = { indicatorId: string; territoryId: string; first: CityObservation; last: CityObservation; absolute: number | null; percent: number | null; changeUnit: string };
export type CityDashboard = { city: { id: string; name: string; slug: string }; mode: "snapshot" | "live"; collectedAt: string; notice: string; series: CitySeries[]; warnings: string[]; metrics?: CityMetric[] };
export function enrichCity(data: CityDashboard): CityDashboard {
  const metrics = data.series.flatMap((item) => {
    const rows = item.observations.filter((row) => row.value !== null);
    if (rows.length < 2) return [];
    const first = rows[0]; const last = rows.at(-1)!;
    return [{ indicatorId: item.indicatorId, territoryId: item.territoryId, first, last, absolute: absoluteChange(first.value, last.value), percent: percentChange(first.value, last.value), changeUnit: item.unit === "%" ? "p.p." : item.unit }];
  });
  return { ...data, metrics };
}
export function citySnapshot(slug: string): CityDashboard | null {
  const city = getMunicipalityBySlug(slug);
  if (!city) return null;
  if (city.id === "1500811") return enrichCity(snapshot as CityDashboard);
  const rent = rentSnapshot.series.find((item) => item.territoryId === city.id);
  if (!rent) return null;
  return enrichCity({
    city: { id: city.id, name: city.name, slug: municipalitySlug(city) }, mode: "snapshot", collectedAt: rentSnapshot.collectedAt,
    notice: "Série de rendas verificada de 2021 a 2025. Os restantes temas ainda não têm snapshot municipal nesta vista.",
    series: [rent as CitySeries], warnings: [],
  });
}

export async function refreshCity(slug: string, options: { initial?: boolean } = {}): Promise<CityDashboard> {
  const city = getMunicipalityBySlug(slug);
  if (!city) throw new Error("Município desconhecido no catálogo oficial.");
  const queryPlan = [
    { id: "0014711", theme: "Habitação", periods: ["2021", "2022", "2023", "2024", "2025"] },
    { id: "0012918", theme: "População", periods: ["2025"] },
    { id: "0012653", theme: "Rendimento", periods: ["2021", "2024"] },
    { id: "0013312", theme: "Turismo", periods: ["2022", "2023", "2024", "2025"] },
    { id: "0012765", theme: "Ambiente", periods: ["2021", "2022", "2023", "2024"] },
  ].filter((item) => !options.initial || item.id === "0014711" || item.id === "0012918");
  const series: CitySeries[] = []; const warnings: string[] = [];
  for (const plan of queryPlan) {
    const indicator = getIndicator(plan.id)!;
    const periods = plan.periods.map((period) => ({ period, code: `S7A${period}` }));
    const params = new URLSearchParams({ op: "2", varcd: indicator.id, Dim1: periods.map((item) => item.code).join(","), Dim2: city.id, ...indicator.extraDimensions, lang: "PT" });
    const sourceUrl = `${indicator.dataUrl}?${params.toString().replaceAll("%2C", ",")}`;
    try {
      const result = await fetchBatchObservations(indicator, [city], periods);
      const observations: CityObservation[] = result.observations.map((row) => ({ period: row.period, periodCode: row.periodCode, value: row.value, displayValue: row.displayValue, sourceUrl }));
      warnings.push(...result.warnings);
      if (observations.some((row) => row.value !== null)) series.push({ theme: plan.theme, indicatorId: indicator.id, indicatorName: indicator.name, description: indicator.dimensionDescription, unit: indicator.unit, territoryId: city.id, territory: city.name, sourceUrl: indicator.sourceUrl, observations });
    } catch (error) { warnings.push(`${indicator.shortName}: ${error instanceof Error ? error.message : "falha no INE"}`); }
  }
  if (!series.length) throw new Error(`O INE não devolveu valores numéricos para ${city.name} nos indicadores consultados.`);
  const partial = series.length !== queryPlan.length || series.some((item) => item.observations.some((row) => row.value === null));
  return enrichCity({ city: { id: city.id, name: city.name, slug: municipalitySlug(city) }, mode: "live", collectedAt: new Date().toISOString(), notice: partial ? "Consulta parcial ao INE: apenas indicadores com valores publicados são mostrados; as ausências estão nos avisos." : "Valores consultados em direto na API pública do INE.", series, warnings });
}

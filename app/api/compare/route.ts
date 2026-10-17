import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_INDICATORS, DEFAULT_COMPARISON_IDS, comparisonIndicator, comparisonPeriod, comparisonTerritories, loadComparison, seededComparisonSeries } from "@/lib/analytics/comparison-data";
import { fetchBatchObservations } from "@/lib/ine/client";
import { readSavedObservation, saveObservation } from "@/lib/ine/observation-store";
import type { Indicator, Territory } from "@/lib/ine/types";
import { getMunicipalityById } from "@/lib/municipalities";

export const runtime = "nodejs";

const RequestSchema = z.object({
  indicator: z.enum(COMPARISON_INDICATORS),
  territoryId: z.string().optional(),
  territoryIds: z.array(z.string()).min(1).max(4).optional(),
});
const inflight = new Map<string, Promise<{ fetched: number; missing: string[] }>>();
const noValueUntil = new Map<string, number>();

function officialObservationUrl(indicator: Indicator, territory: Territory, periodCode: string) {
  const params = new URLSearchParams({ op: "2", varcd: indicator.id, Dim1: periodCode,
    Dim2: territory.id, ...indicator.extraDimensions, lang: "PT" });
  return `${indicator.dataUrl}?${params}`;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const indicator = comparisonIndicator(query.get("indicator") ?? "rendas");
  if (!indicator) return NextResponse.json({ error: "Seleciona um indicador municipal disponível no catálogo." }, { status: 400 });
  const ids = (query.get("territories") ?? DEFAULT_COMPARISON_IDS.join(",")).split(",").map((id) => id.trim());
  const territories = comparisonTerritories(ids);
  if (!territories) return NextResponse.json({ error: "Seleciona entre dois e quatro municípios diferentes do catálogo oficial." }, { status: 400 });
  if (territories.some((territory) => !indicator.supportedTerritories.some((supported) => supported.id === territory.id))) {
    return NextResponse.json({ error: "O indicador não está disponível ao nível municipal para todos os locais selecionados." }, { status: 400 });
  }
  return NextResponse.json(await loadComparison(indicator, territories), { headers: { "Cache-Control": "no-store" } });
}

/** A user-initiated refresh groups all missing places in a single official request. */
export async function POST(request: Request) {
  let input: z.infer<typeof RequestSchema>;
  try { input = RequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Escolhe um indicador e entre um e quatro municípios válidos." }, { status: 400 }); }
  const indicator = comparisonIndicator(input.indicator)!;
  const ids = input.territoryIds ?? (input.territoryId ? [input.territoryId] : []);
  if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Escolhe entre um e quatro municípios diferentes." }, { status: 400 });
  }
  const found = ids.map(getMunicipalityById);
  if (found.some((territory) => !territory)) return NextResponse.json({ error: "Município não encontrado no catálogo oficial." }, { status: 400 });
  const places = found as Territory[];
  if (places.some((territory) => !indicator.supportedTerritories.some((supported) => supported.id === territory.id))) {
    return NextResponse.json({ error: "O indicador não cobre todos os municípios selecionados." }, { status: 400 });
  }
  const { period, periodCode } = comparisonPeriod(indicator);
  const seeded = seededComparisonSeries();
  const saved = await Promise.all(places.map((territory) => readSavedObservation(indicator.id, territory.id, periodCode)));
  const missing = places.filter((territory, index) => !saved[index] && !seeded.some((series) =>
    series.indicatorId === indicator.id && series.territoryId === territory.id &&
    series.observations.some((row) => row.periodCode === periodCode && row.value !== null)));
  if (!missing.length) return NextResponse.json({ mode: "snapshot", fetched: 0,
    message: "Todos os valores pedidos já estão guardados; nenhum pedido ao INE foi necessário." });
  const pending = missing.filter((territory) => (noValueUntil.get(`${indicator.id}-${territory.id}-${periodCode}`) ?? 0) < Date.now());
  if (!pending.length) return NextResponse.json({ mode: "no_value", fetched: 0, missing: missing.map((item) => item.name),
    message: "O INE não devolveu valor para estes municípios na última consulta. Aguarda antes de voltar a consultar." });
  const key = `${indicator.id}-${periodCode}-${pending.map((item) => item.id).sort().join(",")}`;
  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const response = await fetchBatchObservations(indicator, pending, [{ period, code: periodCode }], { maxAttempts: 1 });
      const available = response.observations.filter((row) => row.value !== null &&
        pending.some((territory) => territory.id === row.territoryId) && row.periodCode === periodCode);
      await Promise.all(available.map(async (row) => {
        const territory = pending.find((item) => item.id === row.territoryId)!;
        if (await readSavedObservation(indicator.id, row.territoryId, periodCode)) return;
        await saveObservation({ indicatorId: indicator.id, territoryId: row.territoryId, period, periodCode,
          value: row.value!, displayValue: row.displayValue, sourceUrl: officialObservationUrl(indicator, territory, periodCode),
          extractedAt: response.extractedAt, lastUpdated: response.lastUpdated,
          savedAt: new Date().toISOString(), warnings: response.warnings });
      }));
      const absent = missing.filter((territory) => !available.some((row) => row.territoryId === territory.id));
      for (const territory of absent) noValueUntil.set(`${indicator.id}-${territory.id}-${periodCode}`, Date.now() + 15 * 60_000);
      return { fetched: available.length, missing: absent.map((item) => item.name) };
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  try {
    const result = await job;
    return NextResponse.json({ mode: "fetched", ...result,
      message: result.missing.length
        ? `O INE não devolveu valor numérico para ${result.missing.join(", ")}. Os restantes valores foram guardados.`
        : `Foram guardados ${result.fetched} ${result.fetched === 1 ? "valor oficial" : "valores oficiais"} para futuras visitas.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar o INE." }, { status: 503 });
  }
}

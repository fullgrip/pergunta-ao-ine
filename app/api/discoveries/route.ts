import { NextResponse } from "next/server";
import { z } from "zod";
import { citySnapshot, enrichCity, type CityDashboard } from "@/lib/city";
import { strongestMunicipalDiscovery, strongestVerifiedDiscovery } from "@/lib/analytics/discoveries";
import { getMunicipalityById, getMunicipalityBySlug, municipalitySlug } from "@/lib/municipalities";
import { getIndicator } from "@/lib/ine/catalog";
import { fetchBatchObservations } from "@/lib/ine/client";
import { chooseDiscovery } from "@/lib/ollama";
import { generateExplanation } from "@/lib/explanation/generate";
import { cacheExplanation, storeEvidence, type StatisticalEvidence } from "@/lib/explanation/evidence";
export const runtime = "nodejs";
const Body = z.object({ city: z.string().trim().min(1).optional(), municipalityId: z.string().trim().optional() })
  .refine((value) => Boolean(value.city || value.municipalityId), "Indica um município.");

/** Keep the original Algarve demonstration available to the Raio-X page. */
async function algarveDiscovery() {
    const snapshot = citySnapshot("portimao")!;
    const discovery = strongestVerifiedDiscovery();
    if (!discovery) return NextResponse.json({ error: "Ainda não há quatro séries completas e comparáveis para uma descoberta defensável." }, { status: 422 });
    let explanation = "A comparação usa o mesmo indicador, unidade e intervalo para os quatro municípios. A variação observada não revela a causa da mudança.";
    let modelUsed = false;
    try {
      const result = await chooseDiscovery([discovery]);
      if (!/maior (?:subida|aumento|varia[cç][aã]o)|subida percentual entre|lidera (?:o grupo|a compara[cç][aã]o)/i.test(result.explanation)) {
        explanation = result.explanation;
        modelUsed = true;
      }
    } catch { /* A prova e o cálculo determinísticos continuam disponíveis sem Ollama. */ }
    return NextResponse.json({ discovery, explanation, modelUsed, mode: snapshot.mode, collectedAt: discovery.snapshotDate, warnings: snapshot.warnings });
}

function evidenceForDiscovery(city: CityDashboard, indicatorId: string): StatisticalEvidence | null {
  const indicator = getIndicator(indicatorId);
  const series = city.series.find((item) => item.indicatorId === indicatorId && item.territoryId === city.city.id);
  const rows = series?.observations.filter((row) => typeof row.value === "number" && Number.isFinite(row.value)) ?? [];
  if (!indicator || !series || rows.length < 2) return null;
  const first = rows[0]; const last = rows.at(-1)!;
  const metric = city.metrics?.find((item) => item.indicatorId === indicatorId && item.territoryId === city.city.id);
  if (!metric || metric.absolute === null || metric.percent === null) return null;
  return {
    question: `O que mudou em ${city.city.name} entre ${first.period} e ${last.period}?`,
    indicator: { id: indicator.id, name: indicator.name, shortName: indicator.shortName, unit: indicator.unit, dimensionDescription: indicator.dimensionDescription },
    observations: rows.map((row) => ({ territoryId: city.city.id, territory: city.city.name, period: row.period, periodCode: row.periodCode, value: row.value, displayValue: row.displayValue })),
    summaries: [{ territory: city.city.name, first: { territoryId: city.city.id, territory: city.city.name, period: first.period, periodCode: first.periodCode, value: first.value, displayValue: first.displayValue }, last: { territoryId: city.city.id, territory: city.city.name, period: last.period, periodCode: last.periodCode, value: last.value, displayValue: last.displayValue }, absolute: metric.absolute, percent: metric.percent }],
    calculations: [{ label: "Variação percentual entre os períodos disponíveis", value: metric.percent, unit: "%" }],
    sources: [{ name: "Instituto Nacional de Estatística", url: indicator.sourceUrl, dataUrl: series.sourceUrl, indicatorId: indicator.id }],
    limitations: ["A variação observada não demonstra a causa da mudança; os períodos disponíveis podem não incluir os dados mais recentes."],
  };
}

async function loadMunicipalRent(municipality: NonNullable<ReturnType<typeof getMunicipalityById>>): Promise<CityDashboard> {
  const indicator = getIndicator("0014711")!;
  const periods = indicator.years.slice(-5).map((period) => ({ period, code: `S7A${period}` }));
  const result = await fetchBatchObservations(indicator, [municipality], periods);
  const params = new URLSearchParams({ op: "2", varcd: indicator.id, Dim1: periods.map((item) => item.code).join(","), Dim2: municipality.id, ...indicator.extraDimensions, lang: "PT" });
  const dataUrl = `${indicator.dataUrl}?${params.toString().replaceAll("%2C", ",")}`;
  const observations = result.observations.map((row) => ({ ...row, sourceUrl: dataUrl }));
  return enrichCity({
    city: { id: municipality.id, name: municipality.name, slug: municipalitySlug(municipality) },
    mode: "live", collectedAt: result.extractedAt || new Date().toISOString(),
    notice: "Série de rendas consultada em lote na API pública do INE.",
    series: observations.some((row) => row.value !== null) ? [{
      theme: "Habitação", indicatorId: indicator.id, indicatorName: indicator.name,
      description: indicator.dimensionDescription, unit: indicator.unit,
      territoryId: municipality.id, territory: municipality.name,
      sourceUrl: indicator.sourceUrl, observations,
    }] : [],
    warnings: result.warnings,
  });
}

export async function POST(request: Request) {
  try {
    const input = Body.parse(await request.json());
    if (input.city === "portimao" && !input.municipalityId) return algarveDiscovery();
    const municipality = input.municipalityId
      ? getMunicipalityById(input.municipalityId)
      : input.city ? getMunicipalityBySlug(input.city) : undefined;
    if (!municipality) return NextResponse.json({ error: "Município desconhecido no catálogo oficial." }, { status: 400 });
    const slug = municipalitySlug(municipality);
    // A verified snapshot avoids a network request. Other municipalities use one batched INE query.
    const city = citySnapshot(slug) ?? await loadMunicipalRent(municipality);
    const discovery = strongestMunicipalDiscovery(city);
    if (!discovery) return NextResponse.json({
      error: `Ainda não há dois valores publicados e comparáveis, com uma variação mensurável, para destacar em ${municipality.name}.`,
      reason: "insufficient_data", municipality: municipality.name, warnings: city.warnings,
    }, { status: 422 });
    const evidence = evidenceForDiscovery(city, discovery.indicatorId);
    if (!evidence) return NextResponse.json({ error: "Os valores não permitiram validar a descoberta." }, { status: 422 });
    const evidenceId = storeEvidence(evidence);
    const generated = await generateExplanation(evidenceId, evidence, "direct");
    cacheExplanation(generated);
    return NextResponse.json({
      discovery, headline: generated.headline, explanation: generated.summary, caveat: generated.caveat,
      modelUsed: generated.provider !== "template", provider: generated.provider, evidenceId,
      explanationData: generated,
      mode: city.mode, collectedAt: city.collectedAt, warnings: city.warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao procurar descobertas." }, { status: error instanceof z.ZodError ? 400 : 503 });
  }
}

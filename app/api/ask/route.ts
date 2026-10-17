import { NextResponse } from "next/server";
import { z } from "zod";
import { allowedTerritory, isCityChoiceQuestion, sameQuarterComparison, seriesSummary } from "@/lib/analysis";
import { cacheExplanation, storeEvidence, type StatisticalEvidence } from "@/lib/explanation/evidence";
import { generateExplanation } from "@/lib/explanation/generate";
import { fetchBatchObservations, fetchSeries, plannedPeriods } from "@/lib/ine/client";
import { getIndicator } from "@/lib/ine/catalog";
import { SNAPSHOT_DATE, verifiedSnapshot } from "@/lib/ine/snapshot";
import type { IneResponse, Territory } from "@/lib/ine/types";
import { parseQuestion } from "@/lib/ollama";

export const runtime = "nodejs";
const RequestSchema = z.object({ question: z.string().trim().min(3).max(500), municipalityId: z.string().regex(/^[0-9A-Z]{7}$/).optional() });
type AnswerStage = "interpret" | "data" | "analyze" | "explain";
type StageNotice = { stage: AnswerStage; source?: "snapshot" | "ine" };

async function answerQuestion(input: z.infer<typeof RequestSchema>, notify?: (notice: StageNotice) => void) {
    notify?.({ stage: "interpret" });
    const plan = await parseQuestion(input.question, input.municipalityId);
    const indicator = getIndicator(plan.indicatorId);
    if (!indicator) return NextResponse.json({ error: "O indicador selecionado não está no catálogo." }, { status: 422 });
    const territories = plan.territoryIds.map((id) => allowedTerritory(indicator.id, id));
    if (territories.some((territory) => !territory)) return NextResponse.json({ error: "O território não é suportado para este indicador. Escolha uma das perguntas de exemplo." }, { status: 422 });
    if (plan.intent === "comparison" && territories.length !== 2) return NextResponse.json({ error: "Para comparar, indique dois territórios." }, { status: 422 });
    if (indicator.id === "0012136" && plan.intent === "comparison") return NextResponse.json({ error: "A comparação disponível para desemprego é temporal no Algarve." }, { status: 422 });

    const snapshotFor = (territory: Territory) => {
      const snapshot = verifiedSnapshot(indicator, territory, plan.startYear ?? undefined, plan.endYear ?? undefined);
      if (!snapshot || plan.quarter == null) return snapshot;
      const observations = snapshot.observations.filter(({ periodCode }) => periodCode.endsWith(String(plan.quarter)));
      return observations.length ? { ...snapshot, observations } : null;
    };
    const requestedCodes = plannedPeriods(indicator, plan.startYear ?? undefined, plan.endYear ?? undefined, plan.quarter ?? undefined).map(({ code }) => code);
    const coversRequestedPeriods = (item: IneResponse | null): item is IneResponse =>
      item !== null && requestedCodes.length > 0 && requestedCodes.every((code) =>
        item.observations.some((row) => row.periodCode === code && row.value !== null));
    const preferredSnapshots = territories.map((territory) => snapshotFor(territory!));
    const preferredSnapshotAvailable = preferredSnapshots.every(coversRequestedPeriods);
    notify?.({ stage: "data", source: preferredSnapshotAvailable ? "snapshot" : "ine" });
    const fetchMissingSeries = async (): Promise<IneResponse[]> => {
      if (territories.length === 1) return [await fetchSeries(indicator, territories[0]!, plan.startYear ?? undefined, plan.endYear ?? undefined, plan.quarter ?? undefined)];
      try {
        const batch = await fetchBatchObservations(indicator, territories as Territory[], plannedPeriods(indicator, plan.startYear ?? undefined, plan.endYear ?? undefined, plan.quarter ?? undefined));
        return territories.map((territory) => ({ ...batch, observations: batch.observations.filter((row) => row.territoryId === territory!.id) }));
      } catch (error) {
        const warning = error instanceof Error ? error.message : "Falha na consulta ao INE.";
        return territories.map(() => ({ observations: [], extractedAt: "", lastUpdated: "", warnings: [warning] }));
      }
    };
    let series: IneResponse[] = preferredSnapshotAvailable
      ? preferredSnapshots as IneResponse[]
      : await fetchMissingSeries();
    let snapshotUsed = preferredSnapshotAvailable;
    if (series.every((item) => !item.observations.some((row) => row.value !== null))) {
      const fallback = territories.map((territory) => snapshotFor(territory!));
      if (fallback.every(coversRequestedPeriods)) { series = fallback as IneResponse[]; snapshotUsed = true; }
    }
    const rows = series.flatMap((item) => item.observations);
    if (!rows.some((row) => row.value !== null)) return NextResponse.json({ error: "Não foi possível obter valores numéricos do INE para estes parâmetros.", warnings: series.flatMap((item) => item.warnings) }, { status: 502 });
    if (plan.intent === "comparison") {
      const commonPeriods = territories[0] && territories[1]
        ? new Set(rows.filter((row) => row.territoryId === territories[0]!.id && row.value !== null).map((row) => row.periodCode))
        : new Set<string>();
      const comparable = rows.some((row) => row.territoryId === territories[1]?.id && row.value !== null && commonPeriods.has(row.periodCode));
      if (!comparable) return NextResponse.json({ error: "Não existem valores publicados para os dois municípios no mesmo período. Não é possível concluir esta comparação.", warnings: series.flatMap((item) => item.warnings) }, { status: 422 });
    }
    notify?.({ stage: "analyze" });
    const summaries = territories.map((territory, index) => ({ territory: territory!.name, ...seriesSummary(series[index].observations) }));
    const periodCodes = [...new Set(rows.map((row) => row.periodCode))];
    const territoryCodes = [...new Set(rows.map((row) => row.territoryId))];
    const params = new URLSearchParams({ op: "2", varcd: indicator.id, Dim1: periodCodes.join(","), Dim2: territoryCodes.join(","), lang: "PT", ...indicator.extraDimensions });
    const sources = [{ name: "Instituto Nacional de Estatística (INE)", url: indicator.sourceUrl, dataUrl: `${indicator.dataUrl}?${params}`, indicatorId: indicator.id }];
    const warnings = [...new Set(series.flatMap((item) => item.warnings))];
    const homologousComparison = indicator.id === "0012136" ? sameQuarterComparison(rows) : null;
    const calculations = summaries.flatMap((item) => [
      ...(typeof item.absolute === "number" ? [{ label: `Variação absoluta em ${item.territory}`, value: item.absolute, unit: indicator.unit === "%" ? "p.p." : indicator.unit }] : []),
      ...(typeof item.percent === "number" && indicator.unit !== "%" ? [{ label: `Variação percentual em ${item.territory}`, value: item.percent, unit: "%" }] : []),
    ]);
    if (homologousComparison) calculations.push({ label: "Variação homóloga em pontos percentuais", value: homologousComparison.percentagePointChange, unit: "p.p." });
    const qualityWarnings = warnings.filter((warning) => /qualidade|coeficiente|desvio|§/i.test(warning));
    const limitations = [
      ...warnings.filter((warning) => !qualityWarnings.includes(warning)),
      ...(qualityWarnings.length ? ["Algumas observações do INE têm aviso de qualidade (§); os períodos estão identificados na tabela e nos avisos."] : []),
      ...(rows.length === 1 ? ["Existe apenas um período verificado; não é possível concluir uma evolução."] : []),
      ...(indicator.id === "0012136" ? ["O desemprego trimestral no Algarve é sazonal; a comparação temporal usa o mesmo trimestre do ano anterior quando disponível."] : []),
      ...(indicator.id === "0014711" ? ["A renda é a mediana por m² de novos contratos; não representa todos os contratos em vigor."] : []),
    ];
    const publicIndicator = { id: indicator.id, name: indicator.name, shortName: indicator.shortName, unit: indicator.unit, dimensionDescription: indicator.dimensionDescription };
    const evidence: StatisticalEvidence = { question: input.question, indicator: publicIndicator, observations: rows, summaries, calculations, sources, limitations };
    const analysisId = storeEvidence(evidence);
    notify?.({ stage: "explain" });
    const explanation = await generateExplanation(analysisId, evidence, "direct");
    cacheExplanation(explanation);
    return NextResponse.json({ question: input.question, summary: explanation.body, explanation, analysisId, intent: plan.intent, territoryIds: plan.territoryIds, quarter: plan.quarter ?? null, indicator: publicIndicator, observations: rows, summaries, homologousComparison, sources, warnings, extractedAt: series.find((item) => item.extractedAt)?.extractedAt, lastUpdated: series.find((item) => item.lastUpdated)?.lastUpdated, model: explanation.model, provider: explanation.provider, mode: snapshotUsed ? "snapshot" : "live", snapshotDate: snapshotUsed ? SNAPSHOT_DATE : null });
}

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    if (isCityChoiceQuestion(input.question)) return NextResponse.json({ guidance: "city-choice" }, { status: 422 });
    if (request.headers.get("accept")?.includes("text/event-stream")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, value: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
          try {
            const response = await answerQuestion(input, (notice) => send("stage", notice));
            const body = await response.json();
            send(response.ok ? "result" : "error", body);
          } catch (error) {
            send("error", { error: error instanceof Error ? error.message : "Erro inesperado." });
          } finally { controller.close(); }
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
    }
    return await answerQuestion(input);
  } catch (error) {
    const message = error instanceof z.ZodError ? "A pergunta deve ter entre 3 e 500 caracteres." : error instanceof Error ? error.message : "Erro inesperado.";
    const status = error instanceof z.ZodError ? 400 : /Ollama|fetch failed|timeout/i.test(message) ? 503 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_INDICATORS, comparisonIndicator, comparisonTerritories, loadComparison } from "@/lib/analytics/comparison-data";
import { chatWithMetadata } from "@/lib/ollama";

export const runtime = "nodejs";

const RequestSchema = z.object({
  indicator: z.enum(COMPARISON_INDICATORS),
  territories: z.array(z.string()).min(2).max(4),
});
const OutputSchema = z.object({ explanation: z.string().trim().min(20).max(300) });
const forbidden = /\d|\b(?:dobr(?:ou|aram)|triplic(?:ou|aram)|metade|recorde|sempre|causou|provocou|devido|press[aã]o|significativ[ao]s?|mais|menos|maior|menor|superior|inferior|lidera|ultrapassou|subiu|desceu|aumentou|diminuiu|turismo|procura|oferta|sal[aá]rio)\b/i;

/** Gemma receives only the aligned, verified result; it cannot change the factual ranking. */
export async function POST(request: Request) {
  let input: z.infer<typeof RequestSchema>;
  try { input = RequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Escolhe um indicador e entre dois e quatro municípios." }, { status: 400 }); }
  const indicator = comparisonIndicator(input.indicator);
  const territories = comparisonTerritories(input.territories);
  if (!indicator || !territories) return NextResponse.json({ error: "Comparação inválida." }, { status: 400 });
  if (territories.some((territory) => !indicator.supportedTerritories.some((supported) => supported.id === territory.id))) {
    return NextResponse.json({ error: "O indicador não cobre todos os municípios selecionados." }, { status: 400 });
  }
  const comparison = await loadComparison(indicator, territories);
  if (comparison.ranking.length !== territories.length || !comparison.selectedPeriod) {
    return NextResponse.json({ error: comparison.rankingReason ?? "Faltam observações comparáveis." }, { status: 422 });
  }
  const [leader] = comparison.ranking;
  const headline = `${leader.territory} tem o valor mais alto de ${indicator.shortName.toLowerCase()} em ${comparison.selectedPeriod}.`;
  const facts = comparison.ranking.map((row) => `${row.territory}: ${row.value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${indicator.unit}`).join("; ");
  const fallback = "A ordenação usa a mesma medida, unidade e período para todos os municípios escolhidos.";
  try {
    const reply = await chatWithMetadata(
      `Produz JSON {"explanation":string} em português de Portugal. Escreve uma frase curta, natural e qualitativa, que explique o que esta comparação mede: ${indicator.dimensionDescription}. Não escrevas números, datas, rankings adicionais, diferenças, causas, extrapolações nem factos externos. Não repitas a conclusão. Usa apenas estes valores verificados: ${JSON.stringify({ indicator: indicator.shortName, unit: indicator.unit, period: comparison.selectedPeriod, ranking: comparison.ranking })}`,
      z.toJSONSchema(OutputSchema),
    );
    const explanation = OutputSchema.parse(JSON.parse(reply.content)).explanation;
    if (forbidden.test(explanation) || indicator.id === "0014711" && /\bm[eé]dia\b/i.test(explanation)) throw new Error("Texto não comprovado.");
    return NextResponse.json({ headline, facts, explanation, provider: reply.provider, model: reply.model });
  } catch {
    return NextResponse.json({ headline, facts, explanation: fallback, provider: "template", model: "Modelo indisponível" });
  }
}

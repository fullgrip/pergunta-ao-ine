import { NextResponse } from "next/server";
import { z } from "zod";
import { cacheExplanation, getCachedExplanation, getEvidence, ResponseToneSchema } from "@/lib/explanation/evidence";
import { generateExplanation } from "@/lib/explanation/generate";

export const runtime = "nodejs";
const RequestSchema = z.object({ analysisId: z.string().uuid(), tone: ResponseToneSchema }).strict();

export async function POST(request: Request) {
  let input: z.infer<typeof RequestSchema>;
  try { input = RequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Indica um identificador de análise e um tom válidos." }, { status: 400 }); }
  const evidence = getEvidence(input.analysisId);
  if (!evidence) return NextResponse.json({ error: "A análise expirou. Volta a fazer a pergunta para atualizar a explicação." }, { status: 410 });
  const cached = getCachedExplanation(input.analysisId, input.tone);
  const explanation = cached ?? await generateExplanation(input.analysisId, evidence, input.tone);
  if (!cached) cacheExplanation(explanation);
  return NextResponse.json(explanation, { headers: { "cache-control": "no-store" } });
}

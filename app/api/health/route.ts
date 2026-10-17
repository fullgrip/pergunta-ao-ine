import { NextResponse } from "next/server";
import { checkIne } from "@/lib/ine/client";
import { ollamaHealth } from "@/lib/ollama";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("scope") === "ollama") return NextResponse.json({ app: { available: true }, ollama: await ollamaHealth(), ine: { available: null, checked: false } });
  const [ollama, ine] = await Promise.all([ollamaHealth(), checkIne()]);
  return NextResponse.json({ app: { available: true }, ollama, ine: { available: ine, checked: true } });
}

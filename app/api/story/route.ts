import { NextResponse } from "next/server";
import { citySnapshot } from "@/lib/city";
import { buildCityStory } from "@/lib/analytics/story";

export const runtime = "nodejs";

/** Serve a história verificada sem consultar o INE nem o Ollama. */
export async function GET(request: Request) {
  const citySlug = new URL(request.url).searchParams.get("city")?.trim().toLowerCase() ?? "";
  if (!citySlug) return NextResponse.json({ error: "Indica o município em ?city=." }, { status: 400 });
  const snapshot = citySnapshot(citySlug);
  if (!snapshot) return NextResponse.json({ error: "Ainda não existe um snapshot verificado para este município." }, { status: 404 });
  return NextResponse.json(buildCityStory(snapshot), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}

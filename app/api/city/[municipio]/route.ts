import { NextResponse } from "next/server";
import { citySnapshot, refreshCity } from "@/lib/city";
import { getMunicipalityBySlug } from "@/lib/municipalities";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ municipio: string }> }) {
  const { municipio } = await params;
  const slug = municipio.toLowerCase();
  if (!getMunicipalityBySlug(slug)) return NextResponse.json({ error: "Município desconhecido no catálogo oficial." }, { status: 404 });
  const live = new URL(request.url).searchParams.get("live") === "1";
  if (!live) { const data = citySnapshot(slug); if (data) return NextResponse.json(data); }
  try { return NextResponse.json(await refreshCity(slug, { initial: !live })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar o INE." }, { status: 503 }); }
}

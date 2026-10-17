import type { Metadata } from "next";
import DiscoveryView from "./DiscoveryView";
import { getMunicipalityById } from "@/lib/municipalities";

export const metadata: Metadata = {
  title: "Descobertas | Pergunta ao INE",
  description: "Descobre mudanças verificáveis nos dados oficiais de qualquer município português.",
};

export default async function DiscoveriesPage({ searchParams }: { searchParams: Promise<{ municipio?: string }> }) {
  const query = await searchParams;
  const initialMunicipalityId = query.municipio && getMunicipalityById(query.municipio)?.id || null;
  return <DiscoveryView initialMunicipalityId={initialMunicipalityId} />;
}

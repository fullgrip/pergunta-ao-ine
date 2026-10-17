import CityView from "@/components/city/CityView";
export default async function CityPage({ params }: { params: Promise<{ municipio: string }> }) {
  const { municipio } = await params;
  return <CityView slug={municipio} />;
}

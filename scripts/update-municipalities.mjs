// Manual catalog refresh. The app reads data/municipios.json and never fetches the full list at runtime.
import { writeFile } from "node:fs/promises";

const url = "https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012918&Dim1=S7A2024&lang=PT";
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`INE: HTTP ${response.status}`);
const [result] = await response.json();
if (result?.IndicadorCod !== "0012918" || !Array.isArray(result.Dados?.["2024"])) {
  throw new Error("Resposta do INE inesperada; o catálogo atual foi preservado.");
}

const places = new Map();
const regions = new Map();
for (const row of result.Dados["2024"]) {
  if (row.geocod?.length === 2) regions.set(row.geocod, row.geodsg);
  if (row.geocod?.length === 7) places.set(row.geocod, row.geodsg);
}
if (places.size !== 308) throw new Error(`Esperados 308 municípios; recebidos ${places.size}. O catálogo atual foi preservado.`);

const slug = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const featured = ["1500811", "1500805", "1500807", "1500801"];
const municipalities = [...places].map(([id, name]) => ({ id, name, region: regions.get(id.slice(0, 2)), slug: slug(name) }));
if (municipalities.some((item) => !item.region)) throw new Error("Um município não tem região NUTS II identificada.");
municipalities.sort((a, b) => {
  const aFeatured = featured.indexOf(a.id);
  const bFeatured = featured.indexOf(b.id);
  if (aFeatured >= 0 || bFeatured >= 0) return aFeatured < 0 ? 1 : bFeatured < 0 ? -1 : aFeatured - bFeatured;
  return slug(a.name).localeCompare(slug(b.name), "pt") || a.id.localeCompare(b.id);
});
const used = new Set();
for (const item of municipalities) {
  if (used.has(item.slug)) item.slug += `-${item.id.toLowerCase()}`;
  used.add(item.slug);
}

const catalog = {
  version: "nuts-2024-0012918-2024",
  source: {
    provider: "Instituto Nacional de Estatística",
    indicatorId: "0012918",
    indicatorName: result.IndicadorDsg,
    sourceUrl: url,
    classification: "NUTS 2024",
    referencePeriod: "2024",
    extractedAt: result.DataExtracao,
    lastUpdatedAt: result.DataUltimoAtualizacao,
  },
  count: municipalities.length,
  municipalities,
};
await writeFile(new URL("../data/municipios.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Catálogo atualizado: ${municipalities.length} municípios, fonte INE ${catalog.source.indicatorId}.`);

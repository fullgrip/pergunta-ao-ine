// Versão inglesa (17/10/2026): o fluxo principal (perguntar e responder) existe em PT e EN.
// Os nomes oficiais dos indicadores continuam em português na fonte; aqui ficam os nomes curtos em inglês.

export type Lang = "pt" | "en";
export const isLang = (value: unknown): value is Lang => value === "pt" || value === "en";

export const INDICATOR_EN: Record<string, { name: string; unit: string; subject: string }> = {
  "0014711": { name: "Median rent", unit: "€/m²", subject: "The median rent of new leases" },
  "0012918": { name: "Resident population", unit: "people", subject: "The resident population" },
  "0012136": { name: "Unemployment rate", unit: "%", subject: "The unemployment rate" },
  "0012653": { name: "Average monthly earnings", unit: "€", subject: "Average monthly earnings" },
  "0013312": { name: "Guests per resident", unit: "guests/resident", subject: "Guests per resident" },
  "0012765": { name: "Municipal waste per resident", unit: "kg/resident", subject: "Municipal waste collected per resident" },
  "0014137": { name: "Number of homes", unit: "homes", subject: "The number of homes" },
  "0012255": { name: "Median sale price", unit: "€/m²", subject: "The median sale price of homes" },
  "0012256": { name: "Median bank valuation", unit: "€/m²", subject: "The median bank valuation of homes" },
  "0012909": { name: "Ageing index", unit: "older people per 100 young", subject: "The ageing index" },
  "0013044": { name: "Birth rate", unit: "‰", subject: "The birth rate" },
  "0012260": { name: "Crime rate", unit: "‰", subject: "The crime rate" },
  "0014580": { name: "Purchasing power per person", unit: "(Portugal = 100)", subject: "Purchasing power per person" },
  "0013249": { name: "New homes completed", unit: "homes", subject: "The number of new homes completed" },
};

export const indicatorName = (id: string, fallback: string, lang: Lang) => lang === "en" ? INDICATOR_EN[id]?.name ?? fallback : fallback;
export const indicatorUnit = (id: string, fallback: string, lang: Lang) => lang === "en" ? INDICATOR_EN[id]?.unit ?? fallback : fallback;

/** Period labels from INE come in Portuguese ("2.º Trimestre de 2026"). */
export function periodLabel(period: string, lang: Lang) {
  if (lang !== "en") return period;
  const quarter = period.match(/([1-4])\.?º?\s*trimestre\s+de\s+(\d{4})/i);
  return quarter ? `Q${quarter[1]} ${quarter[2]}` : period;
}

/** Errors are written in Portuguese on the server; the English page shows these equivalents. */
export function englishError(message: string): string {
  const catalogue = message.match(/o INE tem dados que podem ter a ver com isto: (.*?)\. Podes procurar/);
  if (catalogue) return `I can't show this here yet, but INE has data that may be related (titles in Portuguese): ${catalogue[1].replaceAll("código", "code")}. You can look these codes up on ine.pt. For now I can answer about rent, house prices, wages, population, ageing, births, crime, purchasing power, new homes, unemployment, tourists or waste.`;
  const rules: Array<[RegExp, string]> = [
    [/^Ainda não percebi o tema/, "I didn't catch the topic. I can answer about rent, house prices, wages, population, ageing, births, crime, purchasing power, new homes, unemployment, tourists or waste. Try: “How much is rent in Faro?”"],
    [/^Esta versão responde a um indicador/, "This version answers one topic at a time. Pick just one."],
    [/^O catálogo contém a taxa de desemprego/, "INE publishes the unemployment rate, not the number of unemployed people. Ask about the unemployment rate in the Algarve."],
    [/^Não reconhecemos o município/, "I couldn't recognise that municipality. Pick one from the suggestions or use its INE code."],
    [/amb[ií]guo/, "That municipality name is used by more than one place. Use the full name or the INE code."],
    [/^Indique o Algarve/, "Unemployment data is only available for the Algarve. Mention the Algarve in your question."],
    [/^Indique um munic[ií]pio/, "Name a Portuguese municipality in your question, or choose your town below the search box."],
    [/reciclagem/, "There is no recycling data here yet. There is municipal waste collected per resident: try “How much waste is produced in Lagos?”."],
    [/custo de vida/, "There is no single cost-of-living indicator. Ask about rent or wages instead, e.g. “How much do people earn in Faro?”."],
    [/^Não foi possível obter valores numéricos do INE/, "INE returned no values for this question. Try another year or municipality."],
    [/INE.*indispon[ií]vel/, "INE is not responding right now. Please try again in a moment."],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

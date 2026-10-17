import type { CityDashboard, CityObservation, CitySeries } from "../city";
import { percentChange } from "../analysis";

export type StoryEvidence = {
  indicatorId: string;
  indicatorName: string;
  territoryId: string;
  period: string;
  value: number;
  unit: string;
  sourceUrl: string;
  metadataUrl: string;
};

export type StorySection = {
  id: "change" | "snapshot" | "limits";
  eyebrow: string;
  title: string;
  text: string;
  evidence: StoryEvidence[];
  calculation?: { formula: string; result: number; unit: string };
};

export type CityStory = {
  city: CityDashboard["city"];
  mode: CityDashboard["mode"];
  collectedAt: string;
  sections: StorySection[];
  warnings: string[];
  modelUsed: false;
};

const number = (value: number, unit: string) =>
  `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: unit === "pessoas" ? 0 : 2 }).format(value)} ${unit}`;

type NumericObservation = CityObservation & { value: number };

function available(series: CitySeries | undefined): NumericObservation[] {
  return (series?.observations ?? []).filter((row): row is CityObservation & { value: number } =>
    typeof row.value === "number" && Number.isFinite(row.value));
}

function proof(series: CitySeries, row: NumericObservation): StoryEvidence {
  return {
    indicatorId: series.indicatorId,
    indicatorName: series.indicatorName,
    territoryId: series.territoryId,
    period: row.period,
    value: row.value,
    unit: series.unit,
    sourceUrl: row.sourceUrl,
    metadataUrl: series.sourceUrl,
  };
}

/** A história usa só valores presentes no snapshot. Não interpola anos nem infere causas. */
export function buildCityStory(city: CityDashboard): CityStory {
  const rent = city.series.find((series) => series.indicatorId === "0014711" && series.territoryId === city.city.id);
  const wage = city.series.find((series) => series.indicatorId === "0012653" && series.territoryId === city.city.id);
  const population = city.series.find((series) => series.indicatorId === "0012918" && series.territoryId === city.city.id);
  const rentRows = available(rent).sort((a, b) => a.period.localeCompare(b.period));
  const wageRows = available(wage);
  const populationRows = available(population);
  const latestPopulation = populationRows.at(-1);
  const annualChanges = rentRows.slice(1).flatMap((last, index) => {
    const first = rentRows[index];
    const percent = Number(last.period) === Number(first.period) + 1 ? percentChange(first.value, last.value) : null;
    return percent === null ? [] : [{ first, last, percent }];
  });
  const largestAnnual = annualChanges.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))[0];
  const direction = largestAnnual ? largestAnnual.percent > 0 ? "subida" : largestAnnual.percent < 0 ? "descida" : "estabilidade" : "";
  const fmtPercent = (value: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(value);

  const changeSection: StorySection = rent && largestAnnual ? {
    id: "change",
    eyebrow: "01 · PONTO DE VIRAGEM",
    title: `A maior ${direction} anual verificada`,
    text: `Entre ${largestAnnual.first.period} e ${largestAnnual.last.period}, a mediana da renda por m² dos novos contratos em ${city.city.name} passou de ${number(largestAnnual.first.value, rent.unit)} para ${number(largestAnnual.last.value, rent.unit)}. Foi a variação percentual mais acentuada entre os pares de anos consecutivos disponíveis: ${fmtPercent(largestAnnual.percent)}%.`,
    evidence: [proof(rent, largestAnnual.first), proof(rent, largestAnnual.last)],
    calculation: { formula: "((valor final − valor inicial) / |valor inicial|) × 100", result: largestAnnual.percent, unit: "%" },
  } : {
    id: "change", eyebrow: "01 · PONTO DE VIRAGEM", title: "Variação anual ainda por apurar",
    text: "Faltam dois anos consecutivos verificados para calcular uma variação anual das rendas dos novos contratos.", evidence: [],
  };
  const sharedYears = rentRows.filter((row) => wageRows.some((wageRow) => wageRow.period === row.period)).map((row) => row.period).sort();
  const earlier = sharedYears[0];
  const later = sharedYears.at(-1);
  const rentFirst = rentRows.find((row) => row.period === earlier);
  const rentLast = rentRows.find((row) => row.period === later);
  const wageFirst = wageRows.find((row) => row.period === earlier);
  const wageLast = wageRows.find((row) => row.period === later);
  const rentGrowth = rentFirst && rentLast && earlier !== later ? percentChange(rentFirst.value, rentLast.value) : null;
  const wageGrowth = wageFirst && wageLast && earlier !== later ? percentChange(wageFirst.value, wageLast.value) : null;
  const canCompareGrowth = rent && wage && rentFirst && rentLast && wageFirst && wageLast && rentGrowth !== null && wageGrowth !== null;
  const portraitEvidence = population && latestPopulation ? [proof(population, latestPopulation)] : [];
  const snapshotSection: StorySection = {
    id: "snapshot", eyebrow: "02 · RENDA E GANHO", title: canCompareGrowth ? "Duas taxas de variação" : "Comparação ainda incompleta",
    text: canCompareGrowth
      ? `Entre ${earlier} e ${later}, a renda mediana por m² dos novos contratos variou ${fmtPercent(rentGrowth)}%, enquanto o ganho médio mensal dos trabalhadores por conta de outrem a tempo completo com remuneração completa variou ${fmtPercent(wageGrowth)}%. A diferença entre as taxas é ${fmtPercent(rentGrowth - wageGrowth)} pontos percentuais. Isto não mede a parcela do salário gasta em renda: faltam área da habitação, composição do agregado e rendimentos das famílias.`
      : `Ainda não há dois anos comuns verificados de renda e ganho médio mensal para comparar a evolução. ${portraitEvidence.length ? `A população residente de ${city.city.name} era ${number(latestPopulation!.value, population!.unit)} em ${latestPopulation!.period}.` : ""}`.trim(),
    evidence: canCompareGrowth ? [proof(rent, rentFirst), proof(rent, rentLast), proof(wage, wageFirst), proof(wage, wageLast)] : portraitEvidence,
    ...(canCompareGrowth ? { calculation: { formula: "variação % renda − variação % ganho médio", result: rentGrowth - wageGrowth, unit: " p.p." } } : {}),
  };

  const limits: string[] = [];
  if (populationRows.length < 2) limits.push("Um único valor de população não permite concluir se aumentou ou diminuiu.");
  if (annualChanges.length < rentRows.length - 1) limits.push("Pares de anos de renda em falta não foram estimados.");
  if (wageRows.length > 0) limits.push("O ganho médio cobre apenas assalariados a tempo completo com remuneração completa; não representa todos os residentes.");
  limits.push("Hóspedes por habitante não conta pessoas únicas; resíduos por habitante não mede a produção individual de cada residente.");
  limits.push("Os indicadores aqui apresentados não permitem concluir por que razão as rendas mudaram.");
  const qualityWarnings = city.warnings.filter((warning) => /qualidade|coeficiente|desvio|confidencial|§/i.test(warning));
  const limitsSection: StorySection = {
    id: "limits", eyebrow: "03 · O QUE AINDA NÃO SABEMOS", title: "Onde acaba a evidência",
    text: [...limits, ...qualityWarnings].join(" "),
    evidence: [],
  };

  return {
    city: city.city, mode: city.mode, collectedAt: city.collectedAt,
    sections: [changeSection, snapshotSection, limitsSection], warnings: city.warnings, modelUsed: false,
  };
}

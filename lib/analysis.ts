import { z } from "zod";
import { indicators } from "./ine/catalog";
import { periodCodes } from "./ine/client";
import type { Observation } from "./ine/types";
import { getMunicipalityById, resolveMunicipalityMention } from "./municipalities";

export const ParsedQuestionSchema = z.object({
  intent: z.enum(["trend", "comparison"]),
  indicatorId: z.enum(["0014711", "0012918", "0012136", "0012653", "0013312", "0012765"]),
  territoryIds: z.array(z.string()).min(1).max(2),
  startYear: z.number().int().min(2000).max(2100).nullable(),
  endYear: z.number().int().min(2000).max(2100).nullable(),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
});
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;

const normalizeWords = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** A subjective city recommendation needs criteria that the current catalog cannot establish. */
export function isCityChoiceQuestion(question: string) {
  const words = normalizeWords(question);
  return /\b(melhor|ideal|ideais|recomendada|recomendado|escolher)\b/.test(words)
    && /\b(cidade|cidades|municipio|municipios|local|sitio)\b/.test(words)
    && /\b(viver|morar|habitar)\b/.test(words);
}
const indicatorWords: Array<{ id: ParsedQuestion["indicatorId"]; pattern: RegExp }> = [
  { id: "0014711", pattern: /\b(renda|rendas|arrendamento|arrendamentos|aluguer|alugueis)\b/ },
  { id: "0012918", pattern: /\b(populacao|habitante|habitantes|residente|residentes)\b|\b(quantas|quantos) pessoas vivem\b/ },
  { id: "0012136", pattern: /\b(desemprego|desempregado|desempregados|desempregada|desempregadas)\b/ },
  { id: "0012653", pattern: /\b(ganho medio|salario medio|salarios medios|remuneracao media|remuneracoes medias)\b/ },
  { id: "0013312", pattern: /\b(hospedes|turismo|turistico|turistica)\b/ },
  { id: "0012765", pattern: /\b(residuos|lixo)\b/ },
];

/** Limits the model to concepts and dates that the present INE catalog can answer. */
export function questionConstraints(question: string, selectedMunicipalityId?: string) {
  const words = normalizeWords(question);
  const identified = indicatorWords.filter(({ pattern }) => pattern.test(words));
  const mentionedIndicators = /\bpor habitante\b/.test(words) && identified.some(({ id }) => id === "0013312" || id === "0012765")
    ? identified.filter(({ id }) => id !== "0012918") : identified;
  if (mentionedIndicators.length !== 1) {
    throw new Error(mentionedIndicators.length > 1
      ? "Esta versão responde a um indicador de cada vez. Escolha apenas um tema estatístico."
      : "Indique o indicador: rendas, população, desemprego, ganho médio, hóspedes ou resíduos urbanos.");
  }
  const indicatorId = mentionedIndicators[0].id;
  if (indicatorId === "0012136" && /\b(numero|total|quantos|quantas)\b.{0,35}\bdesempregad/.test(words)) {
    throw new Error("O catálogo contém a taxa de desemprego, não o número de pessoas desempregadas. Pergunte pela taxa de desemprego no Algarve.");
  }
  const indicator = indicators.find((item) => item.id === indicatorId)!;
  const municipalityMention = resolveMunicipalityMention(question);
  if (municipalityMention.ambiguous) throw new Error("O nome do município é ambíguo. Escolha uma das sugestões pelo nome completo ou pelo código oficial.");
  const explicitUnresolvedPlace = indicatorId !== "0012136" && municipalityMention.matches.length === 0 &&
    /\b(?:em|no|na)\s+(?!20\d{2}\b|anos?\b|comparacao\b|relacao\b|que\b|qual\b|quais\b|novos?\b|novas?\b)[\p{L}][\p{L}\s-]*/iu.test(question);
  if (explicitUnresolvedPlace) throw new Error("Não reconhecemos o município indicado. Escolha uma sugestão do catálogo oficial ou use o código INE.");
  let mentionedTerritories = indicatorId === "0012136"
    ? indicator.supportedTerritories.filter(({ name }) => new RegExp(`\\b${normalizeWords(name)}\\b`).test(words))
    : municipalityMention.matches.filter(({ id }) => indicator.supportedTerritories.some((item) => item.id === id));
  if (indicatorId !== "0012136" && !mentionedTerritories.length && selectedMunicipalityId) {
    const selected = getMunicipalityById(selectedMunicipalityId);
    if (selected && indicator.supportedTerritories.some((item) => item.id === selected.id)) mentionedTerritories = [selected];
  }
  if (!mentionedTerritories.length) {
    throw new Error(`Indique ${indicatorId === "0012136" ? "o Algarve" : "um município português"} na pergunta ou selecione-o no campo de pesquisa.`);
  }
  if (mentionedTerritories.length > 2) throw new Error("A pergunta livre compara, no máximo, dois territórios de cada vez.");
  const years = [...new Set((words.match(/\b20\d{2}\b/g) ?? []).map(Number))];
  if (years.length > 2) throw new Error("Indique no máximo dois anos para definir um intervalo.");
  if (mentionedTerritories.length === 1 && years.length < 2 && /\b(vs|versus|comparar|compare|comparacao|comparado|comparada)\b/.test(words)) {
    throw new Error("Para comparar territórios, indique dois nomes suportados pelo indicador.");
  }
  const availableYears = indicator.years.map(Number);
  const unavailableYear = years.find((year) => !availableYears.includes(year));
  if (unavailableYear !== undefined) {
    throw new Error(`O indicador ${indicator.shortName.toLowerCase()} só está disponível no catálogo entre ${availableYears[0]} e ${availableYears.at(-1)}; ${unavailableYear} fica fora desse intervalo.`);
  }
  const quarterMatch = words.match(/\b([1-4])(?:\.[ºo]?|[ºo])?\s*(?:trimestre|trim)\b|\bq([1-4])\b/);
  if (!quarterMatch && /\b\d+(?:\.[ºo]?|[ºo])?\s*(?:trimestre|trim)\b|\bq\d+\b/.test(words)) {
    throw new Error("O trimestre deve ser um valor entre o primeiro e o quarto.");
  }
  const quarter = quarterMatch ? Number(quarterMatch[1] ?? quarterMatch[2]) : undefined;
  if (quarter !== undefined) {
    if (indicator.frequency !== "Trimestral") throw new Error("Este indicador é anual; não existe valor por trimestre no catálogo.");
    if (!years.length) throw new Error("Indique o ano juntamente com o trimestre pretendido.");
    if (years.some((year) => !periodCodes(indicator, year).some(({ code }) => code === `S5A${year}${quarter}`))) {
      throw new Error("O trimestre pedido ainda não está publicado no catálogo deste indicador.");
    }
  }
  const singleYear = years[0];
  const startYear = years.length === 2 ? Math.min(...years) : singleYear === undefined || /\bate\s+20\d{2}\b/.test(words) ? null : singleYear;
  const endYear = years.length === 2 ? Math.max(...years) : singleYear === undefined || /\bdesde\s+20\d{2}\b/.test(words) ? null : singleYear;
  return {
    indicatorId,
    territoryIds: mentionedTerritories.map(({ id }) => id),
    intent: mentionedTerritories.length === 2 ? "comparison" as const : "trend" as const,
    startYear,
    endYear,
    ...(quarter === undefined ? {} : { quarter }),
  };
}

export function validateQuestionPlan(question: string, modelPlan: ParsedQuestion, selectedMunicipalityId?: string): ParsedQuestion {
  const expected = questionConstraints(question, selectedMunicipalityId);
  if (modelPlan.indicatorId !== expected.indicatorId || modelPlan.intent !== expected.intent ||
    modelPlan.territoryIds.length !== expected.territoryIds.length ||
    new Set(modelPlan.territoryIds).size !== modelPlan.territoryIds.length ||
    !modelPlan.territoryIds.every((id) => expected.territoryIds.includes(id))) {
    throw new Error("O Gemma devolveu um plano diferente do indicador ou dos territórios pedidos.");
  }
  // Explicit years come from the user's text, not from the model's guesses.
  const { quarter: _modelQuarter, ...plan } = modelPlan;
  return { ...plan, startYear: expected.startYear, endYear: expected.endYear, ...(expected.quarter === undefined ? {} : { quarter: expected.quarter }) };
}
export function percentChange(first: number | null, last: number | null): number | null {
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}
export function absoluteChange(first: number | null, last: number | null): number | null { return first === null || last === null ? null : last - first; }
export function seriesSummary(observations: Observation[]) {
  const available = observations.filter((row) => row.value !== null);
  const last = available.at(-1);
  const quarterly = available.length > 0 && available.every((row) => /^S5A\d{4}[1-4]$/.test(row.periodCode));
  const comparable = quarterly ? sameQuarterComparison(available) : null;
  const first = quarterly ? comparable?.previous ?? last : available[0];
  if (!first || !last) return null;
  return { first, last, absolute: first !== last ? absoluteChange(first.value, last.value) : null, percent: first !== last ? percentChange(first.value, last.value) : null };
}
/** Compares the latest quarterly observation with the same quarter one year earlier. */
export function sameQuarterComparison(observations: Observation[]) {
  const available = observations.filter((row): row is Observation & { value: number } =>
    typeof row.value === "number" && Number.isFinite(row.value));
  const current = available.at(-1);
  if (!current) return null;
  const match = /^S5A(\d{4})([1-4])$/.exec(current.periodCode);
  if (!match) return null;
  const previousCode = `S5A${Number(match[1]) - 1}${match[2]}`;
  const previous = available.find((row) => row.periodCode === previousCode);
  if (!previous) return null;
  return { previous, current, percentagePointChange: current.value - previous.value };
}
export function allowedTerritory(indicatorId: string, territoryId: string) {
  const item = indicators.find((indicator) => indicator.id === indicatorId);
  return item?.supportedTerritories.find((territory) => territory.id === territoryId);
}

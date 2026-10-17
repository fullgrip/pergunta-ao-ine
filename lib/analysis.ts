import { z } from "zod";
import { indicators } from "./ine/catalog";
import { periodCodes } from "./ine/client";
import type { Observation } from "./ine/types";
import { getMunicipalityById, resolveMunicipalityMention } from "./municipalities";

export const ParsedQuestionSchema = z.object({
  intent: z.enum(["trend", "comparison"]),
  indicatorId: z.enum(["0014711", "0012918", "0012136", "0012653", "0013312", "0012765", "0014137", "0012255", "0012256", "0012909", "0013044", "0012260", "0014580", "0013249"]),
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
  return (/\b(melhor|ideal|ideais|recomendada|recomendado|escolher)\b/.test(words)
    && /\b(cidade|cidades|municipio|municipios|local|sitio)\b/.test(words)
    && /\b(viver|morar|habitar)\b/.test(words))
    || /\bvale a pena (ir )?(viver|morar)\b|\bdevo (ir )?(viver|morar|mudar)\b|\bmudar-me para\b/.test(words);
}
// Inclui a forma como as pessoas perguntam de facto ("quanto se ganha?", "quanto custa arrendar?"),
// não só o nome técnico do indicador.
const indicatorWords: Array<{ id: ParsedQuestion["indicatorId"]; pattern: RegExp }> = [
  { id: "0014711", pattern: /\b(renda|rendas|arrendamento|arrendamentos|arrendar|arrenda|aluguer|alugueres|alugueis|alugar)\b/ },
  { id: "0012918", pattern: /\b(populacao|habitante|habitantes|residente|residentes|moradores|moram)\b|\b(quantas|quantos) pessoas (vivem|moram|ha|habitam|residem|tem)\b|\bquanta gente\b/ },
  { id: "0012136", pattern: /\b(desemprego|desempregado|desempregados|desempregada|desempregadas|emprego|empregos)\b|\bsem (emprego|trabalho)\b|\b(arranjar|encontrar|procurar|conseguir) (um )?trabalho\b|\b(ha|existe|tem) (muito |pouco )?trabalho\b/ },
  { id: "0012653", pattern: /\b(ganho|ganhos|ganha|ganham|ganhar|salario|salarios|ordenado|ordenados|vencimento|vencimentos|remuneracao|remuneracoes|rendimento|rendimentos)\b|\bse recebe\b|\b(pessoas|trabalhadores|trabalhador|funcionarios) (\p{L}+ )?recebem?\b|\brecebem? por mes\b|\bpaga(-se| se)? bem\b|\bpagam bem\b/u },
  { id: "0013312", pattern: /\b(hospedes|turismo|turistico|turistica|turista|turistas|visitantes)\b/ },
  { id: "0012765", pattern: /\b(residuos|lixo)\b/ },
  { id: "0014137", pattern: /\b(quantas|muitas|poucas|numero de|total de) (casas|habitacoes|alojamentos|fogos|moradias)\b|\bparque habitacional\b|\bcasas (vazias|de ferias)\b/ },
  { id: "0012255", pattern: /\b(comprar|compra|venda|vendas|vender|vende-se)\b|\b(preco|precos|valor|valores) (das|de|da|do) (casas?|habitac\p{L}*|imoveis|apartamentos?|metro quadrado|m2)\b|\bhabitacao (esta )?cara\b|\bcasas (estao )?caras\b/u },
  { id: "0012256", pattern: /\bavaliac\p{L}* bancari\p{L}*|\b(banco|bancos) avalia\p{L}*|\bvale\b.{0,40}\b(banco|bancos)\b|\b(banco|bancos)\b.{0,40}\bvale\b/u },
  { id: "0012909", pattern: /\b(idosos|idosas|velhos|velhinhos|envelhecimento|envelhecida|envelhecido|terceira idade|reformados)\b/ },
  { id: "0013044", pattern: /\b(natalidade|nascimentos|nascem|nasceram|bebes|nados)\b/ },
  { id: "0012260", pattern: /\b(crime|crimes|criminalidade|seguranca|perigos[ao]s?|assaltos?|roubos?)\b|\b(e|sera|e uma terra|e uma cidade) segur[ao]\b/ },
  { id: "0014580", pattern: /\bpoder de compra\b|\b(ricos?|ricas?|pobres?|riqueza)\b/ },
  { id: "0013249", pattern: /\b(construcao|construir|constroem|construiram|construidas|construidos|obras|fogos concluidos)\b|\bcasas novas\b/ },
];
// Só quando nenhum tema foi reconhecido: perguntas sobre o tamanho ou o crescimento de uma terra.
const populationFallback = /\b(crescer|cresce|cresceu|tamanho|gente|despovoa\p{L}*)\b/u;
// Temas que as pessoas pedem e que o catálogo ainda não tem: dizer o que existe em vez de um erro genérico.
const notInCatalog: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\b(recicla\p{L}*|reciclagem)\b/u,
    message: "Ainda não temos dados de reciclagem. Temos os resíduos urbanos recolhidos por habitante: experimenta «Quanto lixo se produz em Lagos?»." },
  { pattern: /\bcust(o|a) (de )?vida\b|\bcusta viver\b/,
    message: "Não há um indicador único de custo de vida. Podes perguntar pelas rendas ou pelo ganho médio, por exemplo «Quanto se ganha em Faro?»." },
];

// Catálogo municipal do INE (744 conceitos com dados de 2021 em diante; extraído a 3/10/2026).
// Serve para dizer com honestidade o que existe quando a pergunta sai dos temas que a app sabe mostrar.
import catalogo from "@/data/ine-catalogo-municipal.json";
const STOP = new Set(["qual", "quais", "quanto", "quanta", "quantos", "quantas", "como", "onde", "esta", "estao", "muito", "muita", "muitos", "muitas", "pouco", "tem", "temos", "existe", "existem", "para", "pela", "pelo", "numa", "num", "uma", "das", "dos", "que", "sobre", "cidade", "terra", "municipio", "concelho", "ano", "anos", "agora", "hoje", "mais", "menos"]);
const SYNONYMS: Record<string, string[]> = { vot: ["eleic", "votant", "absten"], escol: ["ensino", "alunos"], medic: ["saude", "medic", "farmac", "hospit"], idos: ["envelh", "idade"], jove: ["jovens", "idade"], carro: ["veicul", "automov"], empres: ["empresas", "sociedades"] };
export function catalogSuggestions(question: string, limit = 3): Array<{ id: string; title: string }> {
  const words = normalizeWords(question).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
  const stems = new Set(words.flatMap((word) => [word.length >= 6 ? word.slice(0, 5) : word, ...Object.entries(SYNONYMS).filter(([key]) => word.startsWith(key)).flatMap(([, extra]) => extra)]));
  if (!stems.size) return [];
  const matches = (titleWords: string[], stem: string) => titleWords.some((word) => stem.length >= 5 ? word.startsWith(stem) : word === stem || word === `${stem}s`);
  return (catalogo as Array<{ id: string; t: string }>)
    .map((item) => { const titleWords = normalizeWords(item.t).split(/[^a-z0-9]+/); return { id: item.id, title: item.t, score: [...stems].filter((stem) => matches(titleWords, stem)).length }; })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length)
    .slice(0, limit)
    .map(({ id, title }) => ({ id, title }));
}
function unknownTopicMessage(question: string) {
  const found = catalogSuggestions(question);
  const themes = "rendas, preço das casas, salários, população, idosos, nascimentos, crime, poder de compra, casas novas, desemprego, turistas ou lixo";
  if (!found.length) return `Ainda não percebi o tema. Sei responder sobre ${themes}. Por exemplo: «Quanto se ganha em Faro?».`;
  return `Ainda não sei mostrar isto aqui, mas o INE tem dados que podem ter a ver com isto: ${found.map((item) => `«${item.title}» (código ${item.id})`).join("; ")}. Podes procurar esses códigos em ine.pt. Por agora sei responder sobre ${themes}.`;
}

/** Limits the model to concepts and dates that the present INE catalog can answer. */
export function questionConstraints(question: string, selectedMunicipalityId?: string) {
  const words = normalizeWords(question);
  let identified = indicatorWords.filter(({ pattern }) => pattern.test(words));
  // Desempates entre temas parecidos, pela palavra mais específica.
  const has = (id: string) => identified.some((item) => item.id === id);
  const drop = (...ids: string[]) => { identified = identified.filter((item) => !ids.includes(item.id)); };
  // Um tema específico ganha à população ("a população está envelhecida?", "crimes por habitante").
  if (identified.some((item) => !["0012918", "0014711", "0012653"].includes(item.id))) drop("0012918");
  if (has("0014580")) drop("0012255");                                   // "poder de compra" não é comprar casa
  if (has("0014711") && /\b(arrend|alug)/.test(words)) drop("0012255");  // "preço das casas para arrendar"
  if (has("0012256")) drop("0012255", "0014137");                                   // avaliação bancária é mais específica
  if (has("0013249")) drop("0014137");                                   // "muitas casas novas" é construção
  if (identified.length > 1 && has("0014137") && /\b(arrend|alug|comprar|venda)/.test(words)) drop("0014137");
  if (!identified.length) {
    const missing = notInCatalog.find(({ pattern }) => pattern.test(words));
    if (missing) throw new Error(missing.message);
    if (populationFallback.test(words)) identified = indicatorWords.filter(({ id }) => id === "0012918");
  }
  // "por habitante" e "quantas pessoas ... sem emprego" falam de pessoas sem pedirem a população.
  const mentionedIndicators = (/\bpor habitante\b/.test(words) && identified.some(({ id }) => id === "0013312" || id === "0012765"))
    || identified.some(({ id }) => id === "0012136")
    ? identified.filter(({ id }) => id !== "0012918") : identified;
  if (mentionedIndicators.length !== 1) {
    throw new Error(mentionedIndicators.length > 1
      ? "Esta versão responde a um indicador de cada vez. Escolha apenas um tema estatístico."
      : unknownTopicMessage(question));
  }
  const indicatorId = mentionedIndicators[0].id;
  if (indicatorId === "0012136" && /\b(numero|total|quantos|quantas)\b.{0,35}\b(desempregad|sem emprego|sem trabalho)/.test(words)) {
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

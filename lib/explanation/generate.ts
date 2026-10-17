import { z } from "zod";
import { chatWithMetadata } from "@/lib/ollama";
import type { Explanation, ResponseTone, StatisticalEvidence } from "./evidence";
import { INDICATOR_EN, periodLabel } from "@/lib/i18n";

const OutputSchema = z.object({
  headline: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(700).optional(),
  caveat: z.string().trim().max(350).optional(),
  // Accept the previous structured shape while a local Ollama model is being updated.
  title: z.string().trim().max(130).optional(),
  body: z.string().trim().max(700).optional(),
});
// Cada tom tem uma voz própria e concreta. Os números vêm sempre do servidor; aqui só muda a forma de explicar.
const TONE_INSTRUCTIONS: Record<ResponseTone, string> = {
  direct: "Tom DIRETO: UMA frase só, no máximo vinte palavras, seca e sem adjetivos, a dizer o que esta mudança quer dizer para quem lê. Os números já aparecem antes da tua frase: não os repitas nem expliques a definição.",
  friend: "Tom AMIGO: fala como um amigo da mesma idade falaria com um adolescente português, por tu, frases curtas e descontraídas, sem palavras difíceis. Usa uma comparação com o dia a dia de um jovem (a escola, o telemóvel, sair com os amigos), sem números. Nada de calão ofensivo nem de exageros. Calão de Portugal, nunca do Brasil: diz \"dinheiro\", nunca \"grana\"; nunca uses \"você\", \"galera\", \"legal\" nem \"cara\".",
  journalist: "Tom JORNALISTA: escreve como o primeiro parágrafo de uma notícia de jornal português. Abre com uma frase que prenda a atenção de quem vive na terra, depois dá o contexto da medida. Informativo, nunca sensacionalista.",
  teacher: "Tom PROFESSOR: fala com um aluno curioso, por tu. Ensina o conceito com um exemplo do dia a dia ligado ao tema da pergunta (se a medida for uma mediana: pôr os valores em fila e ver o do meio; se for uma taxa: pensar num grupo de mil pessoas). Distingue o que os dados mostram do que não mostram.",
  researcher: "Tom INVESTIGADOR: registo técnico e preciso. Define a medida, a unidade e a cobertura da série, e aponta os limites de comparabilidade. Sem opiniões.",
  executive: "Tom EXECUTIVO: escreve para quem tem de decidir (uma família, um negócio, a câmara municipal). Uma frase sobre o que isto quer dizer na prática e uma ressalva. Qualquer hipótese é apresentada como hipótese.",
  sarcastic: "Tom SARCÁSTICO: ironia seca e bem-humorada, à portuguesa, sobre a situação que os dados descrevem (ou sobre ler estatísticas), nunca sobre pessoas ou grupos. A piada não pode mudar o que os dados dizem.",
};

function pt(value: number, maxDigits = 2) { return value.toLocaleString("pt-PT", { maximumFractionDigits: maxDigits }); }

export function verifiedFactLine(evidence: Readonly<StatisticalEvidence>): string {
  const indicator = evidence.indicator;
  const valid = evidence.observations.filter((row) => row.value !== null);
  if (!valid.length) return "Não há valores numéricos verificados nesta análise.";
  const homologue = evidence.calculations.find((item) => item.label === "Variação homóloga em pontos percentuais");
  if (homologue && valid.length >= 2) {
    const current = valid.at(-1)!;
    const previous = [...valid].reverse().find((row) => row !== current && row.periodCode.slice(-1) === current.periodCode.slice(-1));
    if (previous) return `No ${previous.period}, ${previous.territory} registou ${pt(previous.value!)} ${indicator.unit}; no ${current.period}, registou ${pt(current.value!)} ${indicator.unit} (${homologue.value >= 0 ? "+" : ""}${pt(homologue.value)} ${homologue.unit}).`;
  }
  if (valid.length === 1) {
    const row = valid[0];
    return `${indicator.shortName} em ${row.territory}: ${pt(row.value!)} ${indicator.unit} em ${row.period}.`;
  }
  if (new Set(valid.map((row) => row.territoryId)).size > 1) {
    const latestByTerritory = [...new Map(valid.map((row) => [row.territoryId, row])).values()];
    const sharedPeriod = latestByTerritory.every((row) => row.periodCode === latestByTerritory[0].periodCode);
    if (!sharedPeriod) return `Os territórios consultados não têm um período comum suficiente para uma comparação direta de ${indicator.shortName.toLowerCase()}.`;
    return `${indicator.shortName} em ${latestByTerritory[0].period}: ${latestByTerritory.map((row) => `${row.territory} ${pt(row.value!)} ${indicator.unit}`).join("; ")}.`;
  }
  const first = valid[0]; const last = valid.at(-1)!;
  const summary = evidence.summaries.find((item) => item?.territory === first.territory);
  const variation = summary?.percent != null && first.territory === last.territory
    ? ` (${summary.percent >= 0 ? "+" : ""}${pt(summary.percent, 1)} %)` : "";
  return `${indicator.shortName} em ${first.territory}: ${pt(first.value!)} ${indicator.unit} em ${first.period}; ${pt(last.value!)} ${indicator.unit} em ${last.period}${variation}.`;
}

/** A concise conclusion assembled from checked observations, shared by every tone. */
export function factualHeadline(evidence: Readonly<StatisticalEvidence>): string {
  const rows = evidence.observations.filter((row) => row.value !== null);
  if (!rows.length) return "Não há dados suficientes para responder à pergunta.";
  const indicator = evidence.indicator;
  const subject = indicator.id === "0014711" ? "A renda mediana dos novos contratos"
    : indicator.id === "0012136" ? "A taxa de desemprego"
    : indicator.id === "0012918" ? "A população residente"
    : indicator.id === "0012653" ? "O ganho médio mensal"
    : indicator.id === "0013312" ? "O número de hóspedes por habitante"
    : indicator.id === "0012765" ? "A quantidade de resíduos urbanos recolhidos por habitante"
    : indicator.id === "0014137" ? "O número de casas"
    : indicator.id === "0012255" ? "O preço mediano de venda das casas"
    : indicator.id === "0012256" ? "A avaliação bancária mediana das casas"
    : indicator.id === "0012909" ? "O índice de envelhecimento"
    : indicator.id === "0013044" ? "A taxa de natalidade"
    : indicator.id === "0012260" ? "A taxa de criminalidade"
    : indicator.id === "0014580" ? "O poder de compra por pessoa"
    : indicator.id === "0013249" ? "O número de casas novas concluídas"
    : `O valor de ${indicator.shortName.toLowerCase()}`;
  const territories = [...new Map(rows.map((row) => [row.territoryId, row])).values()];
  if (territories.length > 1) {
    if (!territories.every((row) => row.periodCode === territories[0].periodCode))
      return "Não é possível comparar estes territórios sem observações do mesmo período.";
    const [first, second] = territories;
    if (first.value === second.value) return `O valor de ${indicator.shortName.toLowerCase()} era igual em ${first.territory} e ${second.territory} em ${first.period}.`;
    const higher = first.value! > second.value! ? first : second;
    const lower = higher === first ? second : first;
    return `O valor de ${indicator.shortName.toLowerCase()} era superior em ${higher.territory} ao de ${lower.territory} em ${first.period}.`;
  }
  const latest = rows.at(-1)!;
  const asksTrend = /evolu|mudou|cresceu|subiu|desceu|aumentou|diminuiu|tend[eê]ncia/i.test(evidence.question);
  if (rows.length === 1) return asksTrend
    ? `Não é possível concluir a evolução em ${latest.territory} com apenas um período.`
    : `${subject} em ${latest.territory} era ${pt(latest.value!)} ${indicator.unit} em ${latest.period}.`;
  if (indicator.id === "0012136") {
    const comparison = evidence.calculations.find((item) => item.label === "Variação homóloga em pontos percentuais");
    if (!comparison) return "Não é possível concluir a tendência trimestral sem uma comparação homóloga.";
    const verb = comparison.value > 0 ? "subiu" : comparison.value < 0 ? "desceu" : "manteve-se estável";
    return `${subject} no Algarve ${verb} face ao mesmo trimestre do ano anterior.`;
  }
  const first = rows[0];
  const change = latest.value! - first.value!;
  const verb = change > 0 ? "subiu" : change < 0 ? "desceu" : "não mudou";
  return `${subject} ${verb} em ${latest.territory} entre ${first.period} e ${latest.period}.`;
}

/** English version of the factual headline (same logic, same evidence). */
export function factualHeadlineEn(evidence: Readonly<StatisticalEvidence>): string {
  const rows = evidence.observations.filter((row) => row.value !== null);
  if (!rows.length) return "There is not enough data to answer this question.";
  const indicator = evidence.indicator;
  const en = INDICATOR_EN[indicator.id] ?? { name: indicator.shortName, unit: indicator.unit, subject: indicator.shortName };
  const territories = [...new Map(rows.map((row) => [row.territoryId, row])).values()];
  if (territories.length > 1) {
    if (!territories.every((row) => row.periodCode === territories[0].periodCode)) return "These places cannot be compared without values for the same period.";
    const [first, second] = territories;
    if (first.value === second.value) return `${en.subject} was the same in ${first.territory} and ${second.territory} in ${periodLabel(first.period, "en")}.`;
    const higher = first.value! > second.value! ? first : second;
    const lower = higher === first ? second : first;
    return `${en.subject} was higher in ${higher.territory} than in ${lower.territory} in ${periodLabel(first.period, "en")}.`;
  }
  const latest = rows.at(-1)!;
  if (rows.length === 1) return `${en.subject} in ${latest.territory} was ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(latest.value!)} ${en.unit} in ${periodLabel(latest.period, "en")}.`;
  if (indicator.id === "0012136") {
    const comparison = evidence.calculations.find((item) => item.label === "Variação homóloga em pontos percentuais");
    if (!comparison) return "The quarterly trend cannot be judged without a same-quarter comparison.";
    return `${en.subject} in the Algarve ${comparison.value > 0 ? "rose" : comparison.value < 0 ? "fell" : "held steady"} compared with the same quarter a year earlier.`;
  }
  const first = rows[0];
  const change = latest.value! - first.value!;
  return `${en.subject} in ${latest.territory} ${change > 0 ? "rose" : change < 0 ? "fell" : "did not change"} between ${periodLabel(first.period, "en")} and ${periodLabel(latest.period, "en")}.`;
}

const LIMITATIONS_EN: Array<[RegExp, string]> = [
  [/aviso de qualidade/, "Some INE values carry a quality warning (§)."],
  [/apenas um per[ií]odo/, "Only one period is available; another one is needed to see a trend."],
  [/desemprego trimestral/, "Quarterly unemployment in the Algarve is seasonal; changes compare the same quarter a year earlier."],
  [/renda [eé] a mediana/, "Rent is the median per m² of new leases; it does not cover all existing leases."],
];
function criticalCaveatEn(evidence: Readonly<StatisticalEvidence>): string | null {
  const pt = criticalCaveat(evidence);
  if (!pt) return null;
  if (/^Existe apenas um per[ií]odo/.test(pt)) return "Only one period is available; another one is needed to see a trend.";
  if (/^Faltam observa/.test(pt)) return "There are no values for the same period, so a direct comparison is not possible.";
  const snapshot = pt.match(/Snapshot oficial verificado em (\S+?);/);
  if (snapshot) return `Official INE snapshot checked on ${snapshot[1]}; it may not include the latest values.`;
  return LIMITATIONS_EN.find(([pattern]) => pattern.test(pt))?.[1] ?? "Some INE requests did not return every value; the table shows what was returned.";
}

function criticalCaveat(evidence: Readonly<StatisticalEvidence>): string | null {
  const rows = evidence.observations.filter((row) => row.value !== null);
  if (rows.length === 1)
    return "Existe apenas um período verificado; é preciso outro período para avaliar uma evolução.";
  if (new Set(rows.map((row) => row.territoryId)).size > 1 &&
    new Set([...new Map(rows.map((row) => [row.territoryId, row])).values()].map((row) => row.periodCode)).size > 1)
    return "Faltam observações do mesmo período para uma comparação direta.";
  return evidence.limitations.find(Boolean) ?? null;
}

function contradictsConclusion(detail: string, headline: string): boolean {
  if (/\b(?:rose|higher)\b/i.test(headline)) return /\b(?:fell|fallen|decreased|dropped|lower)\b/i.test(detail);
  if (/\b(?:fell|lower)\b/i.test(headline)) return /\b(?:rose|risen|increased|grew|higher)\b/i.test(detail);
  if (/^N[aã]o [eé] poss[ií]vel|^N[aã]o h[aá] dados/i.test(headline))
    return /\b(?:subiu|aumentou|cresceu|desceu|diminuiu|caiu|lidera|superior|inferior)\b/i.test(detail);
  if (/\b(?:subiu|aumentou|superior)\b/i.test(headline))
    return /\b(?:desceu|diminuiu|caiu|inferior)\b/i.test(detail);
  if (/\b(?:desceu|diminuiu|inferior)\b/i.test(headline))
    return /\b(?:subiu|aumentou|cresceu|superior)\b/i.test(detail);
  return false;
}

function addsUnsupportedInterpretation(detail: string, evidence: Readonly<StatisticalEvidence>): boolean {
  if (evidence.indicator.id === "0014711" && /\b(?:m[eé]dia|m[eé]dio|m[eé]dios|m[eé]dias)\b/i.test(detail)) return true;
  // Também recusa conclusões que os dados não provam: "risco" a partir de crimes registados, "rendimento disponível" a partir do ganho bruto.
  if (/\b(?:risco|riscos|arriscad[ao]|insegur\p{L}*|perigos[ao]s?)\b|\brendimento (?:mensal )?dispon[ií]vel\b/iu.test(detail)) return true;
  if (/\b(?:caused|due to|driven by|because of|impact|effect|significant(?:ly)?|pressure|record|risk|risky|disposable income|reflects?|average)\b/i.test(detail)) return true;
  return /\b(?:reflete|refletem|causou|provocou|devido|impulsionad[ao]s?|explica|efeito|impacto|din[aâ]mica|significativ[ao]s?|press[aã]o|recorde|disparad[ao]s?)\b/i.test(detail);
}

function allowedNumbers(evidence: Readonly<StatisticalEvidence>): number[] {
  const values = evidence.observations.flatMap((row) => [row.value, ...Array.from(row.period.matchAll(/\d+(?:[.,]\d+)?/g), (match) => Number(match[0].replace(",", ".")))]);
  const calculations = [...evidence.calculations.map((item) => item.value), ...evidence.summaries.flatMap((item) => item ? [item.absolute, item.percent] : [])]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const explicitRounding = calculations.flatMap((value) => [Number(value.toFixed(0)), Number(value.toFixed(1)), Number(value.toFixed(2))]);
  return [...values, ...calculations, ...explicitRounding, Number(evidence.indicator.id)].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

/** Refuse any numeric assertion not present in the immutable evidence or a rounded calculation. */
// Expressões que fazem parte da definição de uma taxa ("por cada mil habitantes", "por cada 100 jovens",
// "a média do país é 100"): não são números afirmados pelo modelo, são a própria unidade.
export function withoutRateBase(text: string): string {
  return text.replace(/\bpor (?:cada )?(?:mil|1\s?000|cem|100) (?:habitantes|pessoas|jovens|residentes)\b/giu, "por cada base")
    .replace(/\b(?:per|for every) (?:one )?(?:thousand|1,?000|hundred|100) (?:residents|inhabitants|people|young people|children)\b/giu, "per base")
    .replace(/\b(?:aged )?(?:65|sixty-five)(?: years)?(?: or older| and over| or over)\b|\bunder (?:15|fifteen)\b/giu, "age band")
    .replace(/\b(?:m[eé]dia (?:do pa[ií]s|nacional)) (?:[eé]|igual a|de) (?:100|cem)\b/giu, "média nacional")
    .replace(/\b(?:65|sessenta e cinco) (?:ou mais )?anos(?: ou mais)?\b/giu, "idade de idoso")
    .replace(/\b(?:menos de|abaixo dos?) (?:15|quinze) anos\b/giu, "idade jovem");
}
export function hasOnlySupportedNumbers(text: string, evidence: Readonly<StatisticalEvidence>): boolean {
  const allowed = allowedNumbers(evidence);
  const withoutUnit = withoutRateBase(text).replaceAll(evidence.indicator.unit, "");
  const numbers = Array.from(withoutUnit.matchAll(/(?<![\p{L}\d])-?\d+(?:[.,]\d+)?/gu), (match) => Number(match[0].replace(",", ".")));
  if (numbers.some((value) => !allowed.some((candidate) => Math.abs(value - candidate) < 1e-9))) return false;
  if (/\b(?:dobr(?:ou|aram|ou-se)|duplic(?:ou|aram)|triplic(?:ou|aram)|metade|recorde|sempre|todos|todas|maior do pa[ií]s|menor do pa[ií]s)\b/i.test(text)) return false;
  if (/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|hundred|thousand|million|doubled|tripled|half|always|record)\b/i.test(withoutRateBase(text))) return false;
  if (/\b(?:zero|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|milh[aã]o|milh[oõ]es)\b/i.test(withoutRateBase(text))) return false;
  if (evidence.indicator.id === "0012136" && /\b(?:tend[eê]ncia de (?:descida|queda|diminui[cç][aã]o)|descida sustentada|queda sustentada|continua a (?:cair|descer|diminuir))\b/i.test(text)) return false;
  return true;
}

function safeDetail(tone: ResponseTone): string {
  const lead: Record<ResponseTone, string> = {
    direct: "Esta leitura resume apenas as observações oficiais disponíveis.",
    friend: "Resumindo: os números são estes e quem os publica é o INE. Sem mistérios.",
    journalist: "A leitura reúne os valores publicados e preserva o contexto do indicador.",
    teacher: "A comparação usa a mesma medida nos períodos disponíveis.",
    researcher: "A interpretação limita-se à série, à unidade e aos períodos observados.",
    executive: "Esta informação ajuda a enquadrar a decisão, sem provar as suas causas.",
    sarcastic: "Os números falam com convicção; as causas, essas, ainda não deram entrevista.",
  };
  return lead[tone];
}

const formatFor = (lang: "pt" | "en") => (value: number, maxDigits = 2) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "pt-PT", { maximumFractionDigits: maxDigits, useGrouping: "always" }).format(value);
/** Estilo Direto: "de X para Y (ano → ano): +diferença, +%". Só valores e contas verificados. */
export function directNumbersLine(evidence: Readonly<StatisticalEvidence>): string | null {
  const en = evidence.lang === "en";
  const num = formatFor(en ? "en" : "pt");
  const signed = (value: number, maxDigits = 2) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value), maxDigits)}`;
  const period = (label: string) => en ? periodLabel(label, "en") : label;
  const rows = evidence.observations.filter((row) => row.value !== null);
  if (!rows.length) return null;
  const unit = en ? INDICATOR_EN[evidence.indicator.id]?.unit ?? evidence.indicator.unit : evidence.indicator.unit;
  const territories = [...new Map(rows.map((row) => [row.territoryId, row])).values()];
  if (territories.length > 1) {
    const latest = territories.map((first) => rows.filter((row) => row.territoryId === first.territoryId).at(-1)!);
    if (!latest.every((row) => row.periodCode === latest[0].periodCode)) return null;
    const sorted = [...latest].sort((a, b) => b.value! - a.value!);
    const gap = sorted[0].value! - sorted.at(-1)!.value!;
    return `${sorted.map((row) => `${row.territory}: ${num(row.value!)} ${unit}`).join(" · ")} (${period(latest[0].period)}). ${en ? "Difference" : "Diferença"}: ${num(gap)} ${unit}.`;
  }
  const homologue = evidence.calculations.find((item) => item.label === "Variação homóloga em pontos percentuais");
  const current = rows.at(-1)!;
  if (homologue) {
    const previous = [...rows].reverse().find((row) => row !== current && row.periodCode.slice(-1) === current.periodCode.slice(-1));
    if (previous) return `${en ? "From" : "De"} ${num(previous.value!)} % ${en ? "to" : "para"} ${num(current.value!)} % (${period(previous.period)} → ${period(current.period)}): ${signed(homologue.value, 1)} p.p.`;
  }
  if (rows.length === 1) return `${num(current.value!)} ${unit} (${period(current.period)}).`;
  const first = rows[0];
  const summary = evidence.summaries.find((item) => item?.territory === first.territory);
  const percent = summary?.percent != null ? `, ${signed(summary.percent, 1)} %` : "";
  return `${en ? "From" : "De"} ${num(first.value!)} ${en ? "to" : "para"} ${num(current.value!)} ${unit} (${period(first.period)} → ${period(current.period)}): ${signed(current.value! - first.value!)} ${unit}${percent}.`;
}

function assemble(evidenceId: string, evidence: Readonly<StatisticalEvidence>, tone: ResponseTone,
  detail: string, provider: Explanation["provider"], model: string, title?: string): Explanation {
  const en = evidence.lang === "en";
  const headline = en ? factualHeadlineEn(evidence) : factualHeadline(evidence);
  const caveat = en ? criticalCaveatEn(evidence) : criticalCaveat(evidence);
  // Em todos os estilos os números vêm primeiro ("de X para Y"); o texto do Gemma, curto, só diz o que significam.
  const numbers = directNumbersLine(evidence);
  if (numbers) detail = `${numbers} ${detail}`.trim();
  const fact = numbers || en ? "" : verifiedFactLine(evidence);
  const summary = `${fact} ${detail}`.trim();
  const body = `${summary}${caveat ? ` ${en ? "Limitation" : "Limitação"}: ${caveat}` : ""}`;
  return { tone, headline, summary, caveat, detail, title: title || headline, body, evidenceId, provider, model };
}

// Um exemplo de frase por tema, na direção que os dados mostram: um exemplo único ("arrendar ficou mais caro")
// fazia o modelo falar de casas a propósito de lixo ou de crime.
const HOUSING = new Set(["0014711", "0012255", "0012256", "0014137", "0013249"]);
const TOPIC_EXAMPLES: Record<string, { up: [string, string]; down: [string, string] }> = {
  "0014711": { up: ["Arrendar casa nova ficou bem mais caro.", "Renting a new home got a lot more expensive."], down: ["Arrendar casa nova ficou mais barato.", "Renting a new home got cheaper."] },
  "0012255": { up: ["Comprar casa ficou bem mais caro.", "Buying a home got a lot more expensive."], down: ["Comprar casa ficou mais barato.", "Buying a home got cheaper."] },
  "0012256": { up: ["Os bancos dão mais valor às casas do que antes.", "Banks value homes higher than before."], down: ["Os bancos dão menos valor às casas do que antes.", "Banks value homes lower than before."] },
  "0014137": { up: ["Há muitas casas, contando as de férias e as vazias.", "There are lots of homes, counting holiday and empty ones."], down: ["Há muitas casas, contando as de férias e as vazias.", "There are lots of homes, counting holiday and empty ones."] },
  "0013249": { up: ["Está a construir-se mais casa nova do que antes.", "More new homes are being finished than before."], down: ["Está a construir-se menos casa nova do que antes.", "Fewer new homes are being finished than before."] },
  "0012918": { up: ["Há mais gente a viver aqui.", "More people live here now."], down: ["Há menos gente a viver aqui.", "Fewer people live here now."] },
  "0012136": { up: ["Há mais gente sem trabalho do que há um ano.", "More people are out of work than a year ago."], down: ["Há menos gente sem trabalho do que há um ano.", "Fewer people are out of work than a year ago."] },
  "0012653": { up: ["Quem trabalha aqui ganha mais ao fim do mês.", "People working here take home more each month."], down: ["Quem trabalha aqui ganha menos ao fim do mês.", "People working here take home less each month."] },
  "0013312": { up: ["Vêm mais turistas por cada pessoa que cá vive.", "There are more visitors for each person who lives here."], down: ["Vêm menos turistas por cada pessoa que cá vive.", "There are fewer visitors for each person who lives here."] },
  "0012765": { up: ["Recolhe-se mais lixo por pessoa do que antes.", "More rubbish is collected per person than before."], down: ["Recolhe-se menos lixo por pessoa do que antes.", "Less rubbish is collected per person than before."] },
  "0012909": { up: ["A terra está a ficar mais velha.", "The town is getting older."], down: ["A terra está a ficar mais nova.", "The town is getting younger."] },
  "0013044": { up: ["Nascem mais bebés do que antes.", "More babies are born than before."], down: ["Nascem menos bebés do que antes.", "Fewer babies are born than before."] },
  "0012260": { up: ["A polícia regista mais crimes do que antes.", "Police record more crimes than before."], down: ["A polícia regista menos crimes do que antes.", "Police record fewer crimes than before."] },
  "0014580": { up: ["Aqui o dinheiro rende acima da média do país.", "Money goes further here than the national average."], down: ["Aqui o dinheiro rende abaixo da média do país.", "Money goes less far here than the national average."] },
};
function topicExample(evidence: Readonly<StatisticalEvidence>): string | null {
  const examples = TOPIC_EXAMPLES[evidence.indicator.id];
  if (!examples) return null;
  const rows = evidence.observations.filter((row) => row.value !== null);
  const homologue = evidence.calculations.find((item) => item.label === "Variação homóloga em pontos percentuais");
  const change = evidence.indicator.id === "0014580" ? (rows.at(-1)?.value ?? 100) - 100
    : homologue ? homologue.value : rows.length >= 2 ? rows.at(-1)!.value! - rows[0].value! : 0;
  if (change === 0 && evidence.indicator.id !== "0014137") return null;
  return examples[change >= 0 ? "up" : "down"][evidence.lang === "en" ? 1 : 0];
}
/** Fora dos temas de habitação, o texto não pode falar de casas nem de rendas. */
export function talksAboutHousingOffTopic(detail: string, evidence: Readonly<StatisticalEvidence>): boolean {
  if (HOUSING.has(evidence.indicator.id)) return false;
  return /\b(?:casa|casas|renda|rendas|arrend\p{L}*|alug\p{L}*|habitaç\p{L}*|habitac\p{L}*|home|homes|house|houses|housing|rent|renting)\b/iu.test(detail);
}

export async function generateExplanation(evidenceId: string, evidence: Readonly<StatisticalEvidence>, tone: ResponseTone): Promise<Explanation> {
  const en = evidence.lang === "en";
  const headline = en ? factualHeadlineEn(evidence) : factualHeadline(evidence);
  const caveat = en ? criticalCaveatEn(evidence) : criticalCaveat(evidence);
  const schema = z.toJSONSchema(OutputSchema);
  const scopeHint = evidence.indicator.id === "0014711"
    ? "A medida é a mediana por metro quadrado de novos contratos de arrendamento; contratos já em vigor ficam fora desta série."
    : evidence.indicator.id === "0012136"
      ? "A medida é uma taxa trimestral de desemprego, não uma contagem de pessoas; a leitura temporal compara o mesmo trimestre."
      : evidence.indicator.id === "0012918"
        ? "O indicador conta a população residente total, somando ambos os sexos e todos os grupos etários."
        : `O indicador mede ${evidence.indicator.dimensionDescription}.`;
  const basePrompt = `${TONE_INSTRUCTIONS[tone]}
Produz JSON com {"headline":string,"summary":string,"caveat":string} ${en ? "ESCRITO EM INGLÊS BRITÂNICO (British English): headline, summary e caveat em inglês, mantendo a voz pedida" : "em português de Portugal (nunca do Brasil)"}.
- headline: copia exatamente esta conclusão, já verificada: ${JSON.stringify(headline)}
- summary: ${tone === "direct" ? "uma frase só" : "no máximo duas frases curtas"}, escritas com a voz pedida acima, direto ao assunto, ${tone !== "teacher" && tone !== "researcher" ? `que diga só o que esta mudança quer dizer na vida de quem lê, sem definir o indicador ${topicExample(evidence) ? `(exemplo do conteúdo, no estilo pedido: ${JSON.stringify(topicExample(evidence))})` : ""}.` : `que expliquem ao leitor o que esta conclusão quer dizer. Podes usar: a direção da conclusão, esta definição da medida (${JSON.stringify(scopeHint)}) e o que os dados permitem ou não permitem concluir.`} O texto tem de soar claramente diferente de outros tons. Os números aparecem logo antes do teu texto, escritos pelo servidor: em summary não escrevas algarismos nem números por extenso, e não repitas a headline.
- caveat: ${caveat ? `copia esta limitação: ${JSON.stringify(caveat)}` : "deixa vazio"}
Regras: o tema desta pergunta é ${evidence.indicator.shortName}; fala só deste tema${HOUSING.has(evidence.indicator.id) ? "" : " e nunca fales de casas, rendas ou arrendar"}. Nunca chames média a uma mediana. Não inventes valores, fontes, períodos, territórios, causas nem consequências. Não uses estas palavras: reflete, causou, provocou, devido, impulsionado, explica, efeito, impacto, dinâmica, significativo, pressão, recorde, disparou, dobrou, duplicou, metade, sempre, todos, todas. Não comeces com "Com base nos dados" nem "De acordo com a análise".
Evidência verificada (só para contexto): ${JSON.stringify(evidence)}
Lembra-te: ${TONE_INSTRUCTIONS[tone]}${en ? " Responde em inglês britânico." : ""}`;
  let forceOllama = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply;
    try { reply = await chatWithMetadata(`${basePrompt}${attempt ? "\nA resposta anterior falhou a validação factual. Devolve apenas JSON válido e explicação sem números." : ""}`, schema, { forceOllama, temperature: 0.7 }); }
    catch { break; }
    try {
      const generated = OutputSchema.parse(JSON.parse(reply.content));
      const detail = (generated.summary ?? generated.body ?? "").trim();
      if (detail.length < 20 || /\d/.test(withoutRateBase(detail).replaceAll(evidence.indicator.unit, "")) || !hasOnlySupportedNumbers(detail, evidence))
        throw new Error("A explicação livre contém uma afirmação não verificável.");
      if (contradictsConclusion(detail, headline) || addsUnsupportedInterpretation(detail, evidence) || talksAboutHousingOffTopic(detail, evidence) || (detail.match(/[.!?](?=\s|$)/g)?.length ?? 0) > 3)
        throw new Error("A explicação diverge da conclusão ou é demasiado longa.");
      if (/^(?:com base nos dados|de acordo com a an[aá]lise)/i.test(detail)) throw new Error("Introdução genérica.");
      // Português de Portugal: palavras do Brasil que o modelo deixa escapar no tom descontraído.
      if (/(?<!\p{L})(?:grana|voc[eê]|galera)(?!\p{L})/iu.test(detail)) throw new Error("Brasileirismo.");
      return assemble(evidenceId, evidence, tone, detail, reply.provider, reply.model, generated.title);
    } catch { forceOllama = reply.provider === "gemini"; }
  }
  return assemble(evidenceId, evidence, tone, en ? "This reading only summarises the official values available." : safeDetail(tone), "template", "Modelo indisponível");
}

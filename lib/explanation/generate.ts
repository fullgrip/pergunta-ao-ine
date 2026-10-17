import { z } from "zod";
import { chatWithMetadata } from "@/lib/ollama";
import type { Explanation, ResponseTone, StatisticalEvidence } from "./evidence";

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
  direct: "Tom DIRETO: frases curtas e secas, sem adjetivos nem rodeios. Diz o que a medida mostra e o que o leitor pode tirar disso, mais nada.",
  journalist: "Tom JORNALISTA: escreve como o primeiro parágrafo de uma notícia de jornal português. Abre com uma frase que prenda a atenção do leitor comum (quem procura casa, quem vive na cidade), depois dá o contexto da medida. Informativo, nunca sensacionalista.",
  teacher: "Tom PROFESSOR: fala com um aluno curioso, por tu. Ensina o conceito com um exemplo do dia a dia (por exemplo, pôr os contratos em fila do mais barato ao mais caro e ver o do meio). Distingue o que os dados mostram do que não mostram.",
  researcher: "Tom INVESTIGADOR: registo técnico e preciso. Define a medida, a unidade e a cobertura da série, e aponta os limites de comparabilidade. Sem opiniões.",
  executive: "Tom EXECUTIVO: escreve para quem tem de decidir (orçamento, onde viver, onde investir). Uma frase sobre o que isto quer dizer na prática e uma ressalva. Qualquer hipótese é apresentada como hipótese.",
  sarcastic: "Tom SARCÁSTICO: ironia seca e bem-humorada, à portuguesa, sobre a situação (procurar casa, ler estatísticas), nunca sobre pessoas ou grupos. A piada não pode mudar o que os dados dizem.",
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
    : "A quantidade de resíduos urbanos recolhidos por habitante";
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
export function hasOnlySupportedNumbers(text: string, evidence: Readonly<StatisticalEvidence>): boolean {
  const allowed = allowedNumbers(evidence);
  const withoutUnit = text.replaceAll(evidence.indicator.unit, "");
  const numbers = Array.from(withoutUnit.matchAll(/(?<![\p{L}\d])-?\d+(?:[.,]\d+)?/gu), (match) => Number(match[0].replace(",", ".")));
  if (numbers.some((value) => !allowed.some((candidate) => Math.abs(value - candidate) < 1e-9))) return false;
  if (/\b(?:dobr(?:ou|aram|ou-se)|duplic(?:ou|aram)|triplic(?:ou|aram)|metade|recorde|sempre|todos|todas|maior do pa[ií]s|menor do pa[ií]s)\b/i.test(text)) return false;
  if (/\b(?:zero|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|milh[aã]o|milh[oõ]es)\b/i.test(text)) return false;
  if (evidence.indicator.id === "0012136" && /\b(?:tend[eê]ncia de (?:descida|queda|diminui[cç][aã]o)|descida sustentada|queda sustentada|continua a (?:cair|descer|diminuir))\b/i.test(text)) return false;
  return true;
}

function safeDetail(tone: ResponseTone): string {
  const lead: Record<ResponseTone, string> = {
    direct: "Esta leitura resume apenas as observações oficiais disponíveis.",
    journalist: "A leitura reúne os valores publicados e preserva o contexto do indicador.",
    teacher: "A comparação usa a mesma medida nos períodos disponíveis.",
    researcher: "A interpretação limita-se à série, à unidade e aos períodos observados.",
    executive: "Esta informação ajuda a enquadrar a decisão, sem provar as suas causas.",
    sarcastic: "Os números falam com convicção; as causas, essas, ainda não deram entrevista.",
  };
  return lead[tone];
}

function assemble(evidenceId: string, evidence: Readonly<StatisticalEvidence>, tone: ResponseTone,
  detail: string, provider: Explanation["provider"], model: string, title?: string): Explanation {
  const headline = factualHeadline(evidence);
  const fact = verifiedFactLine(evidence);
  const caveat = criticalCaveat(evidence);
  const summary = `${fact} ${detail}`.trim();
  const body = `${summary}${caveat ? ` Limitação: ${caveat}` : ""}`;
  return { tone, headline, summary, caveat, detail, title: title || headline, body, evidenceId, provider, model };
}

export async function generateExplanation(evidenceId: string, evidence: Readonly<StatisticalEvidence>, tone: ResponseTone): Promise<Explanation> {
  const headline = factualHeadline(evidence);
  const caveat = criticalCaveat(evidence);
  const schema = z.toJSONSchema(OutputSchema);
  const scopeHint = evidence.indicator.id === "0014711"
    ? "A medida é a mediana por metro quadrado de novos contratos de arrendamento; contratos já em vigor ficam fora desta série."
    : evidence.indicator.id === "0012136"
      ? "A medida é uma taxa trimestral de desemprego, não uma contagem de pessoas; a leitura temporal compara o mesmo trimestre."
      : evidence.indicator.id === "0012918"
        ? "O indicador conta a população residente total, somando ambos os sexos e todos os grupos etários."
        : `O indicador mede ${evidence.indicator.dimensionDescription}.`;
  const basePrompt = `${TONE_INSTRUCTIONS[tone]}
Produz JSON com {"headline":string,"summary":string,"caveat":string} em português de Portugal (nunca do Brasil).
- headline: copia exatamente esta conclusão, já verificada: ${JSON.stringify(headline)}
- summary: duas ou três frases, escritas com a voz pedida acima, que expliquem ao leitor o que esta conclusão quer dizer. Podes usar: a direção da conclusão, esta definição da medida (${JSON.stringify(scopeHint)}) e o que os dados permitem ou não permitem concluir. O texto tem de soar claramente diferente de outros tons. A frase com os números já é escrita pelo servidor: em summary não escrevas algarismos nem números por extenso, e não repitas a headline.
- caveat: ${caveat ? `copia esta limitação: ${JSON.stringify(caveat)}` : "deixa vazio"}
Regras: a medida é ${evidence.indicator.shortName}; nunca a chames média. Não inventes valores, fontes, períodos, territórios, causas nem consequências. Não uses estas palavras: reflete, causou, provocou, devido, impulsionado, explica, efeito, impacto, dinâmica, significativo, pressão, recorde, disparou, dobrou, duplicou, metade, sempre, todos, todas. Não comeces com "Com base nos dados" nem "De acordo com a análise".
Evidência verificada (só para contexto): ${JSON.stringify(evidence)}
Lembra-te: ${TONE_INSTRUCTIONS[tone]}`;
  let forceOllama = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply;
    try { reply = await chatWithMetadata(`${basePrompt}${attempt ? "\nA resposta anterior falhou a validação factual. Devolve apenas JSON válido e explicação sem números." : ""}`, schema, { forceOllama, temperature: 0.7 }); }
    catch { break; }
    try {
      const generated = OutputSchema.parse(JSON.parse(reply.content));
      const detail = (generated.summary ?? generated.body ?? "").trim();
      if (detail.length < 20 || /\d/.test(detail.replaceAll(evidence.indicator.unit, "")) || !hasOnlySupportedNumbers(detail, evidence))
        throw new Error("A explicação livre contém uma afirmação não verificável.");
      if (contradictsConclusion(detail, headline) || addsUnsupportedInterpretation(detail, evidence) || (detail.match(/[.!?](?=\s|$)/g)?.length ?? 0) > 3)
        throw new Error("A explicação diverge da conclusão ou é demasiado longa.");
      if (/^(?:com base nos dados|de acordo com a an[aá]lise)/i.test(detail)) throw new Error("Introdução genérica.");
      return assemble(evidenceId, evidence, tone, detail, reply.provider, reply.model, generated.title);
    } catch { forceOllama = reply.provider === "gemini"; }
  }
  return assemble(evidenceId, evidence, tone, safeDetail(tone), "template", "Modelo indisponível");
}

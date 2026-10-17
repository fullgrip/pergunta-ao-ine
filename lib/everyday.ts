// Traduz os valores oficiais em coisas do dia a dia ("uma casa de 80 m²", "em cada 100 pessoas").
// Todas as contas são feitas aqui, a partir das observações do INE; o modelo não entra.

import { INDICATOR_EN } from "@/lib/i18n";

export type EverydayIcon = "home" | "euro" | "users" | "sun" | "briefcase" | "trash" | "trend";
export type EverydayLine = { icon: EverydayIcon; text: string; note?: string };
export type EverydayBeforeAfter = { territory: string; unit: string; first: { period: string; value: number }; last: { period: string; value: number } };
export type EverydayPictogram = { kind: "people100" | "guests"; filled: number; total: number; label: string };
export type Everyday = { lines: EverydayLine[]; beforeAfter?: EverydayBeforeAfter; pictogram?: EverydayPictogram };

type Point = { period: string; value: number | null };
export type EverydayInput = {
  indicator: { id: string; unit: string };
  summaries: Array<{ territory: string; first?: Point; last?: Point } | null>;
  homologousComparison?: { previous: { period: string; value: number }; current: { period: string; value: number } } | null;
};

/** Typical flat used to turn €/m² into a monthly rent people recognise. */
export const EXAMPLE_FLAT_M2 = 80;
const RENT = "0014711", POPULATION = "0012918", UNEMPLOYMENT = "0012136", WAGE = "0012653", GUESTS = "0013312", WASTE = "0012765";
const HOUSES = "0014137", SALE_PRICE = "0012255", BANK_VALUE = "0012256", AGEING = "0012909", BIRTHS = "0013044", CRIME = "0012260", PURCHASING = "0014580", NEW_HOMES = "0013249";

// pt-PT não agrupa números de 4 algarismos por omissão ("1484"); aqui queremos "1 484".
const whole = (n: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n));
const oneDecimal = (n: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1, minimumFractionDigits: 1, useGrouping: "always" }).format(n);

// "em Faro", mas "no Algarve", "no Porto", "na Guarda": nomes que levam artigo.
const MASCULINE = new Set(["Algarve", "Alentejo", "Porto", "Funchal", "Barreiro", "Seixal", "Cartaxo", "Sabugal", "Crato", "Bombarral", "Redondo", "Cadaval", "Corvo", "Nordeste", "Montijo", "Sardoal", "Gavião", "Entroncamento", "Fundão", "Cacém"]);
const FEMININE = new Set(["Guarda", "Nazaré", "Amadora", "Maia", "Trofa", "Moita", "Batalha", "Horta", "Covilhã", "Lourinhã", "Golegã", "Mealhada", "Figueira da Foz", "Lousã", "Murtosa", "Chamusca", "Azambuja", "Ribeira Grande", "Calheta", "Madalena", "Praia da Vitória", "Póvoa de Varzim", "Póvoa de Lanhoso", "Vidigueira", "Sertã", "Mêda", "Ponta do Sol", "Ribeira Brava", "Lagoa"]);
export function inPlace(territory: string) {
  const name = territory.replace(/\s*\(R\.A\.[AM]\.\)\s*$/, "");
  return MASCULINE.has(name) ? `no ${territory}` : FEMININE.has(name) ? `na ${territory}` : `em ${territory}`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function linesFor(id: string, territory: string, first: { period: string; value: number } | null, last: { period: string; value: number }): EverydayLine[] {
  const changed = first && first.period !== last.period ? first : null;
  if (id === RENT) {
    const monthly = last.value * EXAMPLE_FLAT_M2;
    const lines: EverydayLine[] = [{ icon: "home", text: `Numa casa de ${EXAMPLE_FLAT_M2} m² (um T2 típico) ${inPlace(territory)}, a renda de referência dá cerca de ${whole(monthly)} € por mês (${last.period}).`, note: "Exemplo ilustrativo: mediana dos contratos novos × 80 m². Não é o preço de uma casa concreta." }];
    if (changed) {
      const diff = (last.value - changed.value) * EXAMPLE_FLAT_M2;
      if (Math.round(diff) !== 0) lines.push({ icon: "trend", text: `A mesma casa custa ${diff > 0 ? "mais" : "menos"} ${whole(Math.abs(diff))} € por mês do que em ${changed.period}.` });
    }
    return lines;
  }
  if (id === WAGE) {
    const lines: EverydayLine[] = [{ icon: "euro", text: `Em média, quem trabalha a tempo inteiro por conta de outrem ${inPlace(territory)} ganha cerca de ${whole(last.value)} € por mês (${last.period}).` }];
    if (changed) {
      const diff = last.value - changed.value;
      if (Math.round(diff) !== 0) lines.push({ icon: "trend", text: `São ${diff > 0 ? "mais" : "menos"} ${whole(Math.abs(diff))} € por mês do que em ${changed.period}.` });
    }
    return lines;
  }
  if (id === POPULATION) {
    const lines: EverydayLine[] = [{ icon: "users", text: `Vivem ${inPlace(territory)} cerca de ${whole(last.value)} pessoas (${last.period}).` }];
    if (changed && changed.value > 0) lines.push({ icon: "trend", text: `Por cada 100 pessoas que lá viviam em ${changed.period}, em ${last.period} vivem ${whole((last.value / changed.value) * 100)}.` });
    return lines;
  }
  if (id === UNEMPLOYMENT) {
    return [{ icon: "briefcase", text: `Em cada 100 pessoas que trabalham ou procuram trabalho ${inPlace(territory)}, cerca de ${oneDecimal(last.value)} estão desempregadas (${last.period}).` }];
  }
  if (id === GUESTS) {
    return [{ icon: "sun", text: `Em ${last.period}, por cada pessoa que vive ${inPlace(territory)}, houve ${oneDecimal(last.value)} hóspedes em alojamentos turísticos.`, note: "Conta estadias, não pessoas diferentes: o mesmo turista que volta conta duas vezes." }];
  }
  if (id === WASTE) {
    return [{ icon: "trash", text: `${capital(inPlace(territory))} recolhem-se cerca de ${oneDecimal(last.value / 365)} kg de lixo por habitante, por dia (${whole(last.value)} kg por ano, ${last.period}).`, note: "Inclui o lixo dos turistas, que não contam como habitantes." }];
  }
  const diffLine = (format: (n: number) => string, suffix: string, factor = 1): EverydayLine[] => {
    if (!changed) return [];
    const diff = (last.value - changed.value) * factor;
    return Math.round(diff * 10) === 0 ? [] : [{ icon: "trend", text: `${diff > 0 ? "Mais" : "Menos"} ${format(Math.abs(diff))}${suffix} do que em ${changed.period}.` }];
  };
  if (id === HOUSES) {
    return [{ icon: "home", text: `Há cerca de ${whole(last.value)} casas ${inPlace(territory)} (${last.period}).`, note: "Conta todas as casas de família, incluindo casas de férias e casas vazias, não só as que têm gente a viver." }];
  }
  if (id === SALE_PRICE || id === BANK_VALUE) {
    const verb = id === SALE_PRICE ? "foi vendida, a meio da tabela, por cerca de" : "valia para o banco cerca de";
    return [
      { icon: "home", text: `Uma casa de ${EXAMPLE_FLAT_M2} m² ${inPlace(territory)} ${verb} ${whole(last.value * EXAMPLE_FLAT_M2)} € (${last.period}).`, note: `Exemplo ilustrativo: mediana por m² × ${EXAMPLE_FLAT_M2} m². Não é o preço de uma casa concreta.` },
      ...diffLine(whole, " € pela mesma casa", EXAMPLE_FLAT_M2),
    ];
  }
  if (id === AGEING) {
    return [{ icon: "users", text: `${capital(inPlace(territory))}, por cada 100 crianças e jovens com menos de 15 anos há ${whole(last.value)} pessoas com 65 ou mais anos (${last.period}).` }, ...diffLine(whole, " idosos por cada 100 jovens")];
  }
  if (id === BIRTHS) {
    return [{ icon: "users", text: `${capital(inPlace(territory))} nascem cerca de ${oneDecimal(last.value)} bebés por cada 1 000 habitantes, num ano (${last.period}).` }];
  }
  if (id === CRIME) {
    return [{ icon: "briefcase", text: `${capital(inPlace(territory))} a polícia registou cerca de ${oneDecimal(last.value)} crimes por cada 1 000 habitantes (${last.period}).`, note: "São crimes registados pelas autoridades, não todos os que acontecem. Os turistas não contam como habitantes." }, ...diffLine(oneDecimal, " crimes por cada 1 000 habitantes")];
  }
  if (id === PURCHASING) {
    const above = last.value >= 100;
    return [{ icon: "euro", text: `Se a média do país for 100, o poder de compra por pessoa ${inPlace(territory)} é ${oneDecimal(last.value)}: ${above ? "acima" : "abaixo"} da média nacional (${last.period}).` }];
  }
  if (id === NEW_HOMES) {
    return [{ icon: "home", text: `${capital(inPlace(territory))} concluíram-se ${whole(last.value)} casas novas (${last.period}).` }, ...diffLine(whole, " casas novas")];
  }
  return [];
}

// English version: same arithmetic, same notes, written for the English page.
const wholeEn = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(n));
const oneDecimalEn = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n);
const inPlaceEn = (territory: string) => territory === "Algarve" ? "the Algarve" : territory;
const periodEn = (period: string) => { const q = period.match(/([1-4])\.?º?\s*trimestre\s+de\s+(\d{4})/i); return q ? `Q${q[1]} ${q[2]}` : period; };
function linesForEn(id: string, territory: string, first: { period: string; value: number } | null, last: { period: string; value: number }): EverydayLine[] {
  const changed = first && first.period !== last.period ? first : null;
  const place = inPlaceEn(territory), year = periodEn(last.period);
  const diffLine = (format: (n: number) => string, suffix: string, factor = 1): EverydayLine[] => {
    if (!changed) return [];
    const diff = (last.value - changed.value) * factor;
    return Math.round(diff * 10) === 0 ? [] : [{ icon: "trend", text: `${diff > 0 ? "Up" : "Down"} ${format(Math.abs(diff))}${suffix} since ${periodEn(changed.period)}.` }];
  };
  if (id === RENT) return [{ icon: "home", text: `An ${EXAMPLE_FLAT_M2} m² flat (a typical two-bedroom) in ${place} would rent for about €${wholeEn(last.value * EXAMPLE_FLAT_M2)} a month (${year}).`, note: `Illustration only: median of new leases × ${EXAMPLE_FLAT_M2} m². Not the price of any specific home.` }, ...diffLine((n) => `€${wholeEn(n)}`, " a month for the same flat", EXAMPLE_FLAT_M2)];
  if (id === WAGE) return [{ icon: "euro", text: `On average, full-time employees in ${place} earn about €${wholeEn(last.value)} a month (${year}).` }, ...diffLine((n) => `€${wholeEn(n)}`, " a month")];
  if (id === POPULATION) return [{ icon: "users", text: `About ${wholeEn(last.value)} people live in ${place} (${year}).` }, ...(changed && changed.value > 0 ? [{ icon: "trend" as const, text: `For every 100 people who lived there in ${periodEn(changed.period)}, there are ${wholeEn((last.value / changed.value) * 100)} in ${year}.` }] : [])];
  if (id === UNEMPLOYMENT) return [{ icon: "briefcase", text: `Out of every 100 people working or looking for work in ${place}, about ${oneDecimalEn(last.value)} are unemployed (${year}).` }];
  if (id === GUESTS) return [{ icon: "sun", text: `In ${year}, for every person living in ${place}, there were ${oneDecimalEn(last.value)} guests in tourist accommodation.`, note: "It counts stays, not different people: a tourist who comes back counts twice." }];
  if (id === WASTE) return [{ icon: "trash", text: `${place} collects about ${oneDecimalEn(last.value / 365)} kg of waste per resident per day (${wholeEn(last.value)} kg a year, ${year}).`, note: "Includes tourists' waste, and tourists don't count as residents." }];
  if (id === HOUSES) return [{ icon: "home", text: `There are about ${wholeEn(last.value)} homes in ${place} (${year}).`, note: "Counts every family home, including holiday homes and empty homes, not only the ones people live in." }];
  if (id === SALE_PRICE || id === BANK_VALUE) return [{ icon: "home", text: `An ${EXAMPLE_FLAT_M2} m² home in ${place} ${id === SALE_PRICE ? "sold, mid-market, for about" : "was valued by banks at about"} €${wholeEn(last.value * EXAMPLE_FLAT_M2)} (${year}).`, note: `Illustration only: median per m² × ${EXAMPLE_FLAT_M2} m². Not the price of any specific home.` }, ...diffLine((n) => `€${wholeEn(n)}`, " for the same home", EXAMPLE_FLAT_M2)];
  if (id === AGEING) return [{ icon: "users", text: `In ${place}, for every 100 children and teenagers under 15 there are ${wholeEn(last.value)} people aged 65 or over (${year}).` }, ...diffLine(wholeEn, " older people per 100 young")];
  if (id === BIRTHS) return [{ icon: "users", text: `In ${place}, about ${oneDecimalEn(last.value)} babies are born per 1,000 residents a year (${year}).` }];
  if (id === CRIME) return [{ icon: "briefcase", text: `In ${place}, police recorded about ${oneDecimalEn(last.value)} crimes per 1,000 residents (${year}).`, note: "These are crimes recorded by the police, not every crime that happens. Tourists don't count as residents." }, ...diffLine(oneDecimalEn, " crimes per 1,000 residents")];
  if (id === PURCHASING) return [{ icon: "euro", text: `If the national average is 100, purchasing power per person in ${place} is ${oneDecimalEn(last.value)}: ${last.value >= 100 ? "above" : "below"} the national average (${year}).` }];
  if (id === NEW_HOMES) return [{ icon: "home", text: `${wholeEn(last.value)} new homes were completed in ${place} (${year}).` }, ...diffLine(wholeEn, " new homes")];
  return [];
}

export function everydayView(answer: EverydayInput, lang: "pt" | "en" = "pt"): Everyday {
  const en = lang === "en";
  const rows = answer.summaries
    .filter((item): item is NonNullable<typeof item> => item != null && item.last?.value != null)
    .map((item) => ({
      territory: item.territory,
      last: { period: item.last!.period, value: item.last!.value! },
      first: item.first?.value != null ? { period: item.first.period, value: item.first.value } : null,
    }));
  if (!rows.length) return { lines: [] };
  const id = answer.indicator.id;
  const lines = rows.flatMap((row) => (en ? linesForEn : linesFor)(id, row.territory, rows.length === 1 ? row.first : null, row.last));

  if (rows.length >= 2 && rows.every((row) => row.last.period === rows[0].last.period) && (id === RENT || id === WAGE)) {
    const sorted = [...rows].sort((a, b) => b.last.value - a.last.value);
    const high = sorted[0], low = sorted.at(-1)!;
    const diff = (high.last.value - low.last.value) * (id === RENT ? EXAMPLE_FLAT_M2 : 1);
    if (Math.round(diff) > 0) lines.push({ icon: "trend", text: en
      ? (id === RENT ? `The same ${EXAMPLE_FLAT_M2} m² flat costs €${wholeEn(diff)} more a month in ${inPlaceEn(high.territory)} than in ${inPlaceEn(low.territory)}.` : `People earn €${wholeEn(diff)} more a month in ${inPlaceEn(high.territory)} than in ${inPlaceEn(low.territory)}.`)
      : id === RENT
      ? `A mesma casa de ${EXAMPLE_FLAT_M2} m² custa mais ${whole(diff)} € por mês ${inPlace(high.territory)} do que ${inPlace(low.territory)}.`
      : `${capital(inPlace(high.territory))} ganha-se mais ${whole(diff)} € por mês do que ${inPlace(low.territory)}.` });
  }

  if (id === UNEMPLOYMENT && answer.homologousComparison && rows.length === 1) {
    const previous = answer.homologousComparison.previous;
    lines.push({ icon: "trend", text: en ? `In the same quarter a year earlier (${periodEn(previous.period)}), it was about ${oneDecimalEn(previous.value)} in every 100.` : `No mesmo trimestre do ano anterior (${previous.period}), eram cerca de ${oneDecimal(previous.value)} em cada 100.` });
  }

  const single = rows.length === 1 ? rows[0] : null;
  const beforeAfter = single && single.first && single.first.period !== single.last.period && id !== UNEMPLOYMENT
    ? { territory: single.territory, unit: en ? INDICATOR_EN[id]?.unit ?? answer.indicator.unit : answer.indicator.unit, first: en ? { ...single.first, period: periodEn(single.first.period) } : single.first, last: en ? { ...single.last, period: periodEn(single.last.period) } : single.last } : undefined;
  const pictogram: EverydayPictogram | undefined = single && id === UNEMPLOYMENT
    ? { kind: "people100", filled: Math.max(0, Math.min(100, Math.round(single.last.value))), total: 100, label: en ? `${oneDecimalEn(single.last.value)} in every 100 people in the labour force are unemployed` : `${oneDecimal(single.last.value)} em cada 100 pessoas ativas estão desempregadas` }
    : single && id === GUESTS && single.last.value <= 60
      ? { kind: "guests", filled: Math.max(0, Math.round(single.last.value)), total: Math.max(0, Math.round(single.last.value)), label: en ? `${oneDecimalEn(single.last.value)} guests for every resident` : `${oneDecimal(single.last.value)} hóspedes por cada habitante` }
      : undefined;
  return { lines, beforeAfter, pictogram };
}

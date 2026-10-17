// Traduz os valores oficiais em coisas do dia a dia ("uma casa de 80 m²", "em cada 100 pessoas").
// Todas as contas são feitas aqui, a partir das observações do INE; o modelo não entra.

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
  return [];
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function everydayView(answer: EverydayInput): Everyday {
  const rows = answer.summaries
    .filter((item): item is NonNullable<typeof item> => item != null && item.last?.value != null)
    .map((item) => ({
      territory: item.territory,
      last: { period: item.last!.period, value: item.last!.value! },
      first: item.first?.value != null ? { period: item.first.period, value: item.first.value } : null,
    }));
  if (!rows.length) return { lines: [] };
  const id = answer.indicator.id;
  const lines = rows.flatMap((row) => linesFor(id, row.territory, rows.length === 1 ? row.first : null, row.last));

  if (rows.length >= 2 && rows.every((row) => row.last.period === rows[0].last.period) && (id === RENT || id === WAGE)) {
    const sorted = [...rows].sort((a, b) => b.last.value - a.last.value);
    const high = sorted[0], low = sorted.at(-1)!;
    const diff = (high.last.value - low.last.value) * (id === RENT ? EXAMPLE_FLAT_M2 : 1);
    if (Math.round(diff) > 0) lines.push({ icon: "trend", text: id === RENT
      ? `A mesma casa de ${EXAMPLE_FLAT_M2} m² custa mais ${whole(diff)} € por mês ${inPlace(high.territory)} do que ${inPlace(low.territory)}.`
      : `${capital(inPlace(high.territory))} ganha-se mais ${whole(diff)} € por mês do que ${inPlace(low.territory)}.` });
  }

  if (id === UNEMPLOYMENT && answer.homologousComparison && rows.length === 1) {
    const previous = answer.homologousComparison.previous;
    lines.push({ icon: "trend", text: `No mesmo trimestre do ano anterior (${previous.period}), eram cerca de ${oneDecimal(previous.value)} em cada 100.` });
  }

  const single = rows.length === 1 ? rows[0] : null;
  const beforeAfter = single && single.first && single.first.period !== single.last.period && id !== UNEMPLOYMENT
    ? { territory: single.territory, unit: answer.indicator.unit, first: single.first, last: single.last } : undefined;
  const pictogram: EverydayPictogram | undefined = single && id === UNEMPLOYMENT
    ? { kind: "people100", filled: Math.max(0, Math.min(100, Math.round(single.last.value))), total: 100, label: `${oneDecimal(single.last.value)} em cada 100 pessoas ativas estão desempregadas` }
    : single && id === GUESTS && single.last.value <= 60
      ? { kind: "guests", filled: Math.max(0, Math.round(single.last.value)), total: Math.max(0, Math.round(single.last.value)), label: `${oneDecimal(single.last.value)} hóspedes por cada habitante` }
      : undefined;
  return { lines, beforeAfter, pictogram };
}

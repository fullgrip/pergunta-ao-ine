// "E a seguir?": perguntas sugeridas depois de cada resposta, feitas pelo código (sem modelo).
// Cada uma é escrita para ser reconhecida pelo próprio parser (testado em tests/followups.test.ts).

type Lang = "pt" | "en";
type Theme = { ask: [(place: string) => string, (place: string) => string]; compare: [string, string] | null };

const at = (place: string) => place === "Algarve" ? "no Algarve" : `em ${place}`;
const inEn = (place: string) => place === "Algarve" ? "the Algarve" : place;

const THEMES: Record<string, Theme> = {
  "0014711": { ask: [(p) => `Quanto custa arrendar ${at(p)}?`, (p) => `How much is rent in ${inEn(p)}?`], compare: ["Rendas", "Rent"] },
  "0012653": { ask: [(p) => `Quanto se ganha ${at(p)}?`, (p) => `How much do people earn in ${inEn(p)}?`], compare: ["Salário", "Salary"] },
  "0012918": { ask: [(p) => `Quantas pessoas vivem ${at(p)}?`, (p) => `How many people live in ${inEn(p)}?`], compare: ["População", "Population"] },
  "0012136": { ask: [() => "Como está o desemprego no Algarve?", () => "Is unemployment high in the Algarve?"], compare: null },
  "0013312": { ask: [(p) => `Há muitos turistas ${at(p)}?`, (p) => `Are there many tourists in ${inEn(p)}?`], compare: ["Turistas", "Tourists"] },
  "0012765": { ask: [(p) => `Quanto lixo se produz ${at(p)}?`, (p) => `How much waste is produced in ${inEn(p)}?`], compare: ["Lixo", "Waste"] },
  "0014137": { ask: [(p) => `Há muitas casas ${at(p)}?`, (p) => `Are there many houses in ${inEn(p)}?`], compare: null },
  "0012255": { ask: [(p) => `Quanto custa comprar casa ${at(p)}?`, (p) => `How much does it cost to buy a house in ${inEn(p)}?`], compare: ["Preço das casas", "House prices"] },
  "0012256": { ask: [(p) => `Qual a avaliação bancária ${at(p)}?`, (p) => `What is the bank valuation in ${inEn(p)}?`], compare: ["Avaliação bancária", "Bank valuation"] },
  "0012909": { ask: [(p) => `Há muitos idosos ${at(p)}?`, (p) => `Are there many elderly people in ${inEn(p)}?`], compare: ["Idosos", "Elderly people"] },
  "0013044": { ask: [(p) => `Nascem muitos bebés ${at(p)}?`, (p) => `How many babies are born in ${inEn(p)}?`], compare: ["Nascimentos", "Births"] },
  "0012260": { ask: [(p) => `É seguro viver ${at(p)}?`, (p) => `Is ${inEn(p)} safe?`], compare: ["Crime", "Crime"] },
  "0014580": { ask: [(p) => `Qual o poder de compra ${at(p)}?`, (p) => `What is the purchasing power in ${inEn(p)}?`], compare: ["Poder de compra", "Purchasing power"] },
  "0013249": { ask: [(p) => `Estão a construir casas ${at(p)}?`, (p) => `Are they building new homes in ${inEn(p)}?`], compare: ["Casas novas", "New homes"] },
};

// Temas que fazem sentido a seguir a cada um (o primeiro é o mais óbvio).
const RELATED: Record<string, string[]> = {
  "0014711": ["0012653", "0012255"], "0012653": ["0014711", "0014580"], "0012918": ["0012909", "0013044"],
  "0012136": ["0012653", "0012918"], "0013312": ["0012765", "0014711"], "0012765": ["0013312", "0012918"],
  "0014137": ["0013249", "0012255"], "0012255": ["0014711", "0012653"], "0012256": ["0012255", "0014711"],
  "0012909": ["0013044", "0012918"], "0013044": ["0012909", "0012918"], "0012260": ["0012918", "0012653"],
  "0014580": ["0012653", "0014711"], "0013249": ["0012255", "0014137"],
};

// Para comparar: uma cidade vizinha conhecida, senão as duas maiores do país.
const NEIGHBOUR: Record<string, string> = { "Portimão": "Faro", Faro: "Portimão", Lagos: "Portimão", Albufeira: "Faro", Tavira: "Faro", "Loulé": "Faro", "Olhão": "Faro", Silves: "Portimão", Lisboa: "Porto", Porto: "Lisboa" };

/** Up to three follow-up questions: two related topics for the same place, and one comparison. */
export function followUpQuestions(answer: { indicatorId: string; territories: string[] }, lang: Lang = "pt"): string[] {
  const i = lang === "en" ? 1 : 0;
  const place = answer.territories[0];
  if (!place) return [];
  const regional = answer.indicatorId === "0012136";
  // O desemprego só existe para o Algarve: os temas seguintes usam uma cidade do Algarve.
  const town = regional ? "Faro" : place;
  const related = (RELATED[answer.indicatorId] ?? []).map((id) => THEMES[id]?.ask[i](id === "0012136" ? "Algarve" : town)).filter(Boolean) as string[];
  const theme = THEMES[answer.indicatorId];
  const other = answer.territories[1] ? null : NEIGHBOUR[place] ?? (place === "Lisboa" ? "Porto" : "Lisboa");
  const comparison = theme?.compare && other && !regional
    ? (lang === "en" ? `${theme.compare[1]} in ${place} and ${other}` : `${theme.compare[0]} em ${place} e em ${other}`)
    : null;
  return [...related, ...(comparison ? [comparison] : [])].slice(0, 3);
}

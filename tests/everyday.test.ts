import { describe, expect, it } from "vitest";
import { everydayView, inPlace } from "../lib/everyday";

const one = (id: string, unit: string, first: [string, number], last: [string, number], territory = "Portimão") => ({
  indicator: { id, unit },
  summaries: [{ territory, first: { period: first[0], value: first[1] }, last: { period: last[0], value: last[1] } }],
});

describe("respostas em linguagem do dia a dia", () => {
  it("traduz a renda por m² numa casa de 80 m² e na diferença mensal", () => {
    const view = everydayView(one("0014711", "€/m²", ["2021", 7.09], ["2025", 11.36]));
    expect(view.lines[0].text).toContain("cerca de 909 € por mês");
    expect(view.lines[1].text).toBe("A mesma casa custa mais 342 € por mês do que em 2021.");
    expect(view.beforeAfter).toMatchObject({ first: { value: 7.09 }, last: { value: 11.36 } });
  });

  it("mostra o salário com separador de milhares e a diferença por mês", () => {
    const view = everydayView(one("0012653", "€", ["2021", 1257.8], ["2024", 1484.09], "Faro"));
    expect(view.lines[0].text).toMatch(/cerca de 1\s484 € por mês/);
    expect(view.lines[1].text).toBe("São mais 226 € por mês do que em 2021.");
  });

  it("explica a população por cada 100 pessoas", () => {
    const view = everydayView(one("0012918", "pessoas", ["2021", 75000], ["2025", 78125]));
    expect(view.lines[1].text).toContain("vivem 104");
  });

  it("desenha o desemprego como 100 pessoas e compara com o mesmo trimestre", () => {
    const view = everydayView({
      ...one("0012136", "%", ["2.º Trimestre de 2024", 5.1], ["2.º Trimestre de 2026", 4.2], "Algarve"),
      homologousComparison: { previous: { period: "2.º Trimestre de 2025", value: 4.5 }, current: { period: "2.º Trimestre de 2026", value: 4.2 } },
    });
    expect(view.pictogram).toMatchObject({ kind: "people100", filled: 4, total: 100 });
    expect(view.lines.at(-1)!.text).toContain("2.º Trimestre de 2025");
    expect(view.beforeAfter).toBeUndefined();
  });

  it("passa o lixo anual a quilos por dia", () => {
    const view = everydayView(one("0012765", "kg/hab.", ["2021", 700], ["2024", 730]));
    expect(view.lines[0].text).toContain("cerca de 2,0 kg de lixo por habitante, por dia (730 kg por ano");
  });

  it("compara duas cidades no mesmo ano sem inventar diferenças", () => {
    const view = everydayView({
      indicator: { id: "0014711", unit: "€/m²" },
      summaries: [
        { territory: "Portimão", last: { period: "2025", value: 11.36 } },
        { territory: "Faro", last: { period: "2025", value: 9.67 } },
      ],
    });
    expect(view.lines.at(-1)!.text).toBe("A mesma casa de 80 m² custa mais 135 € por mês em Portimão do que em Faro.");
    expect(view.beforeAfter).toBeUndefined();
  });

  it("usa o artigo certo antes do nome do lugar", () => {
    expect(inPlace("Algarve")).toBe("no Algarve");
    expect(inPlace("Guarda")).toBe("na Guarda");
    expect(inPlace("Faro")).toBe("em Faro");
    const view = everydayView({ ...one("0012136", "%", ["2.º Trimestre de 2024", 5.1], ["2.º Trimestre de 2026", 4.2], "Algarve"), homologousComparison: { previous: { period: "2.º Trimestre de 2025", value: 4.5 }, current: { period: "2.º Trimestre de 2026", value: 4.2 } } });
    expect(view.lines[0].text).toContain("no Algarve, cerca de 4,2 estão");
    expect(view.lines.at(-1)!.text).toContain("eram cerca de 4,5 em cada 100");
  });

  it("explica os temas novos sem jargão", () => {
    expect(everydayView(one("0014137", "casas", ["2022", 49450], ["2022", 49450])).lines[0].text).toMatch(/Há cerca de 49\s450 casas em Portimão/);
    expect(everydayView(one("0012255", "€/m²", ["2021", 1803], ["2025", 2953])).lines[0].text).toMatch(/236\s240 €/);
    expect(everydayView(one("0014580", "(Portugal = 100)", ["2023", 99.87], ["2023", 99.87])).lines[0].text).toContain("abaixo da média nacional");
    expect(everydayView(one("0012260", "‰", ["2021", 30.6], ["2025", 37.4], "Faro")).lines[0].text).toContain("Em Faro a polícia registou cerca de 37,4 crimes");
  });

  it("tem uma versão inglesa com as mesmas contas", () => {
    const view = everydayView(one("0014711", "€/m²", ["2021", 7.09], ["2025", 11.36]), "en");
    expect(view.lines[0].text).toBe("An 80 m² flat (a typical two-bedroom) in Portimão would rent for about €909 a month (2025).");
    expect(view.lines[1].text).toBe("Up €342 a month for the same flat since 2021.");
    expect(everydayView(one("0012136", "%", ["2.º Trimestre de 2024", 5.1], ["2.º Trimestre de 2026", 4.2], "Algarve"), "en").lines[0].text).toContain("in the Algarve, about 4.2 are unemployed (Q2 2026)");
  });

  it("não mostra nada sem valores", () => {
    expect(everydayView({ indicator: { id: "0014711", unit: "€/m²" }, summaries: [{ territory: "Mora", last: { period: "2025", value: null } }] }).lines).toEqual([]);
  });
});

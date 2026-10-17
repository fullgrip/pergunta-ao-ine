import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citySnapshot } from "../lib/city";
import { getIndicator } from "../lib/ine/catalog";
import { normalizeIneResponse } from "../lib/ine/normalize";

const raw = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/ine/${name}`, import.meta.url), "utf8"));
const cases = [
  { id: "0012653", file: "wage-2021-2024-portimao.json", period: "2024", expected: 1294.27, unit: "€", count: 2 },
  { id: "0013312", file: "guests-2022-2025-portimao.json", period: "2025", expected: 8.4, unit: "hóspedes/hab.", count: 4 },
  { id: "0012765", file: "waste-2021-2024-portimao.json", period: "2024", expected: 643, unit: "kg/hab.", count: 4 },
] as const;

describe("novos indicadores municipais", () => {
  it.each(cases)("confere $id no catálogo, resposta literal e snapshot", ({ id, file, period, expected, unit, count }) => {
    const indicator = getIndicator(id)!;
    const territory = indicator.supportedTerritories.find((item) => item.id === "1500811")!;
    expect(territory.name).toBe("Portimão");
    expect(indicator.unit).toBe(unit);
    const normalized = normalizeIneResponse(raw(file), indicator, territory, period, `S7A${period}`);
    expect(normalized.observations[0].value).toBe(expected);
    expect(normalized.warnings).toEqual([]);
    const series = citySnapshot("portimao")!.series.find((item) => item.indicatorId === id)!;
    expect(series.observations).toHaveLength(count);
    expect(series.observations.find((row) => row.period === period)?.value).toBe(expected);
    expect(series.observations.every((row) => row.sourceUrl.includes(`varcd=${id}`))).toBe(true);
  });
});

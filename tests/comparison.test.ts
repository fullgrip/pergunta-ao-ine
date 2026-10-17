import { describe, expect, it, vi } from "vitest";
import { buildComparison } from "../lib/analytics/comparison";
import { citySnapshot } from "../lib/city";
import { getIndicator } from "../lib/ine/catalog";
import { MUNICIPALITIES } from "../lib/ine/territories";
import { GET, POST } from "../app/api/compare/route";
import { POST as EXPLAIN } from "../app/api/compare/explain/route";
import { getMunicipalityById } from "../lib/municipalities";
import type { CitySeries } from "../lib/city";

const rent = getIndicator("rendas")!;
const population = getIndicator("populacao")!;
const cities = MUNICIPALITIES.slice(0, 2);
const snapshot = citySnapshot("portimao")!;

describe("comparação municipal", () => {
  it("alinha pela chave oficial de período e não inventa valores municipais", () => {
    const result = buildComparison(cities, rent, snapshot.series, snapshot.collectedAt);
    expect(result.periods.map((period) => period.period)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(result.periods.at(-1)?.cells.map((cell) => cell.value)).toEqual([11.36, null]);
    expect(result.ranking).toEqual([]);
    expect(result.rankingReason).toMatch(/Faltam valores do mesmo período/);
  });

  it("só ordena cidades com o mesmo indicador, período e unidade", () => {
    const portimao = snapshot.series.find((item) => item.indicatorId === rent.id)!;
    const faro: CitySeries = { ...portimao, territoryId: cities[1].id, territory: cities[1].name, observations: [{ ...portimao.observations[0], value: 8, displayValue: "8,00", sourceUrl: "https://www.ine.pt/example/2021" }, { ...portimao.observations.at(-1)!, value: 10, displayValue: "10,00", sourceUrl: "https://www.ine.pt/example/2025" }] };
    const result = buildComparison(cities, rent, [portimao, faro], snapshot.collectedAt);
    expect(result.ranking.map((item) => [item.territory, item.value])).toEqual([["Portimão", 11.36], ["Faro", 10]]);
    expect(result.periods.find((period) => period.period === "2023")?.cells[1].value).toBeNull();
    const wrongUnit = buildComparison(cities, rent, [portimao, { ...faro, unit: "%" }], snapshot.collectedAt);
    expect(wrongUnit.ranking).toEqual([]);
    const faroEarlierOnly = buildComparison(cities, rent, [portimao, { ...faro, observations: faro.observations.slice(0, 1) }], snapshot.collectedAt);
    expect(faroEarlierOnly.selectedPeriod).toBe("2021");
    expect(faroEarlierOnly.ranking).toHaveLength(2);
  });

  it("não cria uma tendência populacional com um único período", () => {
    const result = buildComparison(cities, population, snapshot.series, snapshot.collectedAt);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].period).toBe("2025");
    expect(result.ranking).toHaveLength(0);
  });

  it("combina snapshots do mesmo município sem perder períodos guardados depois", () => {
    const portimao = snapshot.series.find((item) => item.indicatorId === rent.id)!;
    const faro: CitySeries = { ...portimao, territoryId: cities[1].id, territory: cities[1].name,
      observations: [{ ...portimao.observations[0], period: "2021", periodCode: "S7A2021", value: 8, displayValue: "8,00" }] };
    const faroSaved: CitySeries = { ...faro, observations: [{ ...portimao.observations.at(-1)!, value: 10, displayValue: "10,00" }] };
    const result = buildComparison(cities, rent, [portimao, faro, faroSaved], snapshot.collectedAt);
    expect(result.selectedPeriod).toBe("2025");
    expect(result.ranking).toHaveLength(2);
  });
});

describe("GET /api/compare", () => {
  it("reutiliza snapshots sem qualquer pedido externo", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const response = await GET(new Request("http://localhost/api/compare?indicator=rendas&territories=1500811,1500805"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sourceMode).toBe("verified_snapshot");
    expect(body.availableCount).toBe(2);
    expect(body.ranking).toHaveLength(2);
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejeita identificadores fora da lista e duplicados", async () => {
    const invalid = await GET(new Request("http://localhost/api/compare?territories=1500811,1234567"));
    const duplicate = await GET(new Request("http://localhost/api/compare?territories=1500811,1500811"));
    expect(invalid.status).toBe(400);
    expect(duplicate.status).toBe(400);
  });

  it("aceita municípios nacionais e preserva ausências sem inventar ranking", async () => {
    const lisboa = getMunicipalityById("1A01106");
    expect(lisboa?.name).toBe("Lisboa");
    const response = await GET(new Request("http://localhost/api/compare?indicator=rendas&territories=1500811,1A01106"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.territories.map((city: { name: string }) => city.name)).toEqual(["Portimão", "Lisboa"]);
    expect(body.periods.at(-1).cells.map((cell: { value: number | null }) => cell.value)).toEqual([11.36, null]);
    expect(body.ranking).toEqual([]);
  });

  it("rejeita mais de quatro municípios", async () => {
    const response = await GET(new Request("http://localhost/api/compare?territories=1500811,1500805,1500807,1500801,1A01106"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/compare", () => {
  const post = (body: unknown) => new Request("http://localhost/api/compare", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  it("recusa municípios repetidos sem consultar o INE", async () => {
    const response = await POST(post({ indicator: "rendas", territoryIds: ["1500811", "1500811"] }));
    expect(response.status).toBe(400);
  });
  it("reutiliza observações já verificadas", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const response = await POST(post({ indicator: "rendas", territoryIds: ["1500811", "1500805"] }));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("snapshot");
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("POST /api/compare/explain", () => {
  it("não pede explicação ao Gemma sem ranking verificado", async () => {
    const response = await EXPLAIN(new Request("http://localhost/api/compare/explain", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ indicator: "rendas", territories: ["1500811", "1A01106"] }),
    }));
    expect(response.status).toBe(422);
  });
});

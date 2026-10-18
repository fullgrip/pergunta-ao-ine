import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { absoluteChange, allowedTerritory, ParsedQuestionSchema, percentChange, seriesSummary } from "../lib/analysis";
import { fetchObservation, periodCodes, plannedPeriods } from "../lib/ine/client";
import { getIndicator } from "../lib/ine/catalog";
import { normalizeIneResponse } from "../lib/ine/normalize";
import { ollamaHealth, parseQuestion } from "../lib/ollama";
import { citySnapshot } from "../lib/city";
import { discoveryCandidates } from "../lib/analytics/discoveries";
import { verifiedSnapshot } from "../lib/ine/snapshot";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/ine/${name}`, import.meta.url), "utf8"));
const rent = getIndicator("0014711")!; const pop = getIndicator("0012918")!; const unemployment = getIndicator("0012136")!;
afterEach(() => vi.unstubAllGlobals());

describe("respostas oficiais do INE", () => {
  it("normaliza população e rendas com unidades e códigos verificados", () => {
    expect(normalizeIneResponse(fixture("population-2025-portimao.json"), pop, pop.supportedTerritories[0], "2025", "S7A2025").observations[0].value).toBe(78125);
    expect(normalizeIneResponse(fixture("rent-2025-portimao.json"), rent, rent.supportedTerritories[0], "2025", "S7A2025").observations[0].value).toBe(11.36);
  });
  it("mantém o sinal de qualidade da taxa de desemprego", () => {
    const result = normalizeIneResponse(fixture("unemployment-2026-q2-algarve.json"), unemployment, unemployment.supportedTerritories[0], "2.º Trimestre de 2026", "S5A20262");
    expect(result.observations[0].value).toBe(4.2);
    expect(result.warnings.join(" ")).toMatch(/Coeficiente de variação elevado/);
  });
  it("não transforma dado confidencial em zero", () => {
    const raw = fixture("rent-2025-portimao.json"); delete raw[0].Dados["2025"][0].valor;
    raw[0].Dados["2025"][0].sinal_conv_desc = "Dado confidencial";
    const result = normalizeIneResponse(raw, rent, rent.supportedTerritories[0], "2025", "S7A2025");
    expect(result.observations[0].value).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Dado confidencial/);
  });
  it("rejeita envelope falso mesmo com HTTP 200", () => {
    const raw = fixture("population-2025-portimao.json"); raw[0].Sucesso = { Falso: [{ Msg: "Erro" }] };
    expect(() => normalizeIneResponse(raw, pop, pop.supportedTerritories[0], "2025", "S7A2025")).toThrow(/não confirmou sucesso/);
  });
});

describe("plano e cálculos", () => {
  it("rejeita indicadores e territórios não permitidos", () => {
    expect(() => ParsedQuestionSchema.parse({ intent: "trend", indicatorId: "https://outro.site", territoryIds: ["15"], startYear: null, endYear: null })).toThrow();
    expect(allowedTerritory(pop.id, "15")).toBeUndefined();
  });
  it("calcula variações e respeita zero e ausências", () => {
    expect(absoluteChange(10, 15)).toBe(5);
    expect(percentChange(10, 15)).toBe(50);
    expect(percentChange(0, 15)).toBeNull();
    expect(percentChange(null, 15)).toBeNull();
    expect(seriesSummary([{ territoryId: "x", territory: "x", period: "2024", periodCode: "x", value: null, displayValue: "—" }])).toBeNull();
  });
  it("gera os códigos oficiais do último trimestre publicado", () => {
    expect(periodCodes(unemployment, 2026)).toEqual([{ period: "1.º Trimestre de 2026", code: "S5A20261" }, { period: "2.º Trimestre de 2026", code: "S5A20262" }]);
  });
  it("planeia apenas os períodos necessários quando a pergunta não indica datas", () => {
    expect(plannedPeriods(rent).map((item) => item.period)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(plannedPeriods(pop).map((item) => item.period)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(plannedPeriods(unemployment).map((item) => item.code)).toEqual(["S5A20243", "S5A20244", "S5A20251", "S5A20252", "S5A20253", "S5A20254", "S5A20261", "S5A20262"]);
    expect(plannedPeriods(rent, 2024, 2025).map((item) => item.period)).toEqual(["2024", "2025"]);
  });
});

describe("Raio-X e descoberta verificável", () => {
  it("calcula a variação da série anual completa de renda", () => {
    const city = citySnapshot("portimao")!;
    expect(city.mode).toBe("snapshot");
    expect(city.series[0].observations.map((row) => row.period)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(city.series).toHaveLength(5);
    expect(city.metrics?.[0].percent).toBeCloseTo(60.22567, 4);
    expect(city.metrics?.some((item) => item.indicatorId === "0012918")).toBe(false);
  });
  it("a descoberta aponta para as duas observações e a fórmula", () => {
    const candidates = discoveryCandidates(citySnapshot("portimao")!);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const rentCandidate = candidates.find((item) => item.indicatorId === "0014711")!;
    expect(rentCandidate.first.period).toBe("2021");
    expect(rentCandidate.last.period).toBe("2025");
    expect(rentCandidate.first.sourceUrl).toContain("S7A2021");
    expect(rentCandidate.last.sourceUrl).toContain("S7A2025");
    expect(rentCandidate.formula).toContain("valor final");
  });
  it("o snapshot só responde aos territórios e anos que contém", () => {
    expect(verifiedSnapshot(pop, pop.supportedTerritories[1])).toBeNull();
    expect(verifiedSnapshot(rent, rent.supportedTerritories[0], 2024, 2024)?.observations[0].value).toBe(10.5);
  });
});

describe("falhas externas", () => {
  it("apresenta erro numa falha HTTP do INE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(fetchObservation(pop, pop.supportedTerritories[0], "2025", "S7A2025")).rejects.toThrow("HTTP 503");
  });
  it("repete com uma ligação nova quando o INE fica pendurado", async () => {
    const ok = fixture("population-2025-portimao.json");
    const network = vi.fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", network);
    const result = await fetchObservation(pop, pop.supportedTerritories[0], "2024", "S7A2024");
    expect(network).toHaveBeenCalledTimes(2);
    expect(result.observations.length).toBeGreaterThan(0);
  });
  it("volta a tentar quando o INE responde 503", async () => {
    const ok = fixture("population-2025-portimao.json");
    const network = vi.fn()
      .mockResolvedValueOnce(new Response("<html>503 - Service Unavailable</html>", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", network);
    const result = await fetchObservation(pop, pop.supportedTerritories[0], "2023", "S7A2023");
    expect(network).toHaveBeenCalledTimes(2);
    expect(result.observations.length).toBeGreaterThan(0);
  });
  it("deteta Ollama indisponível", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await ollamaHealth()).available).toBe(false);
  });
  it("tenta corrigir uma resposta inválida do Gemma e falha de forma clara", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: { content: "texto sem JSON" } }), { status: 200 })));
    await expect(parseQuestion("Como evoluiu a população de Faro?")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

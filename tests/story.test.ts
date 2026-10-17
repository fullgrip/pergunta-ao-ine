import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/story/route";
import { POST as discover } from "../app/api/discoveries/route";
import { buildCityStory } from "../lib/analytics/story";
import { strongestVerifiedDiscovery } from "../lib/analytics/discoveries";
import { citySnapshot, type CityDashboard } from "../lib/city";

afterEach(() => vi.unstubAllGlobals());

describe("história da cidade com prova", () => {
  it("destaca o maior salto entre anos consecutivos verificados", () => {
    const story = buildCityStory(citySnapshot("portimao")!);
    const change = story.sections[0];
    expect(story.modelUsed).toBe(false);
    expect(change.calculation?.result).toBeCloseTo(17.05685, 4);
    expect(change.evidence.map((row) => row.period)).toEqual(["2023", "2024"]);
    expect(change.evidence.every((row) => row.sourceUrl.includes("varcd=0014711"))).toBe(true);
    expect(change.text).toMatch(/variação percentual mais acentuada entre os pares de anos consecutivos/);
  });

  it("compara crescimento de ganho e renda, nunca parcela do salário gasta em renda", () => {
    const story = buildCityStory(citySnapshot("portimao")!);
    expect(story.sections[1].evidence.map((row) => row.indicatorId)).toEqual(["0014711", "0014711", "0012653", "0012653"]);
    expect(story.sections[1].evidence.map((row) => row.period)).toEqual(["2021", "2024", "2021", "2024"]);
    expect(story.sections[1].calculation?.result).toBeCloseTo(30.65706, 4);
    expect(story.sections[1].text).toMatch(/não mede a parcela do salário gasta em renda/);
    expect(story.sections[2].text).toMatch(/Um único valor de população/);
    expect(story.sections[2].text).toMatch(/não permitem concluir por que razão/);
  });

  it("deixa a variação em aberto quando há menos de dois valores e preserva aviso de qualidade", () => {
    const snapshot = citySnapshot("portimao")!;
    const sparse: CityDashboard = {
      ...snapshot,
      series: snapshot.series.map((series) => series.indicatorId === "0014711" ? { ...series, observations: [series.observations[0]] } : series),
      warnings: [...snapshot.warnings, "§: coeficiente de variação elevado."],
    };
    const story = buildCityStory(sparse);
    expect(story.sections[0].calculation).toBeUndefined();
    expect(story.sections[0].evidence).toHaveLength(0);
    expect(story.sections[2].text).toMatch(/coeficiente de variação elevado/);
  });

  it("descreve uma descida quando o último valor verificado é menor", () => {
    const snapshot = citySnapshot("portimao")!;
    const falling: CityDashboard = {
      ...snapshot,
      series: snapshot.series.map((series) => series.indicatorId === "0014711" ? {
        ...series,
        observations: series.observations.map((row) => row.period === "2025" ? { ...row, value: 5 } : row),
      } : series),
    };
    const story = buildCityStory(falling);
    expect(story.sections[0].title).toMatch(/descida/);
    expect(story.sections[0].calculation?.result).toBeLessThan(0);
  });

  it("seleciona Lagos como maior variação de renda entre quatro municípios com prova para todos", () => {
    const discovery = strongestVerifiedDiscovery()!;
    expect(discovery.territory).toBe("Lagos");
    expect(discovery.percent).toBeCloseTo(62.79683, 4);
    expect(discovery.peers).toHaveLength(4);
    expect(discovery.peers?.map((peer) => peer.territory)).toEqual(["Lagos", "Portimão", "Albufeira", "Faro"]);
    expect(discovery.peers?.every((peer) => peer.first.sourceUrl.includes("varcd=0014711") && peer.last.sourceUrl.includes("varcd=0014711"))).toBe(true);
  });

  it("serve os snapshots sem fazer pedidos externos e rejeita pedidos sem município", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("Não devia consultar a rede"); });
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/story?city=portimao"));
    expect(response.status).toBe(200);
    const story = await response.json();
    expect(story.sections).toHaveLength(3);
    expect(story.collectedAt).toBe("2026-10-17");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/api/story?city=faro"))).status).toBe(200);
    expect((await GET(new Request("http://localhost/api/story"))).status).toBe(400);
  });

  it("devolve descoberta calculada mesmo quando o Gemma está indisponível, sem consultar o INE", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("Ollama offline"); });
    vi.stubGlobal("fetch", fetchMock);
    const response = await discover(new Request("http://localhost/api/discoveries", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: "portimao" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.discovery.territory).toBe("Lagos");
    expect(body.modelUsed).toBe(false);
    expect(body.explanation).toMatch(/mesmo indicador, unidade e intervalo/);
    expect(body.explanation).not.toMatch(/maior subida percentual/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

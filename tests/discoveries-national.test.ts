import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "../app/api/discoveries/route";
import { strongestMunicipalDiscovery } from "../lib/analytics/discoveries";
import { citySnapshot, enrichCity, type CityDashboard } from "../lib/city";
import { getMunicipalityById } from "../lib/municipalities";

afterEach(() => vi.unstubAllGlobals());

const request = (body: unknown) => new Request("http://localhost/api/discoveries", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("descobertas nacionais", () => {
  it("seleciona apenas uma mudança comprovada com unidade, períodos e fontes do INE", () => {
    const city = citySnapshot("portimao")!;
    const discovery = strongestMunicipalDiscovery(city)!;
    const matching = city.series.find((item) => item.indicatorId === discovery.indicatorId)!;
    expect(discovery.territoryId).toBe(city.city.id);
    expect(discovery.unit).toBe(matching.unit);
    expect(discovery.first.period).toBe(matching.observations[0].period);
    expect(discovery.last.period).toBe(matching.observations.at(-1)?.period);
    expect(discovery.first.sourceUrl).toMatch(/^https:\/\/www\.ine\.pt\//);
    expect(discovery.last.sourceUrl).toMatch(/^https:\/\/www\.ine\.pt\//);
    expect(discovery.percent).toBeCloseTo(((discovery.last.value - discovery.first.value) / Math.abs(discovery.first.value)) * 100);
  });

  it("recusa uma conclusão temporal com um só período verificado", () => {
    const city = citySnapshot("faro")!;
    const sparse: CityDashboard = enrichCity({ ...city, metrics: [], series: city.series.map((item) => ({ ...item, observations: [item.observations[0]] })) });
    expect(strongestMunicipalDiscovery(sparse)).toBeNull();
  });

  it("usa o snapshot verificado para Faro e conserva a explicação factual se o modelo falhar", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("Modelo indisponível"); });
    vi.stubGlobal("fetch", fetchMock);
    const faro = getMunicipalityById("1500805")!;
    const response = await POST(request({ municipalityId: faro.id }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.discovery.territory).toBe("Faro");
    expect(body.discovery.peers).toBeUndefined();
    expect(body.mode).toBe("snapshot");
    expect(body.provider).toBe("template");
    expect(body.explanationData.headline).toContain("Faro");
    expect(body.explanationData.summary).toContain("€/m²");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita municípios fora do catálogo sem consultar serviços externos", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ municipalityId: "0000000" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/desconhecido/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta uma única vez a série anual de um município sem snapshot", async () => {
    const braga = getMunicipalityById("1120303")!;
    const fixture = JSON.parse(readFileSync(new URL("../fixtures/ine/rent-2021-2025-four-municipalities.json", import.meta.url), "utf8"));
    for (const rows of Object.values(fixture[0].Dados) as Array<Array<{ geocod: string; geodsg: string }>>) {
      for (const row of rows) { row.geocod = braga.id; row.geodsg = braga.name; }
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://www.ine.pt/")) return new Response(JSON.stringify(fixture), { status: 200 });
      throw new Error("Modelo indisponível");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ municipalityId: braga.id }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.discovery.territory).toBe("Braga");
    expect(body.mode).toBe("live");
    expect(fetchMock.mock.calls.filter(([url]) => url.startsWith("https://www.ine.pt/"))).toHaveLength(1);
  });
});

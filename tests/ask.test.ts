import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ollama", () => ({ parseQuestion: vi.fn(), narrate: vi.fn() }));
vi.mock("../lib/ine/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/ine/client")>()), fetchSeries: vi.fn(), fetchBatchObservations: vi.fn() }));
import { parseQuestion, narrate } from "../lib/ollama";
import { fetchBatchObservations, fetchSeries } from "../lib/ine/client";
import { POST } from "../app/api/ask/route";

const parseMock = vi.mocked(parseQuestion);
const seriesMock = vi.mocked(fetchSeries);
const batchMock = vi.mocked(fetchBatchObservations);
const narrateMock = vi.mocked(narrate);
const request = (question: string) => new Request("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
beforeEach(() => {
  vi.resetAllMocks();
  seriesMock.mockResolvedValue({ observations: [], extractedAt: "", lastUpdated: "", warnings: ["INE dados: ligação indisponível"] });
  batchMock.mockRejectedValue(new Error("INE dados: ligação indisponível"));
  narrateMock.mockResolvedValue("A renda mediana aumentou no período observado.");
});
describe("POST /api/ask sem acesso ao INE", () => {
  it("orienta uma pergunta subjetiva sobre onde viver sem fingir um ranking geral", async () => {
    const response = await POST(request("qual a melhor cidade pra viver no Algarve"));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ guidance: "city-choice" });
    expect(parseMock).not.toHaveBeenCalled();
    expect(seriesMock).not.toHaveBeenCalled();
    expect(batchMock).not.toHaveBeenCalled();
  });
  it("usa apenas o snapshot oficial verificado e identifica o modo", async () => {
    parseMock.mockResolvedValue({ intent: "trend", indicatorId: "0014711", territoryIds: ["1500811"], startYear: null, endYear: null });
    const response = await POST(request("Como evoluíram as rendas em Portimão?"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("snapshot");
    expect(body.snapshotDate).toBe("2026-10-17");
    expect(body.observations.map((row: { value: number }) => row.value)).toEqual([7.09, 7.92, 8.97, 10.5, 11.36]);
    expect(body.summaries[0].percent).toBeCloseTo(60.22567, 4);
    expect(body.analysisId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.explanation.evidenceId).toBe(body.analysisId);
    expect(body.sources[0].dataUrl).toContain("Dim1=S7A2021");
    expect(body.sources[0].dataUrl).toContain("S7A2025");
    expect(seriesMock).not.toHaveBeenCalled();
    expect(batchMock).not.toHaveBeenCalled();
  });
  it("transmite etapas reais e devolve a resposta estruturada por SSE", async () => {
    parseMock.mockResolvedValue({ intent: "trend", indicatorId: "0014711", territoryIds: ["1500811"], startYear: null, endYear: null });
    const response = await POST(new Request("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ question: "Como evoluíram as rendas em Portimão?" }) }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    expect([...stream.matchAll(/event: stage\ndata: (.+)/g)].map((match) => JSON.parse(match[1]).stage)).toEqual(["interpret", "data", "analyze", "explain"]);
    const result = JSON.parse(stream.match(/event: result\ndata: (.+)/)![1]);
    expect(result.explanation.headline).toMatch(/subiu em Portimão/);
    expect(result.mode).toBe("snapshot");
    expect(seriesMock).not.toHaveBeenCalled();
  });
  it("responde à população de Portimão em 2025 com um ponto do snapshot sem pedir ao INE", async () => {
    parseMock.mockResolvedValue({ intent: "trend", indicatorId: "0012918", territoryIds: ["1500811"], startYear: 2025, endYear: 2025 });
    const response = await POST(request("Qual era a população de Portimão em 2025?"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("snapshot");
    expect(body.observations.map((row: { value: number }) => row.value)).toEqual([78125]);
    expect(body.summary).toMatch(/apenas um período/);
    expect(seriesMock).not.toHaveBeenCalled();
    expect(narrateMock).not.toHaveBeenCalled();
  });
  it("recusa uma comparação sem snapshot para Faro", async () => {
    parseMock.mockResolvedValue({ intent: "comparison", indicatorId: "0012918", territoryIds: ["1500811", "1500805"], startYear: null, endYear: null });
    const response = await POST(request("Compara a população de Portimão com Faro"));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/O INE está indisponível neste momento/);
  });
  it("responde ao trimestre verificado sem consultar o INE nem outros trimestres", async () => {
    parseMock.mockResolvedValue({ intent: "trend", indicatorId: "0012136", territoryIds: ["15"], startYear: 2026, endYear: 2026, quarter: 2 });
    const response = await POST(request("Qual era a taxa de desemprego do Algarve no 2.º trimestre de 2026?"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(seriesMock).not.toHaveBeenCalled();
    expect(body.mode).toBe("snapshot");
    expect(body.quarter).toBe(2);
    expect(body.observations).toHaveLength(1);
    expect(body.observations[0].value).toBe(4.2);
    expect(body.sources[0].dataUrl).toContain("Dim1=S5A20262");
    expect(body.summaries[0].percent).toBeNull();
  });
  it("passa apenas o trimestre solicitado à consulta em direto quando não há snapshot", async () => {
    parseMock.mockResolvedValue({ intent: "trend", indicatorId: "0012136", territoryIds: ["15"], startYear: 2024, endYear: 2024, quarter: 2 });
    seriesMock.mockResolvedValue({ observations: [{ territoryId: "15", territory: "Algarve", period: "2.º Trimestre de 2024", periodCode: "S5A20242", value: 6, displayValue: "6,0" }], extractedAt: "2026-10-17", lastUpdated: "2025-08-01", warnings: [] });
    const response = await POST(request("Qual era a taxa de desemprego do Algarve no 2.º trimestre de 2024?"));
    expect(response.status).toBe(200);
    expect(seriesMock).toHaveBeenCalledTimes(1);
    expect(seriesMock.mock.calls[0].slice(2)).toEqual([2024, 2024, 2]);
    expect((await response.json()).observations).toHaveLength(1);
  });
});

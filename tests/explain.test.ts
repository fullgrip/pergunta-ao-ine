import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ollama", () => ({ chatWithMetadata: vi.fn() }));
import { chatWithMetadata } from "../lib/ollama";
import { storeEvidence, getEvidence, type StatisticalEvidence } from "../lib/explanation/evidence";
import { directNumbersLine, generateExplanation, hasOnlySupportedNumbers, talksAboutHousingOffTopic } from "../lib/explanation/generate";
import { POST } from "../app/api/explain/route";

const model = vi.mocked(chatWithMetadata);
const evidence: StatisticalEvidence = {
  question: "Como evoluíram as rendas em Portimão?",
  indicator: { id: "0014711", name: "Renda mediana de novos contratos", shortName: "Rendas", unit: "€/m²", dimensionDescription: "Novos contratos" },
  observations: [
    { territoryId: "1500811", territory: "Portimão", period: "2021", periodCode: "S7A2021", value: 7.09, displayValue: "7,09" },
    { territoryId: "1500811", territory: "Portimão", period: "2025", periodCode: "S7A2025", value: 11.36, displayValue: "11,36" },
  ],
  summaries: [{ territory: "Portimão", absolute: 4.27, percent: 60.22567 }],
  calculations: [{ label: "Variação percentual", value: 60.22567, unit: "%" }],
  sources: [{ name: "INE", url: "https://www.ine.pt/", dataUrl: "https://www.ine.pt/", indicatorId: "0014711" }],
  limitations: ["São apenas novos contratos de arrendamento."],
};
const request = (body: object) => new Request("http://localhost/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { vi.resetAllMocks(); model.mockResolvedValue({ content: JSON.stringify({ title: "Rendas em Portimão", body: "O valor observado aumentou no período disponível." }), provider: "ollama", model: "gemma4:e4b" }); });

describe("explicações com evidência imutável", () => {
  it("reutiliza a análise sem consultas ao INE, preserva números e limitações, e guarda o tom", async () => {
    const id = storeEvidence(evidence);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = await POST(request({ analysisId: id, tone: "sarcastic" }));
    const body = await first.json();
    expect(first.status).toBe(200);
    expect(body.provider).toBe("ollama");
    expect(body.tone).toBe("sarcastic");
    expect(body.body).toContain("7,09");
    expect(body.body).toContain("11,36");
    expect(body.body).toContain("São apenas novos contratos");
    await POST(request({ analysisId: id, tone: "sarcastic" }));
    expect(model).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("recusa valores arbitrários e tom inválido", async () => {
    const id = storeEvidence(evidence);
    expect((await POST(request({ analysisId: id, tone: "inventado" }))).status).toBe(400);
    expect((await POST(request({ analysisId: id, tone: "direct", observations: [{ value: 99 }] }))).status).toBe(400);
  });
  it("não encontra uma análise desconhecida ou expirada", async () => {
    expect((await POST(request({ analysisId: "00000000-0000-4000-8000-000000000000", tone: "direct" }))).status).toBe(410);
  });
  it("rejeita números inventados e usa template seguro após duas tentativas", async () => {
    const id = storeEvidence(evidence);
    model.mockResolvedValue({ content: JSON.stringify({ title: "Rendas em Portimão", body: "As rendas atingiram 99 €/m², um recorde absoluto." }), provider: "ollama", model: "gemma4:e4b" });
    const result = await generateExplanation(id, getEvidence(id)!, "sarcastic");
    expect(result.provider).toBe("template");
    expect(result.body).toContain("7,09");
    expect(result.body).not.toContain("99");
    expect(model).toHaveBeenCalledTimes(2);
  });
  it("tolera JSON inválido ou falha do Ollama e mantém a fonte factual", async () => {
    const id = storeEvidence(evidence);
    model.mockResolvedValueOnce({ content: "não é JSON", provider: "ollama", model: "gemma4:e4b" }).mockRejectedValueOnce(new Error("Ollama indisponível"));
    const result = await generateExplanation(id, getEvidence(id)!, "teacher");
    expect(result.provider).toBe("template");
    expect(result.body).toContain("São apenas novos contratos");
  });
  it("a validação rejeita números e quantificadores sem prova", () => {
    expect(hasOnlySupportedNumbers("Passou de 7,09 para 11,36 €/m² em 2025 (+60 %).", evidence)).toBe(true);
    expect(hasOnlySupportedNumbers("Chegou a 99 €/m².", evidence)).toBe(false);
    expect(hasOnlySupportedNumbers("As rendas duplicaram.", evidence)).toBe(false);
    const fractional = { ...evidence, observations: [{ ...evidence.observations[0], value: 8.4, displayValue: "8,4" }], summaries: [], calculations: [] };
    expect(hasOnlySupportedNumbers("O valor foi 8 €/m².", fractional)).toBe(false);
  });
  it("mantém a mesma conclusão factual quando muda o tom", async () => {
    const id = storeEvidence(evidence);
    const direct = await generateExplanation(id, getEvidence(id)!, "direct");
    const journalist = await generateExplanation(id, getEvidence(id)!, "journalist");
    expect(direct.headline).toBe(journalist.headline);
    expect(direct.headline.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(direct.summary).toContain("7,09");
    expect(direct.summary).toContain("11,36");
  });
  it("aceita a base de uma taxa mas continua a recusar números inventados", () => {
    expect(hasOnlySupportedNumbers("São crimes registados por cada mil habitantes.", evidence)).toBe(true);
    expect(hasOnlySupportedNumbers("Há mil crimes por ano.", evidence)).toBe(false);
  });
  it("no estilo Direto abre com os números: de X para Y", async () => {
    expect(directNumbersLine(evidence)).toBe("De 7,09 para 11,36 €/m² (2021 → 2025): +4,27 €/m², +60,2 %.");
    const id = storeEvidence(evidence);
    model.mockResolvedValue({ content: JSON.stringify({ summary: "Arrendar uma casa nova ficou bem mais caro." }), provider: "ollama", model: "gemma4:e4b" });
    const result = await generateExplanation(id, getEvidence(id)!, "direct");
    expect(result.summary.startsWith("De 7,09 para 11,36 €/m²")).toBe(true);
    expect(result.detail).toBe("De 7,09 para 11,36 €/m² (2021 → 2025): +4,27 €/m², +60,2 %. Arrendar uma casa nova ficou bem mais caro.");
  });
  it("recusa conclusões que os dados não provam", async () => {
    const id = storeEvidence(evidence);
    model.mockResolvedValue({ content: JSON.stringify({ summary: "Viver aqui passou a ter maior risco para quem procura casa." }), provider: "ollama", model: "gemma4:e4b" });
    expect((await generateExplanation(id, getEvidence(id)!, "direct")).provider).toBe("template");
  });
  it("não fala de casas quando o tema não é habitação", () => {
    const waste = { ...evidence, indicator: { ...evidence.indicator, id: "0012765" as const, shortName: "Resíduos urbanos por habitante", unit: "kg/hab." } };
    expect(talksAboutHousingOffTopic("Recolhe-se menos lixo, um alívio para quem procura casa.", waste)).toBe(true);
    expect(talksAboutHousingOffTopic("Recolhe-se menos lixo por habitante do que antes.", waste)).toBe(false);
    expect(talksAboutHousingOffTopic("Arrendar ficou mais caro.", evidence)).toBe(false);
  });
  it("rejeita brasileirismos no tom descontraído", async () => {
    const id = storeEvidence(evidence);
    model.mockResolvedValue({ content: JSON.stringify({ summary: "Basicamente, a grana que você gasta na renda subiu bastante nestes anos todos aí." }), provider: "ollama", model: "gemma4:e4b" });
    const result = await generateExplanation(id, getEvidence(id)!, "friend");
    expect(result.provider).toBe("template");
    expect(result.summary).not.toMatch(/grana|você/i);
  });
  it("rejeita chamar média à mediana e inferir causas sem prova", async () => {
    const id = storeEvidence(evidence);
    model.mockResolvedValue({ content: JSON.stringify({ summary: "O valor médio subiu significativamente e reflete a dinâmica do mercado." }), provider: "ollama", model: "gemma4:e4b" });
    const result = await generateExplanation(id, getEvidence(id)!, "direct");
    expect(result.provider).toBe("template");
    expect(result.summary).not.toMatch(/médio|reflete|significativamente/i);
  });
});

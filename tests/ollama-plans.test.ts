import { afterEach, describe, expect, it, vi } from "vitest";
import { isCityChoiceQuestion, questionConstraints } from "../lib/analysis";
import { plannedPeriods } from "../lib/ine/client";
import { getIndicator } from "../lib/ine/catalog";
import { narrate, parseQuestion } from "../lib/ollama";

const response = (plan: unknown) => new Response(JSON.stringify({ message: { content: JSON.stringify(plan) } }), { status: 200 });
const rentPlan = { intent: "trend", indicatorId: "0014711", territoryIds: ["1500811"], startYear: null, endYear: null };
afterEach(() => vi.unstubAllGlobals());

describe("interpretação de perguntas com limites verificáveis", () => {
  it("identifica pedidos para escolher cidade sem confundir renda com qualidade de vida", () => {
    expect(isCityChoiceQuestion("qual a melhor cidade pra viver no Algarve")).toBe(true);
    expect(isCityChoiceQuestion("Como evoluíram as rendas em Portimão?")).toBe(false);
  });
  it("usa os anos escritos pelo utilizador e não datas inventadas pelo modelo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...rentPlan, startYear: 2020, endYear: 2025 })));
    const plan = await parseQuestion("Como evoluíram as rendas em Portimão?");
    expect(plan).toEqual({ ...rentPlan, startYear: null, endYear: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("interpreta dois anos e dois territórios, independentemente da ordem", () => {
    expect(questionConstraints("População de Faro comparada com Portimão entre 2025 e 2021")).toEqual({
      intent: "comparison", indicatorId: "0012918", territoryIds: ["1500811", "1500805"], startYear: 2021, endYear: 2025,
    });
    expect(questionConstraints("Rendas de Portimão desde 2021")).toMatchObject({ startYear: 2021, endYear: null });
    expect(questionConstraints("Rendas em Lisboa").territoryIds).toEqual(["1A01106"]);
  });

  it("resolve Braga e dá prioridade ao município explícito face à seleção anterior", () => {
    expect(questionConstraints("Como evoluíram as rendas em Braga?", "1A01106").territoryIds).toEqual(["1120303"]);
    expect(questionConstraints("Como evoluíram as rendas?", "1A01106").territoryIds).toEqual(["1A01106"]);
    expect(() => questionConstraints("Como evoluíram as rendas em Vigo?", "1A01106")).toThrow(/Não reconhecemos/);
  });

  it("reconhece o tema quando a pergunta é feita em linguagem do dia a dia", () => {
    const tema = (pergunta: string) => questionConstraints(pergunta, "1500811").indicatorId;
    expect(tema("quanto se ganha?")).toBe("0012653");
    expect(tema("Qual é o salário em Faro?")).toBe("0012653");
    expect(tema("Quanto custa arrendar casa em Lagos?")).toBe("0014711");
    expect(tema("Quantas pessoas vivem em Portimão?")).toBe("0012918");
    expect(tema("Há muitos turistas em Albufeira?")).toBe("0013312");
    expect(tema("Como está o desemprego no Algarve?")).toBe("0012136");
    expect(() => tema("Quantas pessoas estão sem emprego no Algarve?")).toThrow(/taxa de desemprego/);
  });

  it("aceita mais formas naturais e explica o que ainda não existe", () => {
    const tema = (pergunta: string) => questionConstraints(pergunta, "1500811").indicatorId;
    expect(tema("Quanto é que as pessoas recebem em Portimão?")).toBe("0012653");
    expect(tema("Paga-se bem em Faro?")).toBe("0012653");
    expect(tema("Quantos visitantes recebe Faro?")).toBe("0013312");
    expect(tema("Portimão está a crescer?")).toBe("0012918");
    expect(tema("Qual o tamanho de Albufeira?")).toBe("0012918");
    expect(tema("Está difícil arranjar emprego no Algarve?")).toBe("0012136");
    expect(() => tema("Preço das casas em Portimão")).toThrow(/preços de compra/);
    expect(() => tema("Recicla-se muito em Lagos?")).toThrow(/reciclagem/);
    expect(() => tema("Quanto custa viver em Portimão?")).toThrow(/custo de vida/);
    expect(isCityChoiceQuestion("Vale a pena ir viver para Lagos?")).toBe(true);
  });

  it("não confunde verbos e nomes comuns com municípios", () => {
    expect(questionConstraints("Quanta gente mora em Tavira?").territoryIds).toEqual(["1500814"]);
    expect(questionConstraints("Rendas em Mora").territoryIds).toEqual(["1C40707"]);
    expect(questionConstraints("quantos habitantes tem a guarda").territoryIds).toEqual(["1960907"]);
  });

  it("pede esclarecimento para Lagoa, nome usado em dois municípios", () => {
    expect(() => questionConstraints("Como evoluíram as rendas em Lagoa?")).toThrow(/ambíguo/);
    expect(questionConstraints("Como evoluíram as rendas em Lagoa (R.A.A.)?").territoryIds).toEqual(["2004201"]);
  });

  it("distingue indicadores por habitante da população residente", () => {
    expect(questionConstraints("Hóspedes por habitante em Faro").indicatorId).toBe("0013312");
    expect(questionConstraints("Resíduos urbanos por habitante em Lisboa").indicatorId).toBe("0012765");
    expect(questionConstraints("Ganho médio mensal no Porto").indicatorId).toBe("0012653");
  });

  it("seleciona o trimestre oficial pedido mesmo se o modelo o omitir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ intent: "trend", indicatorId: "0012136", territoryIds: ["15"], startYear: null, endYear: null })));
    expect(await parseQuestion("Qual era a taxa de desemprego do Algarve no 2.º trimestre de 2026?")).toEqual({
      intent: "trend", indicatorId: "0012136", territoryIds: ["15"], startYear: 2026, endYear: 2026, quarter: 2,
    });
  });

  it("planeia um único pedido INE para um trimestre exato", () => {
    expect(plannedPeriods(getIndicator("0012136")!, 2026, 2026, 2)).toEqual([{ period: "2.º Trimestre de 2026", code: "S5A20262" }]);
  });

  it("pede uma segunda resposta ao Gemma se o indicador não corresponder à pergunta", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...rentPlan, indicatorId: "0012918" }))
      .mockResolvedValueOnce(response(rentPlan));
    vi.stubGlobal("fetch", fetchMock);
    expect(await parseQuestion("Como evoluíram as rendas em Portimão?")).toEqual(rentPlan);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recusa quantidades escritas por extenso na síntese do modelo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ summary: "A taxa era quatro vírgula dois por cento." })));
    await expect(narrate("Taxa de desemprego no Algarve", { value: 4.2 })).rejects.toThrow(/regra de evidência/);
  });

  it.each([
    ["Qual é a melhor cidade?", /Ainda não percebi o tema/],
    ["Rendas e população de Portimão", /um indicador de cada vez/],
    ["Taxa de desemprego no Algarve no 3.º trimestre de 2026", /ainda não está publicado/],
    ["Taxa de desemprego no Algarve no 5.º trimestre de 2025", /entre o primeiro e o quarto/],
    ["Taxa de desemprego no Algarve no 2.º trimestre", /Indique o ano/],
    ["Rendas em Portimão no 2.º trimestre de 2025", /indicador é anual/],
    ["Número de desempregados no Algarve", /taxa de desemprego/],
    ["Rendas em Portimão em 2026", /fora desse intervalo/],
  ])("recusa a pergunta fora do contrato sem chamar o modelo: %s", async (question, message) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(parseQuestion(question)).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

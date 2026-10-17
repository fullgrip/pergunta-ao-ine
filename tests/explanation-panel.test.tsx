import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ExplanationPanel, { explanationProviderLabel, type Explanation } from "../components/explain/ExplanationPanel";

const initial: Explanation = {
  tone: "direct",
  title: "Renda mediana",
  body: "A renda passou de 7,09 para 11,36 €/m².",
  evidenceId: "analysis-1",
  provider: "ollama",
  model: "gemma4:e4b",
};

describe("interface dos modos de resposta", () => {
  it("mostra as sete personagens e começa em Direto com a evidência recebida", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(<ExplanationPanel analysisId="analysis-1" initialExplanation={initial} />);
    for (const label of ["Como um amigo", "Direto", "Jornalista", "Professor", "Investigador", "Executivo", "Sarcástico"]) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("A renda passou de 7,09 para 11,36 €/m².");
    expect(html).toContain("ESCOLHE QUEM TE EXPLICA");
    expect(html).toContain("Comparar dois estilos");
    expect(html).toContain("Prova-me isso");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("identifica a origem real sem atribuir um template ao Gemma", () => {
    expect(explanationProviderLabel("gemini")).toBe("Gemma 4 · Gemini API");
    expect(explanationProviderLabel("ollama")).toBe("Gemma 4 · Ollama local");
    expect(explanationProviderLabel("template")).toBe("Síntese factual verificada");
  });
});

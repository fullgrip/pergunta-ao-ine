import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnswerHero from "../components/answer/AnswerHero";

describe("AnswerHero", () => {
  it("apresenta a pergunta antes da conclusão sem dados e explica o que falta", () => {
    const html = renderToStaticMarkup(<AnswerHero question="Como evoluiu a renda?" failureHeadline="Não é possível concluir com os dados disponíveis." failureReason="Falta uma observação numérica do INE para o período pedido." />);
    expect(html.indexOf("Como evoluiu a renda?")).toBeLessThan(html.indexOf("Não é possível concluir"));
    expect(html).toContain("Falta uma observação numérica");
    expect(html).not.toContain("EXPLICAÇÃO POR GEMMA 4");
  });
  it("mostra só a etapa de carregamento ativa", () => {
    const html = renderToStaticMarkup(<AnswerHero question="Rendas em Faro" loading stage="data" source="snapshot" />);
    expect(html).toContain("A ler dados oficiais guardados");
    expect(html).not.toContain("A preparar a explicação");
  });
});

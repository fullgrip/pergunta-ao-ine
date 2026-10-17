import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithMetadata } from "../lib/ollama";

const originalProvider = process.env.PROVIDER;
const originalKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (originalProvider === undefined) delete process.env.PROVIDER; else process.env.PROVIDER = originalProvider;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe("seleção real do fornecedor Gemma", () => {
  it("usa Gemini quando configurado e devolve o fornecedor efetivo", async () => {
    process.env.PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-only";
    const network = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", network);
    const result = await chatWithMetadata("Responde JSON", {});
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemma-4-26b-a4b-it");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("recorre ao Ollama se Gemini falhar, sem declarar falsamente Gemini", async () => {
    process.env.PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-only";
    const network = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "indisponível" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: '{"ok":true}' } }), { status: 200 }));
    vi.stubGlobal("fetch", network);
    const result = await chatWithMetadata("Responde JSON", {});
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("gemma4:e4b");
    expect(network).toHaveBeenCalledTimes(2);
  });
});

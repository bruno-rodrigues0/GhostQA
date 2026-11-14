import { describe, expect, it } from "vitest";
import {
  createOpenRouterClient,
  OPENROUTER_BASE_URL,
} from "../../src/lib/openrouter";

describe("createOpenRouterClient", () => {
  it("configura o endpoint oficial do OpenRouter", () => {
    const client = createOpenRouterClient("test-api-key");

    expect(client.baseURL).toBe(OPENROUTER_BASE_URL);
  });

  it("exige uma chave de API configurada", () => {
    expect(() => createOpenRouterClient("  ")).toThrow(
      "A variável OPENROUTER_API_KEY não está configurada.",
    );
  });
});

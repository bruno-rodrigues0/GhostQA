import { describe, expect, it } from "vitest";
import { parseCreateRunInput } from "../../src/lib/run-input";

describe("parseCreateRunInput", () => {
  it("applies safe defaults and validates a mission request", () => {
    expect(
      parseCreateRunInput({
        targetUrl: "https://example.com/signup",
        objective: "Criar uma conta",
        personas: [
          {
            id: "apressado",
            name: "O Apressado",
            description:
              "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
            technicalLevel: "medium",
          },
        ],
      }),
    ).toMatchObject({
      targetUrl: "https://example.com/signup",
      objective: "Criar uma conta",
      plan: "free",
      viewport: "desktop",
      personas: [{ id: "apressado", name: "O Apressado" }],
    });
  });

  it("enforces Free capabilities and accepts the Pro persona/device allowance", () => {
    const standardPersona = {
      id: "apressado",
      name: "O Apressado",
      description:
        "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
      technicalLevel: "medium",
    };
    const secondPersona = {
      id: "custom-reviewer",
      name: "Pesquisadora",
      description: "Analisa cada etapa com calma.",
      age: 34,
      context: "Está avaliando um serviço pela primeira vez.",
      technicalLevel: "high",
    };

    expect(() =>
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        personas: [standardPersona, secondPersona],
      }),
    ).toThrow("O plano Free permite até 1 persona(s) por missão.");
    expect(() =>
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        viewport: "mobile",
        personas: [standardPersona],
      }),
    ).toThrow("O viewport Mobile está disponível somente no plano Pro.");
    expect(() =>
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        personas: [secondPersona],
      }),
    ).toThrow("O plano Free permite somente personas padrão.");

    expect(
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        plan: "pro",
        viewport: "mobile",
        personas: [standardPersona, secondPersona],
      }, "pro"),
    ).toMatchObject({
      plan: "pro",
      viewport: "mobile",
      personas: [{ id: "apressado" }, { id: "custom-reviewer", age: 34 }],
    });

  });

  it("does not trust a Pro plan sent by the client", () => {
    expect(() =>
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        plan: "pro",
        viewport: "mobile",
        personas: [
          {
            id: "apressado",
            name: "O Apressado",
            description:
              "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
            technicalLevel: "medium",
          },
        ],
      }),
    ).toThrow("O viewport Mobile está disponível somente no plano Pro.");
  });

  it("rejects malformed, unsupported and oversized requests", () => {
    expect(() => parseCreateRunInput(null)).toThrow(
      "O corpo da requisição precisa ser um objeto JSON.",
    );
    expect(() =>
      parseCreateRunInput({
        targetUrl: "file:///etc/passwd",
        objective: "Criar uma conta",
        personas: [],
      }),
    ).toThrow("A URL da missão precisa usar HTTP ou HTTPS.");
    expect(() =>
      parseCreateRunInput({
        targetUrl: "https://example.com",
        objective: "Criar uma conta",
        personas: [],
      }),
    ).toThrow("Selecione ao menos uma persona válida.");
  });
});

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

  it("validates URL credentials, device values, and persona count limits", () => {
    const request = {
      targetUrl: "https://example.com",
      objective: "Criar uma conta",
      personas: [
        { id: "one", name: "One", description: "Descrição válida" },
      ],
    };

    expect(() =>
      parseCreateRunInput({ ...request, targetUrl: "https://user:pass@example.com" }),
    ).toThrow("A URL da missão não pode conter credenciais.");
    expect(() =>
      parseCreateRunInput({ ...request, viewport: "tablet" }),
    ).toThrow("O dispositivo da missão é inválido.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [
          ...request.personas,
          { id: "two", name: "Two", description: "Descrição válida" },
          { id: "three", name: "Three", description: "Descrição válida" },
          { id: "four", name: "Four", description: "Descrição válida" },
        ],
      }, "pro"),
    ).toThrow("Uma missão pode conter no máximo três personas.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [request.personas[0], request.personas[0]],
      }, "pro"),
    ).toThrow("Os identificadores das personas precisam ser únicos.");
  });

  it("validates persona fields, identifiers, optional age, context and technical level", () => {
    const request = {
      targetUrl: "https://example.com",
      objective: "Criar uma conta",
      plan: "pro",
      personas: [
        { id: "valid-id", name: "Pessoa", description: "Descrição válida" },
      ],
    };

    expect(() =>
      parseCreateRunInput({ ...request, objective: " " }),
    ).toThrow("O objetivo precisa ser um texto de 1 a 2000 caracteres.");
    expect(() =>
      parseCreateRunInput({ ...request, targetUrl: "  " }),
    ).toThrow("A URL precisa ser um texto de 1 a 2048 caracteres.");
    expect(() =>
      parseCreateRunInput({ ...request, targetUrl: "not-a-url" }),
    ).toThrow("A URL da missão precisa ser uma URL absoluta válida.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [{ id: "invalid id", name: "Pessoa", description: "Descrição" }],
      }, "pro"),
    ).toThrow("O id da persona contém caracteres inválidos.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [{ id: "ok", name: "", description: "Descrição" }],
      }, "pro"),
    ).toThrow("O nome da persona precisa ser um texto de 1 a 100 caracteres.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [{ id: "ok", name: "Pessoa", description: " " }],
      }, "pro"),
    ).toThrow("A descrição da persona precisa ser um texto de 1 a 2000 caracteres.");
    for (const age of [0, 121, 2.5, "25"]) {
      expect(() =>
        parseCreateRunInput({
          ...request,
          personas: [{ ...request.personas[0], age }],
        }, "pro"),
      ).toThrow("A idade da persona precisa ser um inteiro entre 1 e 120.");
    }
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [{ ...request.personas[0], context: " " }],
      }, "pro"),
    ).toThrow("O contexto da persona precisa ser um texto de 1 a 2000 caracteres.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: [{ ...request.personas[0], technicalLevel: "expert" }],
      }, "pro"),
    ).toThrow("O nível técnico da persona é inválido.");

    expect(
      parseCreateRunInput({
        ...request,
        personas: [{
          ...request.personas[0],
          age: 120,
          context: "  primeira visita  ",
          technicalLevel: "high",
        }],
      }, "pro").personas[0],
    ).toEqual({
      id: "valid-id",
      name: "Pessoa",
      description: "Descrição válida",
      age: 120,
      context: "primeira visita",
      technicalLevel: "high",
    });
  });

  it("rejects non-record personas and more than three entries", () => {
    const request = {
      targetUrl: "https://example.com",
      objective: "Criar uma conta",
      plan: "pro",
    };
    expect(() =>
      parseCreateRunInput({ ...request, personas: [null] }, "pro"),
    ).toThrow("Cada persona precisa ser um objeto JSON.");
    expect(() =>
      parseCreateRunInput({
        ...request,
        personas: Array.from({ length: 4 }, (_, index) => ({
          id: `p-${index}`,
          name: `Persona ${index}`,
          description: "Descrição",
        })),
      }, "pro"),
    ).toThrow("Uma missão pode conter no máximo três personas.");
  });
});

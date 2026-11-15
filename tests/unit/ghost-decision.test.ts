import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredOpenRouterModel,
  parsePersonaDecision,
  requestPersonaDecision,
  toIssueSeverity,
} from "../../src/lib/ghost-decision";
import type { Persona } from "../../src/lib/types";

const persona: Persona = {
  id: "persona-1",
  name: "O Apressado",
  description: "Quer concluir a tarefa rapidamente.",
  age: 29,
  context: "Está com pressa para criar uma conta.",
  technicalLevel: "low",
};

const validDecision = {
  pensamento_persona: "Vou abrir o cadastro.",
  nivel_frustracao: 2,
  acao: "click",
  elemento_id: 1,
  texto_digitado: null,
  problema_ux_encontrado: null,
  severidade_problema: "nenhuma",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parsePersonaDecision", () => {
  it("valida e tipa uma decisão completa", () => {
    expect(parsePersonaDecision(JSON.stringify(validDecision))).toEqual(
      validDecision,
    );
  });

  it("rejects malformed JSON and values that are not objects", () => {
    expect(() => parsePersonaDecision("{")).toThrow(
      "O modelo retornou uma resposta que não é JSON válido.",
    );
    expect(() => parsePersonaDecision("null")).toThrow(
      "A decisão do modelo precisa ser um objeto JSON.",
    );
    expect(() => parsePersonaDecision("[]")).toThrow(
      "A decisão do modelo precisa ser um objeto JSON.",
    );
  });

  it.each([
    ["pensamento_persona", 123, "A decisão do modelo não contém pensamento_persona."],
    ["nivel_frustracao", "2", "O nível de frustração precisa ser um inteiro entre 1 e 10."],
    ["nivel_frustracao", 2.5, "O nível de frustração precisa ser um inteiro entre 1 e 10."],
    ["nivel_frustracao", 0, "O nível de frustração precisa ser um inteiro entre 1 e 10."],
    ["nivel_frustracao", 11, "O nível de frustração precisa ser um inteiro entre 1 e 10."],
    ["acao", 1, "A decisão do modelo contém uma ação inválida."],
    ["acao", "submit", "A decisão do modelo contém uma ação inválida."],
    ["elemento_id", "1", "O identificador do elemento precisa ser positivo ou null."],
    ["elemento_id", 1.5, "O identificador do elemento precisa ser positivo ou null."],
    ["elemento_id", 0, "O identificador do elemento precisa ser positivo ou null."],
    ["texto_digitado", 1, "texto_digitado precisa ser uma string ou null."],
    ["problema_ux_encontrado", 1, "problema_ux_encontrado precisa ser uma string ou null."],
    ["severidade_problema", 1, "A decisão do modelo contém uma severidade inválida."],
    ["severidade_problema", "urgente", "A decisão do modelo contém uma severidade inválida."],
  ])("rejects invalid %s value %j", (field, value, message) => {
    expect(() =>
      parsePersonaDecision(
        JSON.stringify({ ...validDecision, [field]: value }),
      ),
    ).toThrow(message);
  });

  it("recusa interações sem identificador de elemento", () => {
    expect(() =>
      parsePersonaDecision(
        JSON.stringify({ ...validDecision, elemento_id: null }),
      ),
    ).toThrow("A ação click exige um elemento_id válido.");
  });

  it("requires text for typing and supports other action variants", () => {
    expect(() =>
      parsePersonaDecision(
        JSON.stringify({
          ...validDecision,
          acao: "type",
          texto_digitado: null,
        }),
      ),
    ).toThrow("A ação type exige texto_digitado.");

    for (const action of ["scroll", "finish", "give_up"] as const) {
      expect(
        parsePersonaDecision(
          JSON.stringify({ ...validDecision, acao: action, elemento_id: null }),
        ).acao,
      ).toBe(action);
    }

    expect(
      parsePersonaDecision(
        JSON.stringify({
          ...validDecision,
          acao: "type",
          texto_digitado: "user@example.com",
        }),
      ).texto_digitado,
    ).toBe("user@example.com");
  });
});

describe("toIssueSeverity", () => {
  it.each([
    ["baixa", "low"],
    ["media", "medium"],
    ["alta", "high"],
    ["nenhuma", "none"],
  ] as const)("maps %s to %s", (severity, expected) => {
    expect(toIssueSeverity(severity)).toBe(expected);
  });
});

describe("requestPersonaDecision", () => {
  function makeCompletionResponse(content: string) {
    return Response.json({
      id: "completion-1",
      object: "chat.completion",
      created: 1,
      model: "provider/model-exato",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content },
        },
      ],
    });
  }

  it("envia imagem base64, histórico e JSON mode ao modelo configurado", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      makeCompletionResponse(JSON.stringify(validDecision)),
    );
    const client = new OpenAI({
      apiKey: "unit-test-key",
      baseURL: "https://openrouter.ai/api/v1",
      fetch: fetchMock,
    });

    await expect(
      requestPersonaDecision({
        client,
        model: "provider/model-exato",
        screenshot: Buffer.from("png-bytes"),
        persona,
        objective: "Iniciar cadastro",
        history: ["Passo 1: a persona encontrou o botão."],
        availableElements: [
          {
            id: 1,
            tagName: "button",
            label: "Continuar",
            bounds: { x: 10, y: 20, width: 100, height: 40 },
            clickPoint: { x: 60, y: 40 },
          },
          {
            id: 3,
            tagName: "a",
            label: "Criar conta",
            bounds: { x: 10, y: 80, width: 120, height: 40 },
            clickPoint: { x: 60, y: 100 },
          },
        ],
      }),
    ).resolves.toEqual(validDecision);

    const [, request] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      max_tokens: number;
      response_format: { type: string };
      messages: Array<{
        role: string;
        content:
          | string
          | Array<{
              type: string;
              text?: string;
              image_url?: { url: string };
            }>;
      }>;
    };
    const content = body.messages[1]?.content;
    const systemPrompt = body.messages[0]?.content;
    const promptText =
      typeof content === "string"
        ? content
        : (content?.find(({ type }) => type === "text")?.text ?? "");
    expect(body.model).toBe("provider/model-exato");
    expect(body.max_tokens).toBe(2048);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          image_url: { url: "data:image/png;base64,cG5nLWJ5dGVz" },
        }),
      ]),
    );
    expect(JSON.stringify(content)).toContain("Iniciar cadastro");
    expect(JSON.stringify(content)).toContain("Passo 1");
    expect(JSON.stringify(content)).toContain(
      "Elementos interativos realmente visíveis e clicáveis nesta imagem:",
    );
    expect(promptText).toContain('"id":1');
    expect(typeof systemPrompt).toBe("string");
    if (typeof systemPrompt === "string") {
      expect(systemPrompt).toContain(
        "Nunca clique, preencha ou tente resolver CAPTCHA",
      );
    }
    expect(JSON.stringify(content)).toContain("Idade: 29");
    expect(JSON.stringify(content)).toContain("Está com pressa para criar uma conta.");
    expect(JSON.stringify(content)).toContain("Nível técnico: low");
  });

  it("retries once when the model omits a required decision field", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeCompletionResponse(
          JSON.stringify({
            nivel_frustracao: 2,
            acao: "finish",
            elemento_id: null,
            texto_digitado: null,
            problema_ux_encontrado: null,
            severidade_problema: "nenhuma",
          }),
        ),
      )
      .mockResolvedValueOnce(makeCompletionResponse(JSON.stringify(validDecision)));
    const client = new OpenAI({
      apiKey: "unit-test-key",
      baseURL: "https://openrouter.ai/api/v1",
      fetch: fetchMock,
    });

    await expect(
      requestPersonaDecision({
        client,
        model: "provider/model-exato",
        screenshot: Buffer.from("png-bytes"),
        persona,
        objective: "Iniciar cadastro",
        history: [],
      }),
    ).resolves.toEqual(validDecision);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryRequest] = fetchMock.mock.calls[1]!;
    const retryBody = JSON.parse(String(retryRequest?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retryBody.messages[0]?.content).toContain(
      "A tentativa anterior não correspondeu",
    );
    expect(retryBody.messages[0]?.content).toContain(
      "pensamento_persona",
    );
  });

  it("returns an explicit failure after two invalid model responses", async () => {
    const invalidContent = JSON.stringify({
      acao: "finish",
      elemento_id: null,
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => makeCompletionResponse(invalidContent));
    const client = new OpenAI({
      apiKey: "unit-test-key",
      baseURL: "https://openrouter.ai/api/v1",
      fetch: fetchMock,
    });

    await expect(
      requestPersonaDecision({
        client,
        model: "provider/model-exato",
        screenshot: Buffer.from("png-bytes"),
        persona,
        objective: "Iniciar cadastro",
        history: [],
      }),
    ).rejects.toThrow(
      "O modelo não conseguiu retornar uma decisão válida após duas tentativas: A decisão do modelo não contém pensamento_persona.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses configured credentials and omits optional persona context", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-key");
    vi.stubEnv("OPENROUTER_MODEL", "provider/default-model");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      makeCompletionResponse(JSON.stringify(validDecision)),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestPersonaDecision({
        screenshot: new Uint8Array([1, 2, 3]),
        persona: { id: "minimal", name: "Pessoa", description: "Perfil" },
        objective: "Concluir tarefa",
        history: [],
      }),
    ).resolves.toEqual(validDecision);

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      messages: Array<{ content: string | Array<{ text?: string }> }>;
    };
    expect(body.model).toBe("provider/default-model");
    expect(JSON.stringify(body.messages[1]?.content)).not.toContain("Idade:");
    expect(JSON.stringify(body.messages[1]?.content)).not.toContain("Contexto:");
    expect(JSON.stringify(body.messages[1]?.content)).not.toContain("Nível técnico:");
  });

  it("retries when the completion has no message content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: "completion-empty",
          object: "chat.completion",
          created: 1,
          model: "provider/model-exato",
          choices: [],
        }),
      )
      .mockResolvedValueOnce(makeCompletionResponse(JSON.stringify(validDecision)));
    const client = new OpenAI({
      apiKey: "unit-test-key",
      baseURL: "https://openrouter.ai/api/v1",
      fetch: fetchMock,
    });

    await expect(
      requestPersonaDecision({
        client,
        model: "provider/model-exato",
        screenshot: Buffer.from("png-bytes"),
        persona,
        objective: "Iniciar cadastro",
        history: [],
      }),
    ).resolves.toEqual(validDecision);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getConfiguredOpenRouterModel", () => {
  it("exige o identificador exato do modelo configurado", () => {
    expect(() => getConfiguredOpenRouterModel("  ")).toThrow(
      "A variável OPENROUTER_MODEL não está configurada.",
    );
    expect(getConfiguredOpenRouterModel(" provider/model-exato ")).toBe(
      "provider/model-exato",
    );
  });

  it("reads the model identifier from the environment by default", () => {
    vi.stubEnv("OPENROUTER_MODEL", " provider/env-model ");
    expect(getConfiguredOpenRouterModel()).toBe("provider/env-model");
  });
});

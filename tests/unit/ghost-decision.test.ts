import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  getConfiguredOpenRouterModel,
  parsePersonaDecision,
  requestPersonaDecision,
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

describe("parsePersonaDecision", () => {
  it("valida e tipa uma decisão completa", () => {
    expect(parsePersonaDecision(JSON.stringify(validDecision))).toEqual(
      validDecision,
    );
  });

  it("recusa ações ou severidades que não pertencem ao contrato", () => {
    expect(() =>
      parsePersonaDecision(
        JSON.stringify({ ...validDecision, acao: "submit" }),
      ),
    ).toThrow("A decisão do modelo contém uma ação inválida.");
  });

  it("recusa interações sem identificador de elemento", () => {
    expect(() =>
      parsePersonaDecision(
        JSON.stringify({ ...validDecision, elemento_id: null }),
      ),
    ).toThrow("A ação click exige um elemento_id válido.");
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
      }),
    ).resolves.toEqual(validDecision);

    const [, request] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      max_tokens: number;
      response_format: { type: string };
      messages: Array<{
        role: string;
        content: string | Array<{ type: string; image_url?: { url: string } }>;
      }>;
    };
    const content = body.messages[1]?.content;
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
});

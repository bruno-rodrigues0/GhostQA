import OpenAI from "openai";
import { createOpenRouterClient } from "./openrouter";
import type { Persona, StepAction, IssueSeverity } from "./types";

export type PersonaDecisionSeverity = "baixa" | "media" | "alta" | "nenhuma";

export interface PersonaDecision {
  pensamento_persona: string;
  nivel_frustracao: number;
  acao: StepAction;
  elemento_id: number | null;
  texto_digitado: string | null;
  problema_ux_encontrado: string | null;
  severidade_problema: PersonaDecisionSeverity;
}

export interface RequestPersonaDecisionOptions {
  client?: OpenAI;
  model?: string;
  screenshot: Uint8Array;
  persona: Persona;
  objective: string;
  history: string[];
  availableElements?: Array<{
    id: number;
    tagName: string;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    clickPoint: { x: number; y: number };
  }>;
}

const validActions: readonly StepAction[] = [
  "click",
  "type",
  "scroll",
  "finish",
  "give_up",
];
const validSeverities: readonly PersonaDecisionSeverity[] = [
  "baixa",
  "media",
  "alta",
  "nenhuma",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function getConfiguredOpenRouterModel(
  model: string | undefined = process.env.OPENROUTER_MODEL,
): string {
  if (!model?.trim()) {
    throw new Error("A variável OPENROUTER_MODEL não está configurada.");
  }
  return model.trim();
}

export function parsePersonaDecision(content: string): PersonaDecision {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error("O modelo retornou uma resposta que não é JSON válido.");
  }

  if (!isRecord(value)) {
    throw new Error("A decisão do modelo precisa ser um objeto JSON.");
  }

  if (typeof value.pensamento_persona !== "string") {
    throw new Error("A decisão do modelo não contém pensamento_persona.");
  }
  if (
    typeof value.nivel_frustracao !== "number" ||
    !Number.isInteger(value.nivel_frustracao) ||
    value.nivel_frustracao < 1 ||
    value.nivel_frustracao > 10
  ) {
    throw new Error("O nível de frustração precisa ser um inteiro entre 1 e 10.");
  }
  if (
    typeof value.acao !== "string" ||
    !validActions.includes(value.acao as StepAction)
  ) {
    throw new Error("A decisão do modelo contém uma ação inválida.");
  }
  if (
    value.elemento_id !== null &&
    (typeof value.elemento_id !== "number" ||
      !Number.isInteger(value.elemento_id) ||
      value.elemento_id < 1)
  ) {
    throw new Error("O identificador do elemento precisa ser positivo ou null.");
  }
  if (!isNullableString(value.texto_digitado)) {
    throw new Error("texto_digitado precisa ser uma string ou null.");
  }
  if (!isNullableString(value.problema_ux_encontrado)) {
    throw new Error("problema_ux_encontrado precisa ser uma string ou null.");
  }
  if (
    typeof value.severidade_problema !== "string" ||
    !validSeverities.includes(value.severidade_problema as PersonaDecisionSeverity)
  ) {
    throw new Error("A decisão do modelo contém uma severidade inválida.");
  }

  const action = value.acao as StepAction;
  if (
    (action === "click" || action === "type") &&
    typeof value.elemento_id !== "number"
  ) {
    throw new Error(`A ação ${action} exige um elemento_id válido.`);
  }
  if (action === "type" && value.texto_digitado === null) {
    throw new Error("A ação type exige texto_digitado.");
  }

  return {
    pensamento_persona: value.pensamento_persona,
    nivel_frustracao: value.nivel_frustracao,
    acao: action,
    elemento_id: value.elemento_id,
    texto_digitado: value.texto_digitado,
    problema_ux_encontrado: value.problema_ux_encontrado,
    severidade_problema: value.severidade_problema as PersonaDecisionSeverity,
  };
}

function severityToType(
  severity: PersonaDecisionSeverity,
): IssueSeverity {
  switch (severity) {
    case "baixa":
      return "low";
    case "media":
      return "medium";
    case "alta":
      return "high";
    case "nenhuma":
      return "none";
  }
}

export function toIssueSeverity(
  severity: PersonaDecisionSeverity,
): IssueSeverity {
  return severityToType(severity);
}

export async function requestPersonaDecision(
  options: RequestPersonaDecisionOptions,
): Promise<PersonaDecision> {
  const client = options.client ?? createOpenRouterClient();
  const model = getConfiguredOpenRouterModel(options.model);
  const imageBase64 = Buffer.from(options.screenshot).toString("base64");
  const context = [
    `Persona: ${options.persona.name}`,
    `Perfil: ${options.persona.description}`,
    ...(options.persona.age === undefined
      ? []
      : [`Idade: ${options.persona.age}`]),
    ...(options.persona.context
      ? [`Contexto: ${options.persona.context}`]
      : []),
    ...(options.persona.technicalLevel
      ? [`Nível técnico: ${options.persona.technicalLevel}`]
      : []),
    `Objetivo da missão: ${options.objective}`,
    ...(options.availableElements === undefined
      ? []
      : [
          `Elementos interativos realmente visíveis e clicáveis nesta imagem: ${JSON.stringify(options.availableElements)}.`,
        ]),
    `Histórico resumido: ${JSON.stringify(options.history)}`,
  ].join("\n");

  const systemPrompt = [
    "Você é um agente de QA comportamental. Decida a próxima ação fielmente à persona.",
    "Responda somente com um objeto JSON válido, sem markdown, comentários ou chaves adicionais.",
    "Use exatamente estas chaves e tipos: pensamento_persona (string curta em primeira pessoa), nivel_frustracao (inteiro de 1 a 10), acao (click, type, scroll, finish ou give_up), elemento_id (inteiro marcado na imagem ou null), texto_digitado (string ou null), problema_ux_encontrado (string ou null), severidade_problema (baixa, media, alta ou nenhuma).",
    "Não omita nenhuma chave. Em click e type, elemento_id deve ser um elemento marcado existente. Em type, texto_digitado deve ser uma string. Use finish ao cumprir o objetivo e give_up ao desistir.",
    "Se uma interação anterior não foi confirmada pela automação, não a descreva como falha do site nem registre um problema de UX com base apenas nisso. Só relate defeito após observar evidência do comportamento do site.",
    "Se a automação informar timeout, não repita a mesma interação sem reavaliar a nova captura.",
    "Nunca clique, preencha ou tente resolver CAPTCHA, reCAPTCHA, hCaptcha, Turnstile ou qualquer verificação humana/anti-bot. Se aparecer, encerre a jornada sem atribuir um defeito de UX ao site.",
    ...(options.availableElements === undefined
      ? []
      : [
          `Para esta imagem, escolha elemento_id somente entre os objetos listados acima. Use o rótulo e a posição para selecionar o alvo correto. Nunca escolha elementos encobertos ou invente/reutilize IDs que não estejam na lista.`,
        ]),
    `Exemplo estrutural obrigatório: ${JSON.stringify({
      pensamento_persona: "Vou selecionar a opção para continuar.",
      nivel_frustracao: 2,
      acao: "click",
      elemento_id: 1,
      texto_digitado: null,
      problema_ux_encontrado: null,
      severidade_problema: "nenhuma",
    })}`,
  ].join(" ");
  const messages = [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: context },
        {
          type: "image_url" as const,
          image_url: {
            url: `data:image/png;base64,${imageBase64}`,
          },
        },
      ],
    },
  ];

  let lastValidationError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages:
        attempt === 0
          ? messages
          : [
              {
                role: "system",
                content: `${systemPrompt} A tentativa anterior não correspondeu ao formato exigido. Reavalie a imagem e gere agora o objeto completo.`,
              },
              messages[1]!,
            ],
    });

    const content = completion.choices[0]?.message.content;
    try {
      if (typeof content !== "string" || content.length === 0) {
        throw new Error("O modelo não retornou uma decisão em formato JSON.");
      }
      return parsePersonaDecision(content);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      lastValidationError = error;
      if (attempt === 0) {
        console.warn(
          `[Bunter] Resposta do modelo fora do contrato (${error.message}); solicitando uma nova decisão.`,
        );
      }
    }
  }

  throw new Error(
    `O modelo não conseguiu retornar uma decisão válida após duas tentativas: ${lastValidationError?.message ?? "resposta inválida"}`,
  );
}

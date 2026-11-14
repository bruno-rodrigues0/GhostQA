import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterClient(
  apiKey: string | undefined = process.env.OPENROUTER_API_KEY,
): OpenAI {
  if (!apiKey?.trim()) {
    throw new Error("A variável OPENROUTER_API_KEY não está configurada.");
  }

  return new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: OPENROUTER_BASE_URL,
  });
}

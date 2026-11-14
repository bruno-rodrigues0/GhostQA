import type { DeviceViewport, Persona, Plan } from "./types";
import { assertPlanCapabilities } from "./plan-constants";

export interface CreateRunInput {
  targetUrl: string;
  objective: string;
  plan: Plan;
  viewport: DeviceViewport;
  personas: Persona[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > maximumLength
  ) {
    throw new Error(`${field} precisa ser um texto de 1 a ${maximumLength} caracteres.`);
  }
  return value.trim();
}

function parsePersona(value: unknown): Persona {
  if (!isRecord(value)) {
    throw new Error("Cada persona precisa ser um objeto JSON.");
  }

  const id = readNonEmptyString(value.id, "O id da persona", 64);
  if (!/^[\w-]+$/.test(id)) {
    throw new Error("O id da persona contém caracteres inválidos.");
  }

  const persona: Persona = {
    id,
    name: readNonEmptyString(value.name, "O nome da persona", 100),
    description: readNonEmptyString(
      value.description,
      "A descrição da persona",
      2000,
    ),
  };

  if (value.age !== undefined) {
    if (
      typeof value.age !== "number" ||
      !Number.isInteger(value.age) ||
      value.age < 1 ||
      value.age > 120
    ) {
      throw new Error("A idade da persona precisa ser um inteiro entre 1 e 120.");
    }
    persona.age = value.age;
  }

  if (value.context !== undefined) {
    persona.context = readNonEmptyString(value.context, "O contexto da persona", 2000);
  }

  if (value.technicalLevel !== undefined) {
    if (
      value.technicalLevel !== "low" &&
      value.technicalLevel !== "medium" &&
      value.technicalLevel !== "high"
    ) {
      throw new Error("O nível técnico da persona é inválido.");
    }
    persona.technicalLevel = value.technicalLevel;
  }

  return persona;
}

export function parseCreateRunInput(
  value: unknown,
  authorizedPlan: Plan = "free",
): CreateRunInput {
  if (!isRecord(value)) {
    throw new Error("O corpo da requisição precisa ser um objeto JSON.");
  }

  const objective = readNonEmptyString(value.objective, "O objetivo", 2000);
  const rawUrl = readNonEmptyString(value.targetUrl, "A URL", 2048);
  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    throw new Error("A URL da missão precisa ser uma URL absoluta válida.");
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw new Error("A URL da missão precisa usar HTTP ou HTTPS.");
  }
  if (targetUrl.username || targetUrl.password) {
    throw new Error("A URL da missão não pode conter credenciais.");
  }

  const plan = authorizedPlan;

  const viewport = value.viewport ?? "desktop";
  if (viewport !== "desktop" && viewport !== "mobile") {
    throw new Error("O dispositivo da missão é inválido.");
  }

  if (!Array.isArray(value.personas) || value.personas.length === 0) {
    throw new Error("Selecione ao menos uma persona válida.");
  }
  if (value.personas.length > 3) {
    throw new Error("Uma missão pode conter no máximo três personas.");
  }

  const personas = value.personas.map(parsePersona);
  if (new Set(personas.map(({ id }) => id)).size !== personas.length) {
    throw new Error("Os identificadores das personas precisam ser únicos.");
  }
  assertPlanCapabilities(plan, viewport, personas);

  return {
    targetUrl: targetUrl.href,
    objective,
    plan,
    viewport,
    personas,
  };
}

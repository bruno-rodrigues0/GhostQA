import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { Persona, Session, Step, TechLog } from "./types";

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RunStore {
  get(sessionId: string, ownerId?: string): Promise<Session | undefined>;
  list(limit?: number, ownerId?: string): Promise<Session[]>;
  save(session: Session, ownerId?: string): Promise<void>;
}

function validateSessionId(sessionId: string): void {
  if (!sessionIdPattern.test(sessionId)) {
    throw new Error("O identificador da sessão é inválido.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPersona(value: unknown): value is Persona {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.age === undefined || typeof value.age === "number") &&
    (value.context === undefined || typeof value.context === "string") &&
    (value.technicalLevel === undefined ||
      value.technicalLevel === "low" ||
      value.technicalLevel === "medium" ||
      value.technicalLevel === "high")
  );
}

function isStep(value: unknown): value is Step {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.personaId === "string" &&
    typeof value.order === "number" &&
    typeof value.thought === "string" &&
    typeof value.frustrationLevel === "number" &&
    (value.action === "click" ||
      value.action === "type" ||
      value.action === "scroll" ||
      value.action === "finish" ||
      value.action === "give_up") &&
    (typeof value.elementId === "number" || value.elementId === null) &&
    (typeof value.typedText === "string" || value.typedText === null) &&
    (typeof value.uxProblem === "string" || value.uxProblem === null) &&
    (value.severity === "low" ||
      value.severity === "medium" ||
      value.severity === "high" ||
      value.severity === "none") &&
    (typeof value.annotatedScreenshotPath === "string" ||
      value.annotatedScreenshotPath === null) &&
    (typeof value.cleanScreenshotPath === "string" ||
      value.cleanScreenshotPath === null) &&
    typeof value.createdAt === "string"
  );
}

function isTechLog(value: unknown): value is TechLog {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    (value.type === "console" ||
      value.type === "pageerror" ||
      value.type === "http" ||
      value.type === "automation") &&
    typeof value.message === "string" &&
    (value.url === undefined || typeof value.url === "string") &&
    (value.status === undefined || typeof value.status === "number") &&
    typeof value.createdAt === "string"
  );
}

function isSession(value: unknown, expectedId: string): value is Session {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === expectedId &&
    typeof value.targetUrl === "string" &&
    typeof value.objective === "string" &&
    (value.plan === "free" || value.plan === "pro") &&
    (value.viewport === "desktop" || value.viewport === "mobile") &&
    Array.isArray(value.personas) &&
    value.personas.every(isPersona) &&
    (value.status === "pending" ||
      value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed") &&
    Array.isArray(value.steps) &&
    value.steps.every(isStep) &&
    Array.isArray(value.techLogs) &&
    value.techLogs.every(isTechLog) &&
    (typeof value.frictionScore === "number" || value.frictionScore === null) &&
    (value.missionStatus === "completed" ||
      value.missionStatus === "abandoned" ||
      value.missionStatus === null) &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every((item) => typeof item === "string") &&
    (typeof value.errorMessage === "string" || value.errorMessage === null) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function parseStoredSession(json: string, expectedId: string): Session {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error(`O arquivo da sessão ${expectedId} não contém JSON válido.`);
  }

  if (!isSession(value, expectedId)) {
    throw new Error(`O arquivo da sessão ${expectedId} contém dados inválidos.`);
  }
  return value as Session;
}

export function createRunStore(
  directory = path.join(process.cwd(), "data", "runs"),
): RunStore {
  async function get(sessionId: string): Promise<Session | undefined> {
    validateSessionId(sessionId);
    try {
      const json = await readFile(
        path.join(directory, `${sessionId}.json`),
        "utf8",
      );
      return parseStoredSession(json, sessionId);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async function list(limit = 10): Promise<Session[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("O limite de sessões precisa ser um inteiro entre 1 e 100.");
    }

    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }

    const sessionIds = entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .filter((entry) => sessionIdPattern.test(entry));
    const sessions = await Promise.all(
      sessionIds.map(async (sessionId) => {
        const session = await get(sessionId);
        if (!session) {
          throw new Error(
            `O arquivo da sessão ${sessionId} desapareceu durante a leitura.`,
          );
        }
        return session;
      }),
    );

    return sessions
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async function save(session: Session): Promise<void> {
    validateSessionId(session.id);
    await mkdir(directory, { recursive: true });

    const filePath = path.join(directory, `${session.id}.json`);
    const temporaryPath = path.join(
      directory,
      `.${session.id}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, `${JSON.stringify(session, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  return { get, list, save };
}

export function createPrismaRunStore(): RunStore {
  return {
    async get(sessionId, ownerId) {
      validateSessionId(sessionId);
      if (!ownerId) {
        throw new Error("É necessário informar o proprietário da auditoria.");
      }
      const record = await prisma.auditRun.findFirst({
        where: { id: sessionId, userId: ownerId },
        select: { data: true },
      });
      return record
        ? parseStoredSession(JSON.stringify(record.data), sessionId)
        : undefined;
    },
    async list(limit = 10, ownerId) {
      if (!ownerId) {
        throw new Error("É necessário informar o proprietário da auditoria.");
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("O limite de sessões precisa ser um inteiro entre 1 e 100.");
      }
      const records = await prisma.auditRun.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { data: true, id: true },
      });
      return records.map((record) =>
        parseStoredSession(JSON.stringify(record.data), record.id),
      );
    },
    async save(session, suppliedOwnerId) {
      validateSessionId(session.id);
      const ownerId = suppliedOwnerId ?? session.ownerId;
      if (!ownerId) {
        throw new Error("É necessário informar o proprietário da auditoria.");
      }
      const record = await prisma.auditRun.findFirst({
        where: { id: session.id, userId: ownerId },
        select: { id: true },
      });
      const data = JSON.parse(JSON.stringify(session)) as Prisma.InputJsonValue;
      const values = {
        plan: session.plan,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        data,
      };
      if (record) {
        await prisma.auditRun.update({ where: { id: record.id }, data: values });
        return;
      }
      await prisma.auditRun.create({
        data: { id: session.id, userId: ownerId, ...values },
      });
    },
  };
}

export const runStore = createPrismaRunStore();

import { runGhostSession } from "./ghost-engine";
import { runStore } from "./run-store";
import type OpenAI from "openai";
import type { Session } from "./types";

const activeSessionIds = new Set<string>();

export interface RunExecutionOptions {
  client: OpenAI;
  model: string;
}

export function claimRunExecution(sessionId: string): boolean {
  if (activeSessionIds.has(sessionId)) {
    return false;
  }
  activeSessionIds.add(sessionId);
  return true;
}

export function releaseRunExecution(sessionId: string): void {
  activeSessionIds.delete(sessionId);
}

export async function executeClaimedRun(
  session: Session,
  options: RunExecutionOptions,
): Promise<void> {
  try {
    await runGhostSession(session, {
      ...options,
      onUpdate: (updatedSession) =>
        runStore.save(updatedSession, updatedSession.ownerId),
    });
  } catch (error) {
    console.error(
      `[GhostQA] Execução em background da sessão ${session.id} terminou com erro.`,
      error,
    );
  } finally {
    releaseRunExecution(session.id);
  }
}

export function prepareSessionRetry(
  session: Session,
  updatedAt = new Date().toISOString(),
): Session {
  return {
    ...session,
    status: "pending",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: null,
    updatedAt,
  };
}

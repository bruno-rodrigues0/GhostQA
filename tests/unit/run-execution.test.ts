import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  claimRunExecution,
  prepareSessionRetry,
  releaseRunExecution,
} from "../../src/lib/run-execution";
import type { Session } from "../../src/lib/types";

function makeCompletedSession(): Session {
  const timestamp = "2026-11-14T00:00:00.000Z";
  return {
    id: randomUUID(),
    targetUrl: "https://example.com",
    objective: "Concluir uma compra",
    plan: "pro",
    viewport: "mobile",
    personas: [
      {
        id: "apressado",
        name: "O Apressado",
        description: "Prioriza rapidez.",
      },
    ],
    status: "completed",
    steps: [
      {
        id: randomUUID(),
        personaId: "apressado",
        order: 1,
        thought: "Não encontrei o botão.",
        frustrationLevel: 4,
        action: "finish",
        elementId: null,
        typedText: null,
        uxProblem: null,
        severity: "none",
        annotatedScreenshotPath: null,
        cleanScreenshotPath: null,
        createdAt: timestamp,
      },
    ],
    techLogs: [
      {
        id: randomUUID(),
        type: "automation",
        message: "Timeout.",
        createdAt: timestamp,
      },
    ],
    frictionScore: 42,
    missionStatus: "completed",
    recommendations: ["Melhorar o botão principal."],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("run retry preparation", () => {
  it("clears previous results while retaining the run identity and configuration", () => {
    const session = makeCompletedSession();
    const updatedAt = "2026-11-15T00:00:00.000Z";

    const retried = prepareSessionRetry(session, updatedAt);

    expect(retried).toMatchObject({
      id: session.id,
      targetUrl: session.targetUrl,
      objective: session.objective,
      plan: session.plan,
      viewport: session.viewport,
      personas: session.personas,
      status: "pending",
      steps: [],
      techLogs: [],
      frictionScore: null,
      missionStatus: null,
      recommendations: [],
      errorMessage: null,
      createdAt: session.createdAt,
      updatedAt,
    });
  });

  it("allows only one active execution claim per session", () => {
    const sessionId = randomUUID();

    expect(claimRunExecution(sessionId)).toBe(true);
    expect(claimRunExecution(sessionId)).toBe(false);

    releaseRunExecution(sessionId);
    expect(claimRunExecution(sessionId)).toBe(true);
    releaseRunExecution(sessionId);
  });
});

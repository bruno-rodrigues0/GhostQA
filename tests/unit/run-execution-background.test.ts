import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";

const { runGhostSession, save } = vi.hoisted(() => ({
  runGhostSession: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../src/lib/ghost-engine", () => ({ runGhostSession }));
vi.mock("../../src/lib/run-store", () => ({
  runStore: { save },
}));

import {
  claimRunExecution,
  executeClaimedRun,
  releaseRunExecution,
} from "../../src/lib/run-execution";
import type { Session } from "../../src/lib/types";

function session(): Session {
  return {
    id: "e607b668-fca3-4f4f-9b99-80a3cc74f410",
    ownerId: "owner-1",
    targetUrl: "https://example.com",
    objective: "Complete checkout",
    plan: "free",
    viewport: "desktop",
    personas: [],
    status: "pending",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: null,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:00:00.000Z",
  };
}

function client(): OpenAI {
  return new OpenAI({ apiKey: "unit-test-key" });
}

afterEach(() => {
  releaseRunExecution("e607b668-fca3-4f4f-9b99-80a3cc74f410");
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("background run execution", () => {
  it("persists session updates and releases the active-run claim", async () => {
    const current = session();
    const updated = { ...current, status: "running" as const };
    runGhostSession.mockImplementation(async (_session, { onUpdate }) => {
      await onUpdate(updated);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(claimRunExecution(current.id)).toBe(true);

    await executeClaimedRun(current, { client: client(), model: "test-model" });

    expect(runGhostSession).toHaveBeenCalledWith(
      current,
      expect.objectContaining({ model: "test-model" }),
    );
    expect(save).toHaveBeenCalledWith(updated, current.ownerId);
    expect(error).not.toHaveBeenCalled();
    expect(claimRunExecution(current.id)).toBe(true);
  });

  it("logs errors from the background worker and still releases the claim", async () => {
    const failure = new Error("browser closed");
    runGhostSession.mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const current = session();
    expect(claimRunExecution(current.id)).toBe(true);

    await executeClaimedRun(current, { client: client(), model: "test-model" });

    expect(error).toHaveBeenCalledWith(
      `[GhostQA] Execução em background da sessão ${current.id} terminou com erro.`,
      failure,
    );
    expect(claimRunExecution(current.id)).toBe(true);
  });

  it("logs unexpected non-Error values thrown by the background worker", async () => {
    runGhostSession.mockRejectedValue("unexpected failure");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const current = session();

    await executeClaimedRun(current, { client: client(), model: "test-model" });

    expect(error).toHaveBeenCalledWith(
      `[GhostQA] Execução em background da sessão ${current.id} terminou com erro.`,
      "unexpected failure",
    );
  });
});

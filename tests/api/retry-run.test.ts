import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});
vi.mock("../../src/lib/auth-session", () => ({
  getCurrentUser: vi.fn(),
}));

import { POST } from "../../src/app/api/runs/[id]/retry/route";
import { getCurrentUser } from "../../src/lib/auth-session";
import {
  claimRunExecution,
  releaseRunExecution,
} from "../../src/lib/run-execution";
import { runStore } from "../../src/lib/run-store";
import type { Session } from "../../src/lib/types";

const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";

afterEach(() => {
  releaseRunExecution(sessionId);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  afterMock.mockReset();
});

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

function makeSession(status: Session["status"]): Session {
  const timestamp = "2026-11-14T00:00:00.000Z";
  return {
    id: sessionId,
    targetUrl: "https://example.com",
    objective: "Encontrar um produto",
    plan: "free",
    viewport: "desktop",
    personas: [],
    status,
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function requestRetry(id = sessionId): Promise<Response> {
  return POST(new Request(`http://localhost/api/runs/${id}/retry`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("retry run API", () => {
  it("returns not found when the requested session does not exist", async () => {
    vi.spyOn(runStore, "get").mockResolvedValue(undefined);
    const saveSpy = vi.spyOn(runStore, "save");

    const response = await requestRetry();

    expect(response.status).toBe(404);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("rejects sessions that are pending or running", async () => {
    vi.spyOn(runStore, "get").mockResolvedValue(makeSession("running"));
    const saveSpy = vi.spyOn(runStore, "save");

    const response = await requestRetry();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "RUN_NOT_RETRYABLE",
      status: "running",
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("requeues a completed run using the same ID without creating a monthly session", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-key");
    const session = makeSession("completed");
    const getSpy = vi.spyOn(runStore, "get").mockResolvedValue(session);
    const saveSpy = vi.spyOn(runStore, "save").mockResolvedValue();
    const listSpy = vi.spyOn(runStore, "list");

    const response = await requestRetry();
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ id: session.id, status: "pending" });
    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0]).toMatchObject({
      id: session.id,
      targetUrl: session.targetUrl,
      objective: session.objective,
      createdAt: session.createdAt,
      status: "pending",
      steps: [],
      techLogs: [],
      frictionScore: null,
      missionStatus: null,
      recommendations: [],
      errorMessage: null,
    });
    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledWith(sessionId, "user-1");
    expect(afterMock).toHaveBeenCalledOnce();
  });

  it("returns conflict when another request already claimed the run", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-key");
    vi.spyOn(runStore, "get").mockResolvedValue(makeSession("failed"));
    const saveSpy = vi.spyOn(runStore, "save");
    expect(claimRunExecution(sessionId)).toBe(true);

    const response = await requestRetry();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "RUN_ALREADY_ACTIVE",
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("releases the execution claim when scheduling fails and persists a retryable failure", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-key");
    vi.spyOn(runStore, "get").mockResolvedValue(makeSession("failed"));
    const saveSpy = vi.spyOn(runStore, "save").mockResolvedValue();
    afterMock.mockImplementation(() => {
      throw new Error("Scheduling unavailable");
    });

    const response = await requestRetry();

    expect(response.status).toBe(500);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1][0]).toMatchObject({
      id: sessionId,
      status: "failed",
      errorMessage: "Não foi possível agendar a repetição da auditoria.",
    });
    expect(claimRunExecution(sessionId)).toBe(true);
  });

  it("rejects malformed IDs", async () => {
    const response = await requestRetry("../other");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "O identificador da sessão é inválido.",
    });
  });

  it("returns not found for a valid but unknown ID", async () => {
    vi.spyOn(runStore, "get").mockResolvedValue(undefined);

    const response = await requestRetry(randomUUID());

    expect(response.status).toBe(404);
  });
});

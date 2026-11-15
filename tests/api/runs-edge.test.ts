import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => {
  class MonthlySessionLimitError extends Error {
    constructor() {
      super("monthly limit");
      this.used = 5;
      this.limit = 5;
    }
    used: number;
    limit: number;
  }
  class PlanCapabilityError extends Error {}

  return {
    mocks: {
      after: vi.fn(),
      getCurrentUser: vi.fn(),
      getConfiguredOpenRouterModel: vi.fn(),
      createOpenRouterClient: vi.fn(),
      parseCreateRunInput: vi.fn(),
      claimRunExecution: vi.fn(),
      executeClaimedRun: vi.fn(),
      releaseRunExecution: vi.fn(),
      createUserRunWithinLimit: vi.fn(),
      hideFreeTechnicalLogs: vi.fn((session: unknown) => session),
      getUserPlan: vi.fn(),
      runStore: { list: vi.fn(), save: vi.fn() },
      MonthlySessionLimitError,
      PlanCapabilityError,
    },
  };
});

vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after,
}));
vi.mock("@/lib/auth-session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/ghost-decision", () => ({
  getConfiguredOpenRouterModel: mocks.getConfiguredOpenRouterModel,
}));
vi.mock("@/lib/openrouter", () => ({
  createOpenRouterClient: mocks.createOpenRouterClient,
}));
vi.mock("@/lib/run-input", () => ({
  parseCreateRunInput: mocks.parseCreateRunInput,
}));
vi.mock("@/lib/run-execution", () => ({
  claimRunExecution: mocks.claimRunExecution,
  executeClaimedRun: mocks.executeClaimedRun,
  releaseRunExecution: mocks.releaseRunExecution,
}));
vi.mock("@/lib/plan-limits", () => ({
  createUserRunWithinLimit: mocks.createUserRunWithinLimit,
  hideFreeTechnicalLogs: mocks.hideFreeTechnicalLogs,
  MonthlySessionLimitError: mocks.MonthlySessionLimitError,
  PlanCapabilityError: mocks.PlanCapabilityError,
  getUserPlan: mocks.getUserPlan,
}));
vi.mock("@/lib/run-store", () => ({ runStore: mocks.runStore }));

import { GET, POST } from "../../src/app/api/runs/route";

const user = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
};
const input = {
  targetUrl: "https://example.com",
  objective: "Complete checkout",
  plan: "free" as const,
  viewport: "desktop" as const,
  personas: [{ id: "p1", name: "Persona", description: "Test persona." }],
};

function request(body: unknown = {}) {
  return new Request("http://localhost/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.getUserPlan.mockResolvedValue("free");
  mocks.parseCreateRunInput.mockReturnValue(input);
  mocks.getConfiguredOpenRouterModel.mockReturnValue("model");
  mocks.createOpenRouterClient.mockReturnValue({ client: true });
  mocks.createUserRunWithinLimit.mockImplementation(
    async (_userId: string, session: unknown) => session,
  );
  mocks.claimRunExecution.mockReturnValue(true);
  mocks.runStore.list.mockResolvedValue([]);
  mocks.runStore.save.mockResolvedValue(undefined);
  mocks.after.mockImplementation((callback: () => void) => {
    void callback;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runs API error paths", () => {
  it("requires authentication and handles list success and storage failure", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);

    mocks.runStore.list.mockResolvedValueOnce([{ id: "run-1", plan: "free" }]);
    const success = await GET();
    expect(success.status).toBe(200);
    expect(success.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.hideFreeTechnicalLogs).toHaveBeenCalledOnce();

    mocks.runStore.list.mockRejectedValueOnce(new Error("storage down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET()).status).toBe(500);
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("returns errors for anonymous users, failed plan lookup and invalid input", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);

    mocks.getUserPlan.mockRejectedValueOnce(new Error("database down"));
    expect((await POST(request())).status).toBe(500);

    mocks.parseCreateRunInput.mockImplementationOnce(() => {
      throw new Error("invalid objective");
    });
    const invalid = await POST(request());
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "invalid objective" });

    mocks.parseCreateRunInput.mockImplementationOnce(() => {
      throw "invalid body";
    });
    const malformed = await POST(request());
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "O corpo da requisição não pôde ser validado.",
    });
  });

  it("reports missing OpenRouter configuration and protects server internals", async () => {
    mocks.getConfiguredOpenRouterModel.mockImplementationOnce(() => {
      throw new Error("model missing");
    });
    const configured = await POST(request());
    expect(configured.status).toBe(503);
    await expect(configured.json()).resolves.toEqual({ error: "model missing" });

    mocks.createOpenRouterClient.mockImplementationOnce(() => {
      throw "key missing";
    });
    const client = await POST(request());
    expect(client.status).toBe(503);
    await expect(client.json()).resolves.toEqual({
      error: "A configuração do OpenRouter está incompleta.",
    });
  });

  it("maps plan capability and monthly quota errors to client responses", async () => {
    mocks.createUserRunWithinLimit.mockRejectedValueOnce(
      new mocks.PlanCapabilityError("unsupported capability"),
    );
    const capability = await POST(request());
    expect(capability.status).toBe(400);
    await expect(capability.json()).resolves.toEqual({
      error: "unsupported capability",
    });

    mocks.createUserRunWithinLimit.mockRejectedValueOnce(
      new mocks.MonthlySessionLimitError(),
    );
    const quota = await POST(request());
    expect(quota.status).toBe(429);
    await expect(quota.json()).resolves.toMatchObject({
      code: "MONTHLY_LIMIT_REACHED",
      used: 5,
      limit: 5,
    });
  });

  it("releases failed claims, handles duplicate claims and accepts scheduled runs", async () => {
    mocks.createUserRunWithinLimit.mockRejectedValueOnce(new Error("db error"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(mocks.releaseRunExecution).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();

    mocks.claimRunExecution.mockReturnValueOnce(false);
    const duplicate = await POST(request());
    expect(duplicate.status).toBe(500);
    await expect(duplicate.json()).resolves.toEqual({
      error: "Não foi possível reservar a execução da sessão.",
    });

    const accepted = await POST(request());
    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toMatchObject({ status: "pending" });
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("persists a failed run when background scheduling throws", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw new Error("scheduler down");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.releaseRunExecution).toHaveBeenCalledOnce();
    expect(mocks.runStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "Não foi possível agendar a execução da auditoria.",
      }),
    );
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("reports a secondary persistence failure without hiding the scheduler error", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw new Error("scheduler down");
    });
    mocks.runStore.save.mockRejectedValueOnce(new Error("storage down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await POST(request())).status).toBe(500);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});

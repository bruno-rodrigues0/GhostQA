import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    after: vi.fn(),
    getCurrentUser: vi.fn(),
    getConfiguredOpenRouterModel: vi.fn(),
    createOpenRouterClient: vi.fn(),
    claimRunExecution: vi.fn(),
    executeClaimedRun: vi.fn(),
    prepareSessionRetry: vi.fn((session: { id: string }) => ({
      ...session,
      status: "pending",
    })),
    releaseRunExecution: vi.fn(),
    runStore: { get: vi.fn(), save: vi.fn() },
  },
}));

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
vi.mock("@/lib/run-execution", () => ({
  claimRunExecution: mocks.claimRunExecution,
  executeClaimedRun: mocks.executeClaimedRun,
  prepareSessionRetry: mocks.prepareSessionRetry,
  releaseRunExecution: mocks.releaseRunExecution,
}));
vi.mock("@/lib/run-store", () => ({ runStore: mocks.runStore }));

import { POST } from "../../src/app/api/runs/[id]/retry/route";

const user = { id: "user-1", name: "User", email: "user@example.com" };
const session = {
  id: "e607b668-fca3-4f4f-9b99-80a3cc74f410",
  status: "failed",
  plan: "free",
  steps: [],
  techLogs: [],
  personas: [],
  recommendations: [],
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

function retry(id = session.id) {
  return POST(new Request(`http://localhost/api/runs/${id}/retry`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.runStore.get.mockResolvedValue(session);
  mocks.runStore.save.mockResolvedValue(undefined);
  mocks.getConfiguredOpenRouterModel.mockReturnValue("model");
  mocks.createOpenRouterClient.mockReturnValue({ client: true });
  mocks.claimRunExecution.mockReturnValue(true);
  mocks.prepareSessionRetry.mockImplementation((value: { id: string }) => ({
    ...value,
    status: "pending",
  }));
  mocks.after.mockImplementation(() => {});
});

describe("retry API error paths", () => {
  it("requires authentication and distinguishes invalid IDs from storage errors", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await retry()).status).toBe(401);

    mocks.runStore.get.mockRejectedValueOnce(
      new Error("O identificador da sessão é inválido."),
    );
    expect((await retry()).status).toBe(400);

    mocks.runStore.get.mockRejectedValueOnce(new Error("storage down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await retry()).status).toBe(500);
    expect(error).toHaveBeenCalledOnce();
  });

  it("returns not-found and non-retryable status conflicts", async () => {
    mocks.runStore.get.mockResolvedValueOnce(undefined);
    expect((await retry()).status).toBe(404);

    mocks.runStore.get.mockResolvedValueOnce({ ...session, status: "running" });
    const conflict = await retry();
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "RUN_NOT_RETRYABLE",
      status: "running",
    });
  });

  it("handles configuration errors from the model and client factories", async () => {
    mocks.getConfiguredOpenRouterModel.mockImplementationOnce(() => {
      throw new Error("model missing");
    });
    const model = await retry();
    expect(model.status).toBe(503);
    await expect(model.json()).resolves.toEqual({ error: "model missing" });

    mocks.createOpenRouterClient.mockImplementationOnce(() => {
      throw "api key missing";
    });
    const client = await retry();
    expect(client.status).toBe(503);
    await expect(client.json()).resolves.toEqual({
      error: "A configuração do OpenRouter está incompleta.",
    });
  });

  it("returns a conflict when the run cannot be claimed", async () => {
    mocks.claimRunExecution.mockReturnValue(false);

    const response = await retry();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "RUN_ALREADY_ACTIVE",
    });
    expect(mocks.runStore.save).not.toHaveBeenCalled();
  });

  it("releases the claim and reports a persistence failure before scheduling", async () => {
    mocks.runStore.save.mockRejectedValueOnce(new Error("storage down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await retry();

    expect(response.status).toBe(500);
    expect(mocks.releaseRunExecution).toHaveBeenCalledWith(session.id);
    expect(error).toHaveBeenCalledOnce();
  });

  it("saves a failed retry when scheduling fails and reports a secondary save error", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw new Error("scheduler down");
    });
    mocks.runStore.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      new Error("secondary storage failure"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await retry();

    expect(response.status).toBe(500);
    expect(mocks.runStore.save).toHaveBeenCalledTimes(2);
    expect(mocks.runStore.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "Não foi possível agendar a repetição da auditoria.",
      }),
      user.id,
    );
    expect(mocks.releaseRunExecution).toHaveBeenCalledWith(session.id);
    expect(error).toHaveBeenCalledTimes(2);
  });
});

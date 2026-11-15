import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, runStore, hideFreeTechnicalLogs } = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn() },
  runStore: { get: vi.fn() },
  hideFreeTechnicalLogs: vi.fn((session: unknown) => session),
}));

vi.mock("@/lib/auth-session", () => auth);
vi.mock("@/lib/plan-limits", () => ({ hideFreeTechnicalLogs }));
vi.mock("@/lib/run-store", () => ({ runStore }));

import { GET } from "../../src/app/api/runs/[id]/route";

const id = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
const user = { id: "owner", name: "User", email: "user@example.com" };

function getRun(runId = id) {
  return GET(new Request("http://localhost"), {
    params: Promise.resolve({ id: runId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue(user);
  runStore.get.mockResolvedValue(undefined);
  hideFreeTechnicalLogs.mockImplementation((session: unknown) => session);
});

describe("single run API", () => {
  it("requires authentication and returns a not-found response", async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    expect((await getRun()).status).toBe(401);

    const response = await getRun();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "A sessão solicitada não foi encontrada.",
    });
  });

  it("returns an owned session without caching", async () => {
    const session = { id, ownerId: user.id, plan: "free" };
    runStore.get.mockResolvedValue(session);

    const response = await getRun();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(runStore.get).toHaveBeenCalledWith(id, user.id);
    expect(hideFreeTechnicalLogs).toHaveBeenCalledWith(session);
    await expect(response.json()).resolves.toEqual(session);
  });

  it("maps invalid identifiers to a client error and logs other failures", async () => {
    runStore.get.mockRejectedValueOnce(
      new Error("O identificador da sessão é inválido."),
    );
    const invalid = await getRun("../invalid");
    expect(invalid.status).toBe(400);

    runStore.get.mockRejectedValueOnce(new Error("database down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await getRun();
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      error: "Não foi possível carregar a sessão de auditoria.",
    });
    expect(error).toHaveBeenCalledOnce();
  });
});

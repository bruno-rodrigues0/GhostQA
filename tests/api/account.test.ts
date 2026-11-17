import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getUserMonthlyUsage } = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn() },
  getUserMonthlyUsage: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => auth);
vi.mock("@/lib/plan-limits", () => ({ getUserMonthlyUsage }));

import { GET } from "../../src/app/api/account/route";

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
  });
  getUserMonthlyUsage.mockResolvedValue({ plan: "free", used: 2, limit: 5 });
});

describe("account API", () => {
  it("requires authentication", async () => {
    auth.getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "É necessário entrar na sua conta.",
    });
    expect(getUserMonthlyUsage).not.toHaveBeenCalled();
  });

  it("returns private account plan usage without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
      plan: "free",
      used: 2,
      limit: 5,
    });
    expect(getUserMonthlyUsage).toHaveBeenCalledWith("user-1");
  });

  it("logs plan usage failures and returns a safe server error", async () => {
    const failure = new Error("database down");
    getUserMonthlyUsage.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar os dados da conta.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[Bunter] Não foi possível consultar a conta user-1.",
      failure,
    );
  });
});

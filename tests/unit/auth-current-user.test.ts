import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, headers, getAuth } = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers }));
vi.mock("@/lib/auth", () => ({ getAuth }));

import { getCurrentUser } from "../../src/lib/auth-session";

beforeEach(() => {
  vi.resetAllMocks();
  headers.mockResolvedValue(new Headers({ cookie: "session=test" }));
  getAuth.mockReturnValue({ api: { getSession } });
});

describe("current user session lookup", () => {
  it("uses request headers and returns the signed-in user", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    getSession.mockResolvedValue({ user });

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(headers).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("returns null when no authenticated session exists", async () => {
    getSession.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("propagates authentication lookup errors", async () => {
    const failure = new Error("session store unavailable");
    getSession.mockRejectedValue(failure);
    await expect(getCurrentUser()).rejects.toBe(failure);
  });
});

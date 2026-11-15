import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, prisma } = vi.hoisted(() => {
  const planGrant = {
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  return {
    auth: {
      getCurrentUser: vi.fn(),
      isAdminEmail: vi.fn(),
    },
    prisma: {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      planGrant,
      $transaction: vi.fn(async (callback: (transaction: { planGrant: typeof planGrant }) => unknown) =>
        callback({ planGrant }),
      ),
    },
  };
});

vi.mock("@/lib/auth-session", () => auth);
vi.mock("@/lib/prisma", () => ({ prisma }));

import { GET, POST } from "../../src/app/api/admin/users/route";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  emailVerified: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue(admin);
  auth.isAdminEmail.mockReturnValue(true);
  prisma.user.findMany.mockResolvedValue([]);
  prisma.user.findUnique.mockResolvedValue({ id: "target-1" });
  prisma.planGrant.updateMany.mockResolvedValue({ count: 1 });
  prisma.planGrant.create.mockResolvedValue({ id: "grant-1" });
  prisma.$transaction.mockImplementation(
    async (callback: (transaction: { planGrant: typeof prisma.planGrant }) => unknown) =>
      callback({ planGrant: prisma.planGrant }),
  );
});

describe("admin users API", () => {
  it("denies unauthenticated and non-admin users", async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET();
    expect(unauthenticated.status).toBe(403);

    auth.isAdminEmail.mockReturnValueOnce(false);
    const forbidden = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ userId: "target-1", plan: "free" }),
    }));
    expect(forbidden.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("lists users with normalized active plan and latest grant", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: "one",
        name: "One",
        email: "one@example.com",
        createdAt: new Date("2026-01-01"),
        planGrants: [{ id: "grant-one", note: "manual", createdAt: new Date("2026-01-02") }],
      },
      {
        id: "two",
        name: "Two",
        email: "two@example.com",
        createdAt: new Date("2026-01-01"),
        planGrants: [],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject([
      { id: "one", plan: "pro", grant: { id: "grant-one", note: "manual" } },
      { id: "two", plan: "free", grant: null },
    ]);
  });

  it("rejects malformed JSON and invalid plan payloads", async () => {
    const malformed = await POST(new Request("http://localhost", {
      method: "POST",
      body: "{",
    }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "O corpo JSON é inválido." });

    for (const payload of [
      null,
      {},
      { userId: 1, plan: "pro" },
      { userId: "target-1", plan: "enterprise" },
      { userId: "target-1", plan: "free", note: 123 },
    ]) {
      const response = await POST(new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(payload),
      }));
      expect(response.status).toBe(400);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ userId: "missing", plan: "pro" }),
    }));

    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("grants Pro transactionally and trims and limits the audit note", async () => {
    const note = ` ${"x".repeat(510)} `;
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ userId: "target-1", plan: "pro", note }),
    }));

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.planGrant.updateMany).toHaveBeenCalledWith({
      where: { userId: "target-1", plan: "pro", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.planGrant.create).toHaveBeenCalledWith({
      data: {
        userId: "target-1",
        grantedBy: "admin-1",
        note: "x".repeat(500),
      },
    });
    await expect(response.json()).resolves.toEqual({ userId: "target-1", plan: "pro" });
  });

  it("revokes Pro directly and accepts omitted grant notes", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ userId: "target-1", plan: "free" }),
    }));

    expect(response.status).toBe(200);
    expect(prisma.planGrant.updateMany).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.planGrant.create).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ userId: "target-1", plan: "free" });
  });
});

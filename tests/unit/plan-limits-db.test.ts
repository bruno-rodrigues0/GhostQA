import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, transaction } = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    planGrant: { findFirst: vi.fn() },
    auditRun: { count: vi.fn(), create: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      planGrant: { findFirst: vi.fn() },
      auditRun: { count: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    },
  };
});

vi.mock("../../src/lib/prisma", () => ({ prisma }));

import {
  createUserRunWithinLimit,
  getUserMonthlyUsage,
  getUserPlan,
  MonthlySessionLimitError,
  PlanCapabilityError,
} from "../../src/lib/plan-limits";
import type { Session } from "../../src/lib/types";

function makeSession(viewport: Session["viewport"] = "desktop"): Session {
  return {
    id: "run-1",
    targetUrl: "https://example.com",
    objective: "Concluir uma tarefa",
    plan: "free",
    viewport,
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

beforeEach(() => {
  vi.resetAllMocks();
  prisma.planGrant.findFirst.mockResolvedValue(null);
  prisma.auditRun.count.mockResolvedValue(0);
  transaction.$queryRaw.mockResolvedValue([]);
  transaction.planGrant.findFirst.mockResolvedValue(null);
  transaction.auditRun.count.mockResolvedValue(0);
  transaction.auditRun.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  );
});

describe("database-backed plan limits", () => {
  it("uses an active grant to resolve Pro and otherwise defaults to Free", async () => {
    expect(await getUserPlan("user-1")).toBe("free");
    prisma.planGrant.findFirst.mockResolvedValueOnce({ id: "grant-1" });
    expect(await getUserPlan("user-1")).toBe("pro");
  });

  it("returns plan usage and the UTC calendar month count", async () => {
    prisma.planGrant.findFirst.mockResolvedValue({ id: "grant-1" });
    prisma.auditRun.count.mockResolvedValue(7);

    await expect(
      getUserMonthlyUsage("user-1", new Date("2026-11-15T12:00:00.000Z")),
    ).resolves.toEqual({ plan: "pro", used: 7, limit: 100 });
    expect(prisma.auditRun.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        createdAt: {
          gte: new Date("2026-11-01T00:00:00.000Z"),
          lt: new Date("2026-12-01T00:00:00.000Z"),
        },
      },
    });
  });

  it("locks a user, applies active plan capabilities, and persists the owned run", async () => {
    transaction.planGrant.findFirst.mockResolvedValue({ id: "grant-1" });
    transaction.auditRun.count.mockResolvedValue(8);
    const session = makeSession();

    const created = await createUserRunWithinLimit("user-1", session);

    expect(created).toMatchObject({ ...session, ownerId: "user-1", plan: "pro" });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.planGrant.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", plan: "pro", revokedAt: null },
      select: { id: true },
    });
    expect(transaction.auditRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "run-1",
        userId: "user-1",
        plan: "pro",
        data: expect.objectContaining({ ownerId: "user-1", plan: "pro" }),
      }),
    });
  });

  it("rejects unsupported Free capabilities before reading quotas", async () => {
    await expect(
      createUserRunWithinLimit("user-1", makeSession("mobile")),
    ).rejects.toBeInstanceOf(PlanCapabilityError);
    expect(transaction.auditRun.count).not.toHaveBeenCalled();
    expect(transaction.auditRun.create).not.toHaveBeenCalled();
  });

  it("rejects runs at the monthly quota and does not persist them", async () => {
    transaction.auditRun.count.mockResolvedValue(5);

    await expect(
      createUserRunWithinLimit("user-1", makeSession()),
    ).rejects.toBeInstanceOf(MonthlySessionLimitError);
    expect(transaction.auditRun.create).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditRun } = vi.hoisted(() => ({
  auditRun: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: { auditRun } }));

import { createPrismaRunStore } from "../../src/lib/run-store";
import type { Session } from "../../src/lib/types";

const id = "e607b668-fca3-4f4f-9b99-80a3cc74f410";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id,
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  auditRun.findFirst.mockResolvedValue(null);
  auditRun.findMany.mockResolvedValue([]);
  auditRun.update.mockResolvedValue({});
  auditRun.create.mockResolvedValue({});
});

describe("Prisma run store", () => {
  it("requires a valid ID and owner for lookups and lists", async () => {
    const store = createPrismaRunStore();

    await expect(store.get("bad", "owner-1")).rejects.toThrow(
      "O identificador da sessão é inválido.",
    );
    await expect(store.get(id)).rejects.toThrow(
      "É necessário informar o proprietário da auditoria.",
    );
    await expect(store.list(10)).rejects.toThrow(
      "É necessário informar o proprietário da auditoria.",
    );
    for (const limit of [0, 101, 2.5]) {
      await expect(store.list(limit, "owner-1")).rejects.toThrow(
        "O limite de sessões precisa ser um inteiro entre 1 e 100.",
      );
    }
    expect(auditRun.findFirst).not.toHaveBeenCalled();
  });

  it("loads an owned session and returns undefined for missing records", async () => {
    const store = createPrismaRunStore();
    await expect(store.get(id, "owner-1")).resolves.toBeUndefined();
    expect(auditRun.findFirst).toHaveBeenCalledWith({
      where: { id, userId: "owner-1" },
      select: { data: true },
    });

    const value = session();
    auditRun.findFirst.mockResolvedValueOnce({ data: value });
    await expect(store.get(id, "owner-1")).resolves.toEqual(value);
  });

  it("rejects malformed or invalid stored Prisma records", async () => {
    const store = createPrismaRunStore();
    auditRun.findFirst
      .mockResolvedValueOnce({ data: { id } })
      .mockResolvedValueOnce({ data: { ...session(), id: "another-id" } });

    await expect(store.get(id, "owner-1")).rejects.toThrow(
      `O arquivo da sessão ${id} contém dados inválidos.`,
    );
    await expect(store.get(id, "owner-1")).rejects.toThrow(
      `O arquivo da sessão ${id} contém dados inválidos.`,
    );
  });

  it("lists owner records newest first and validates each stored session", async () => {
    const store = createPrismaRunStore();
    const first = session({ id });
    const secondId = "3c9f4cec-3a65-4bb3-8000-038561d1ec10";
    const second = session({ id: secondId });
    auditRun.findMany.mockResolvedValue([
      { id, data: first },
      { id: secondId, data: second },
    ]);

    await expect(store.list(25, "owner-1")).resolves.toEqual([first, second]);
    expect(auditRun.findMany).toHaveBeenCalledWith({
      where: { userId: "owner-1" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { data: true, id: true },
    });

    auditRun.findMany.mockResolvedValueOnce([{ id, data: { id } }]);
    await expect(store.list(1, "owner-1")).rejects.toThrow(
      `O arquivo da sessão ${id} contém dados inválidos.`,
    );
  });

  it("updates an existing record using the supplied owner", async () => {
    const store = createPrismaRunStore();
    const current = session();
    auditRun.findFirst.mockResolvedValue({ id: "record-1" });

    await store.save(current, "owner-2");

    expect(auditRun.findFirst).toHaveBeenCalledWith({
      where: { id, userId: "owner-2" },
      select: { id: true },
    });
    expect(auditRun.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: expect.objectContaining({
        plan: "free",
        createdAt: new Date(current.createdAt),
        updatedAt: new Date(current.updatedAt),
        data: expect.objectContaining({ id }),
      }),
    });
    expect(auditRun.create).not.toHaveBeenCalled();
  });

  it("creates a new record using the session owner and rejects ownerless writes", async () => {
    const store = createPrismaRunStore();
    const current = session();

    await store.save(current);

    expect(auditRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id,
        userId: "owner-1",
        plan: "free",
      }),
    });

    await expect(store.save(session({ ownerId: undefined }))).rejects.toThrow(
      "É necessário informar o proprietário da auditoria.",
    );
  });
});

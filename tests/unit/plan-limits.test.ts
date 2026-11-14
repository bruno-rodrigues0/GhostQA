import { describe, expect, it } from "vitest";
import {
  assertMonthlySessionAvailable,
  assertPlanCapabilities,
  getMonthlySessionCount,
  hideFreeTechnicalLogs,
  MonthlySessionLimitError,
} from "../../src/lib/plan-limits";
import type { Session } from "../../src/lib/types";

function makeSession(id: string, createdAt: string, plan: Session["plan"] = "free"): Session {
  return {
    id,
    targetUrl: "https://example.com",
    objective: "Concluir uma tarefa",
    plan,
    viewport: "desktop",
    personas: [],
    status: "failed",
    steps: [],
    techLogs: [
      {
        id: `log-${id}`,
        type: "console",
        message: "Erro de console",
        createdAt,
      },
    ],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: "Falha de teste",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("plan limits", () => {
  it("counts every session started in the current UTC month, including failed runs", () => {
    const sessions = [
      makeSession("1", "2026-11-01T00:00:00.000Z"),
      makeSession("2", "2026-11-14T18:00:00.000Z", "pro"),
      makeSession("3", "2026-10-31T23:59:59.999Z"),
      makeSession("4", "2026-12-01T00:00:00.000Z"),
    ];

    expect(getMonthlySessionCount(sessions, new Date("2026-11-14T18:00:00.000Z"))).toBe(2);
  });

  it("throws a typed quota error at the exact monthly plan limit", () => {
    const now = new Date("2026-11-14T18:00:00.000Z");
    const freeSessions = Array.from({ length: 5 }, (_, index) =>
      makeSession(
        `free-${index}`,
        `2026-11-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      ),
    );
    const proSessions = Array.from({ length: 100 }, (_, index) =>
      makeSession(
        `pro-${index}`,
        `2026-11-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        "pro",
      ),
    );

    expect(() => assertMonthlySessionAvailable("free", freeSessions, now)).toThrow(
      MonthlySessionLimitError,
    );
    expect(() => assertMonthlySessionAvailable("pro", proSessions, now)).toThrow(
      MonthlySessionLimitError,
    );
    expect(() => assertMonthlySessionAvailable("pro", freeSessions, now)).not.toThrow();
  });

  it("withholds technical logs from Free sessions in API responses", () => {
    const freeSession = makeSession("free", "2026-11-14T18:00:00.000Z");
    const proSession = makeSession("pro", "2026-11-14T18:00:00.000Z", "pro");

    expect(hideFreeTechnicalLogs(freeSession).techLogs).toEqual([]);
    expect(hideFreeTechnicalLogs(proSession).techLogs).toHaveLength(1);
    expect(freeSession.techLogs).toHaveLength(1);
  });

  it("keeps plan ownership fields private and rejects Free-only capability bypasses", () => {
    const ownedSession = {
      ...makeSession("owned", "2026-11-14T18:00:00.000Z"),
      ownerId: "private-user-id",
    };
    expect(hideFreeTechnicalLogs(ownedSession)).not.toHaveProperty("ownerId");
    expect(() =>
      assertPlanCapabilities("free", "mobile", []),
    ).toThrow("O viewport Mobile está disponível somente no plano Pro.");
    expect(() =>
      assertPlanCapabilities("free", "desktop", [
        {
          id: "custom",
          name: "Customizada",
          description: "Perfil personalizado.",
        },
      ]),
    ).toThrow("O plano Free permite somente personas padrão.");
  });
});

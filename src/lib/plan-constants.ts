import { DEFAULT_PERSONAS } from "./personas";
import type { Plan, Session } from "./types";

export const PLAN_LIMITS = {
  free: {
    monthlySessions: 5,
    personas: 1,
    steps: 5,
  },
  pro: {
    monthlySessions: 100,
    personas: 3,
    steps: 12,
  },
} as const;

export class MonthlySessionLimitError extends Error {
  constructor(
    readonly plan: Plan,
    readonly used: number,
    readonly limit: number,
  ) {
    super(
      `O plano ${plan === "free" ? "Free" : "Pro"} atingiu o limite mensal de ${limit} sessões.`,
    );
    this.name = "MonthlySessionLimitError";
  }
}

export class PlanCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanCapabilityError";
  }
}

export function assertPlanCapabilities(
  plan: Plan,
  viewport: Session["viewport"],
  personas: Session["personas"],
): void {
  if (personas.length > PLAN_LIMITS[plan].personas) {
    throw new PlanCapabilityError(
      `O plano ${plan === "free" ? "Free" : "Pro"} permite até ${PLAN_LIMITS[plan].personas} persona(s) por missão.`,
    );
  }
  if (plan === "free" && viewport === "mobile") {
    throw new PlanCapabilityError(
      "O viewport Mobile está disponível somente no plano Pro.",
    );
  }
  if (
    plan === "free" &&
    personas.some(
      (selected) =>
        !DEFAULT_PERSONAS.some(
          (persona) =>
            persona.id === selected.id &&
            persona.name === selected.name &&
            persona.description === selected.description &&
            persona.technicalLevel === selected.technicalLevel &&
            selected.age === undefined &&
            selected.context === undefined,
        ),
    )
  ) {
    throw new PlanCapabilityError("O plano Free permite somente personas padrão.");
  }
}

export function getMonthlySessionCount(
  sessions: Session[],
  now = new Date(),
): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  return sessions.filter((session) => {
    const createdAt = Date.parse(session.createdAt);
    return createdAt >= monthStart && createdAt < nextMonthStart;
  }).length;
}

export function assertMonthlySessionAvailable(
  plan: Plan,
  sessions: Session[],
  now = new Date(),
): void {
  const used = getMonthlySessionCount(sessions, now);
  const limit = PLAN_LIMITS[plan].monthlySessions;
  if (used >= limit) {
    throw new MonthlySessionLimitError(plan, used, limit);
  }
}

export function hideFreeTechnicalLogs(session: Session): Session {
  const publicSession = { ...session };
  delete publicSession.ownerId;
  return session.plan === "free"
    ? { ...publicSession, techLogs: [] }
    : publicSession;
}

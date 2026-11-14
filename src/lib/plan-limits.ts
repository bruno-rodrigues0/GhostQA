import type { Plan, Session } from "./types";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  assertPlanCapabilities,
  MonthlySessionLimitError,
  PLAN_LIMITS,
} from "./plan-constants";
export {
  assertMonthlySessionAvailable,
  assertPlanCapabilities,
  getMonthlySessionCount,
  hideFreeTechnicalLogs,
  MonthlySessionLimitError,
  PlanCapabilityError,
  PLAN_LIMITS,
} from "./plan-constants";

export async function getUserPlan(userId: string): Promise<Plan> {
  const activeGrant = await prisma.planGrant.findFirst({
    where: { userId, plan: "pro", revokedAt: null },
    select: { id: true },
  });
  return activeGrant ? "pro" : "free";
}

export async function getUserMonthlyUsage(userId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [plan, used] = await Promise.all([
    getUserPlan(userId),
    prisma.auditRun.count({
      where: { userId, createdAt: { gte: start, lt: end } },
    }),
  ]);
  return { plan, used, limit: PLAN_LIMITS[plan].monthlySessions };
}

export async function createUserRunWithinLimit(
  userId: string,
  session: Session,
): Promise<Session> {
  const start = new Date(
    Date.UTC(
      new Date(session.createdAt).getUTCFullYear(),
      new Date(session.createdAt).getUTCMonth(),
      1,
    ),
  );
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const activeGrant = await transaction.planGrant.findFirst({
      where: { userId, plan: "pro", revokedAt: null },
      select: { id: true },
    });
    const plan: Plan = activeGrant ? "pro" : "free";
    assertPlanCapabilities(plan, session.viewport, session.personas);
    const used = await transaction.auditRun.count({
      where: { userId, createdAt: { gte: start, lt: end } },
    });
    const limit = PLAN_LIMITS[plan].monthlySessions;
    if (used >= limit) {
      throw new MonthlySessionLimitError(plan, used, limit);
    }

    const ownedSession = { ...session, ownerId: userId, plan };
    await transaction.auditRun.create({
      data: {
        id: ownedSession.id,
        userId,
        plan,
        createdAt: new Date(ownedSession.createdAt),
        updatedAt: new Date(ownedSession.updatedAt),
        data: JSON.parse(JSON.stringify(ownedSession)) as Prisma.InputJsonValue,
      },
    });
    return ownedSession;
  });
}

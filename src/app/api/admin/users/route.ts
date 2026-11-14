import { NextResponse } from "next/server";
import { getCurrentUser, isAdminEmail } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      planGrants: {
        where: { plan: "pro", revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, note: true, createdAt: true },
      },
    },
  });
  return NextResponse.json(
    users.map(({ planGrants, ...user }) => ({
      ...user,
      plan: planGrants.length ? "pro" : "free",
      grant: planGrants[0] ?? null,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ error: "O corpo JSON é inválido." }, { status: 400 });
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("userId" in value) ||
    typeof value.userId !== "string" ||
    !("plan" in value) ||
    (value.plan !== "free" && value.plan !== "pro") ||
    ("note" in value && value.note !== undefined && typeof value.note !== "string")
  ) {
    return NextResponse.json({ error: "Os dados do plano são inválidos." }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: value.userId },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "A conta não foi encontrada." }, { status: 404 });
  }

  if (value.plan === "pro") {
    await prisma.$transaction(async (transaction) => {
      await transaction.planGrant.updateMany({
        where: { userId: targetUser.id, plan: "pro", revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.planGrant.create({
        data: {
          userId: targetUser.id,
          grantedBy: admin.id,
          note: "note" in value && typeof value.note === "string" ? value.note.trim().slice(0, 500) : null,
        },
      });
    });
  } else {
    await prisma.planGrant.updateMany({
      where: { userId: targetUser.id, plan: "pro", revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return NextResponse.json({ userId: targetUser.id, plan: value.plan });
}

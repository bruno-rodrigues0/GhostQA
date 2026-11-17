import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { getUserMonthlyUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }
  try {
    const account = await getUserMonthlyUsage(user.id);
    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email }, ...account },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(`[Bunter] Não foi possível consultar a conta ${user.id}.`, error);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados da conta." },
      { status: 500 },
    );
  }
}

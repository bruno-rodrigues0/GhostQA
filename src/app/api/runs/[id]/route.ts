import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { hideFreeTechnicalLogs } from "@/lib/plan-limits";
import { runStore } from "@/lib/run-store";

export const runtime = "nodejs";

interface RunRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RunRouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }
  try {
    const session = await runStore.get(id, user.id);
    if (!session) {
      return NextResponse.json(
        { error: "A sessão solicitada não foi encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(hideFreeTechnicalLogs(session), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const isInvalidId =
      error instanceof Error &&
      error.message === "O identificador da sessão é inválido.";
    if (isInvalidId) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`[GhostQA] Não foi possível carregar a sessão ${id}.`, error);
    return NextResponse.json(
      { error: "Não foi possível carregar a sessão de auditoria." },
      { status: 500 },
    );
  }
}

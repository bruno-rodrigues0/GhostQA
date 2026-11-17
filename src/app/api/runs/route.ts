import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { getConfiguredOpenRouterModel } from "@/lib/ghost-decision";
import { parseCreateRunInput } from "@/lib/run-input";
import { createOpenRouterClient } from "@/lib/openrouter";
import {
  claimRunExecution,
  executeClaimedRun,
  releaseRunExecution,
} from "@/lib/run-execution";
import {
  createUserRunWithinLimit,
  hideFreeTechnicalLogs,
  MonthlySessionLimitError,
  PlanCapabilityError,
  getUserPlan,
} from "@/lib/plan-limits";
import { runStore } from "@/lib/run-store";
import type { CreateRunInput } from "@/lib/run-input";
import type { Session } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }
  try {
    const sessions = await runStore.list(100, user.id);
    return NextResponse.json(sessions.map(hideFreeTechnicalLogs), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Bunter] Não foi possível carregar o histórico de sessões.", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico de auditorias." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }
  let plan: "free" | "pro";
  try {
    plan = await getUserPlan(user.id);
  } catch (error) {
    console.error(`[Bunter] Não foi possível consultar o plano da conta ${user.id}.`, error);
    return NextResponse.json({ error: "Não foi possível validar o plano da conta." }, { status: 500 });
  }

  let input: CreateRunInput;
  try {
    input = parseCreateRunInput(await request.json(), plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "O corpo da requisição não pôde ser validado.",
      },
      { status: 400 },
    );
  }

  let model: string;
  let client: ReturnType<typeof createOpenRouterClient>;
  try {
    model = getConfiguredOpenRouterModel();
    client = createOpenRouterClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "A configuração do OpenRouter está incompleta.",
      },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  let session: Session = {
    id: randomUUID(),
    ownerId: user.id,
    targetUrl: input.targetUrl,
    objective: input.objective,
    plan,
    viewport: input.viewport,
    personas: input.personas,
    status: "pending",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    session = await createUserRunWithinLimit(user.id, session);
  } catch (error) {
    if (error instanceof PlanCapabilityError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MonthlySessionLimitError) {
      return NextResponse.json(
        {
          code: "MONTHLY_LIMIT_REACHED",
          error: error.message,
          used: error.used,
          limit: error.limit,
        },
        { status: 429 },
      );
    }
    releaseRunExecution(session.id);
    console.error("[Bunter] Não foi possível iniciar a sessão.", error);
    return NextResponse.json(
      { error: "Não foi possível iniciar a sessão de auditoria." },
      { status: 500 },
    );
  }

  if (!claimRunExecution(session.id)) {
    return NextResponse.json(
      { error: "Não foi possível reservar a execução da sessão." },
      { status: 500 },
    );
  }

  try {
    after(() => executeClaimedRun(session, { client, model }));
  } catch (error) {
    releaseRunExecution(session.id);
    console.error(
      `[Bunter] Não foi possível agendar a execução da sessão ${session.id}.`,
      error,
    );
    try {
      await runStore.save({
        ...session,
        status: "failed",
        errorMessage: "Não foi possível agendar a execução da auditoria.",
        updatedAt: new Date().toISOString(),
      });
    } catch (saveError) {
      console.error(
        `[Bunter] Não foi possível registrar a falha de agendamento da sessão ${session.id}.`,
        saveError,
      );
    }
    return NextResponse.json(
      { error: "Não foi possível agendar a execução da auditoria." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: session.id, status: session.status, createdAt: session.createdAt },
    { status: 202 },
  );
}

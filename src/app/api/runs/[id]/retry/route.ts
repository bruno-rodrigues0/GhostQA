import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { getConfiguredOpenRouterModel } from "@/lib/ghost-decision";
import { createOpenRouterClient } from "@/lib/openrouter";
import {
  claimRunExecution,
  executeClaimedRun,
  prepareSessionRetry,
  releaseRunExecution,
} from "@/lib/run-execution";
import { runStore } from "@/lib/run-store";
import type { Session } from "@/lib/types";

export const runtime = "nodejs";

interface RetryRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: Request,
  context: RetryRouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }

  let session: Session | undefined;
  try {
    session = await runStore.get(id, user.id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "O identificador da sessão é inválido."
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(`[Bunter] Não foi possível consultar a sessão ${id} para repetir.`, error);
    return NextResponse.json(
      { error: "Não foi possível carregar a sessão para repetir a auditoria." },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "A sessão solicitada não foi encontrada." },
      { status: 404 },
    );
  }

  if (session.status !== "failed" && session.status !== "completed") {
    return NextResponse.json(
      {
        code: "RUN_NOT_RETRYABLE",
        error: "Só é possível repetir uma auditoria concluída ou com falha.",
        status: session.status,
      },
      { status: 409 },
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

  if (!claimRunExecution(id)) {
    return NextResponse.json(
      {
        code: "RUN_ALREADY_ACTIVE",
        error: "Esta auditoria já está sendo executada.",
      },
      { status: 409 },
    );
  }

  const retriedSession = prepareSessionRetry(session);
  try {
    await runStore.save(retriedSession, user.id);
  } catch (error) {
    releaseRunExecution(id);
    console.error(`[Bunter] Não foi possível preparar a sessão ${id} para repetir.`, error);
    return NextResponse.json(
      { error: "Não foi possível preparar a auditoria para uma nova execução." },
      { status: 500 },
    );
  }

  try {
    after(() => executeClaimedRun(retriedSession, { client, model }));
  } catch (error) {
    releaseRunExecution(id);
    console.error(
      `[Bunter] Não foi possível agendar a repetição da sessão ${id}.`,
      error,
    );
    try {
      await runStore.save({
        ...retriedSession,
        status: "failed",
        errorMessage: "Não foi possível agendar a repetição da auditoria.",
        updatedAt: new Date().toISOString(),
      }, user.id);
    } catch (saveError) {
      console.error(
        `[Bunter] Não foi possível registrar a falha de agendamento da sessão ${id}.`,
        saveError,
      );
    }
    return NextResponse.json(
      { error: "Não foi possível agendar a repetição da auditoria." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      id: retriedSession.id,
      status: retriedSession.status,
      updatedAt: retriedSession.updatedAt,
    },
    { status: 202 },
  );
}

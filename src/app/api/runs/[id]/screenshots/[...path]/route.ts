import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { runStore } from "@/lib/run-store";

export const runtime = "nodejs";

interface ScreenshotRouteContext {
  params: Promise<{ id: string; path: string[] }>;
}

export async function GET(
  _request: Request,
  context: ScreenshotRouteContext,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "É necessário entrar na sua conta." }, { status: 401 });
  }
  const { id, path: requestedPath } = await context.params;
  const session = await runStore.get(id, user.id);
  if (!session) {
    return NextResponse.json({ error: "A auditoria não foi encontrada." }, { status: 404 });
  }
  if (
    requestedPath.length !== 2 ||
    !/^[\w-]{1,128}$/.test(requestedPath[0] ?? "") ||
    !/^[\w.-]{1,180}\.png$/.test(requestedPath[1] ?? "") ||
    !session.personas.some(({ id: personaId }) => personaId === requestedPath[0])
  ) {
    return NextResponse.json({ error: "O caminho da screenshot é inválido." }, { status: 400 });
  }

  const [personaId, filename] = requestedPath;
  if (!personaId || !filename) {
    return NextResponse.json({ error: "O caminho da screenshot é inválido." }, { status: 400 });
  }
  const root = path.join(process.cwd(), "data", "private-runs", id, personaId);
  try {
    const image = await readFile(path.join(root, filename));
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return NextResponse.json({ error: "A screenshot não foi encontrada." }, { status: 404 });
    }
    console.error(`[Bunter] Não foi possível servir screenshot da auditoria ${id}.`, error);
    return NextResponse.json({ error: "Não foi possível carregar a screenshot." }, { status: 500 });
  }
}

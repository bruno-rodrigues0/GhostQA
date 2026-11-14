import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

function handlers() {
  return toNextJsHandler(getAuth());
}

export async function GET(request: Request): Promise<Response> {
  return handlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return handlers().POST(request);
}

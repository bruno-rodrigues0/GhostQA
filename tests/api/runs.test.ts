import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/auth-session", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("../../src/lib/plan-limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/plan-limits")>();
  return {
    ...actual,
    createUserRunWithinLimit: vi.fn(),
    getUserPlan: vi.fn(),
  };
});

import { getCurrentUser } from "../../src/lib/auth-session";
import {
  createUserRunWithinLimit,
  getUserPlan,
  MonthlySessionLimitError,
} from "../../src/lib/plan-limits";
import { GET as getRun } from "../../src/app/api/runs/[id]/route";
import { POST } from "../../src/app/api/runs/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  vi.mocked(getUserPlan).mockResolvedValue("free");
  vi.mocked(createUserRunWithinLimit).mockImplementation(
    async (userId, session) => ({ ...session, ownerId: userId }),
  );
});

describe("runs API routes", () => {
  it("returns a validation error for an invalid mission request", async () => {
    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: "file:///etc/passwd" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "O objetivo precisa ser um texto de 1 a 2000 caracteres.",
    });
  });

  it("rejects malformed run IDs without accessing session storage", async () => {
    const response = await getRun(new Request("http://localhost"), {
      params: Promise.resolve({ id: "../secrets" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "O identificador da sessão é inválido.",
    });
  });

  it("returns not found for a valid but unknown run ID", async () => {
    const getSpy = vi.spyOn((await import("../../src/lib/run-store")).runStore, "get").mockResolvedValue(undefined);
    const response = await getRun(new Request("http://localhost"), {
      params: Promise.resolve({ id: randomUUID() }),
    });

    expect(response.status).toBe(404);
    expect(getSpy).toHaveBeenCalledWith(expect.any(String), "user-1");
  });

  it("requires authentication before listing private audits", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await (await import("../../src/app/api/runs/route")).GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "É necessário entrar na sua conta.",
    });
  });

  it("reports missing OpenRouter configuration before creating a run", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl: "https://example.com",
          objective: "Navegar pela página inicial",
          personas: [
            {
              id: "apressado",
              name: "O Apressado",
              description:
                "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
              technicalLevel: "medium",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "A variável OPENROUTER_MODEL não está configurada.",
    });
  });

  it("blocks Free runs when the monthly session allowance is exhausted", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-key");
    const limitError = new MonthlySessionLimitError("free", 5, 5);
    vi.mocked(createUserRunWithinLimit).mockRejectedValue(limitError);

    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl: "https://example.com",
          objective: "Concluir a tarefa",
          personas: [
            {
              id: "apressado",
              name: "O Apressado",
              description:
                "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
              technicalLevel: "medium",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "MONTHLY_LIMIT_REACHED",
      used: 5,
      limit: 5,
    });
    expect(createUserRunWithinLimit).toHaveBeenCalledOnce();
  });
});

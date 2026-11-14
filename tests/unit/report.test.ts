import { describe, expect, it } from "vitest";
import {
  createMarkdownReport,
  getPrioritizedSteps,
  getSessionStatusLabel,
} from "../../src/lib/report";
import type { Session, Step } from "../../src/lib/types";

function makeStep(
  id: string,
  severity: Step["severity"],
  order: number,
  uxProblem: string | null = `Problema ${id}`,
): Step {
  return {
    id,
    personaId: "apressado",
    order,
    thought: `Pensamento ${id}`,
    frustrationLevel: 3,
    action: "click",
    elementId: 1,
    typedText: null,
    uxProblem,
    severity,
    annotatedScreenshotPath: null,
    cleanScreenshotPath: null,
    createdAt: "2026-11-14T00:00:00.000Z",
  };
}

function makeSession(): Session {
  return {
    id: "e607b668-fca3-4f4f-9b99-80a3cc74f410",
    targetUrl: "https://example.com/signup",
    objective: "Criar uma conta",
    plan: "pro",
    viewport: "desktop",
    personas: [
      {
        id: "apressado",
        name: "O Apressado",
        description: "Quer concluir rapidamente.",
      },
    ],
    status: "completed",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: "completed",
    recommendations: [],
    errorMessage: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
}

describe("UX report helpers", () => {
  it("prioritizes UX findings by severity then step order", () => {
    const steps = [
      makeStep("low", "low", 1),
      makeStep("high-late", "high", 3),
      makeStep("medium", "medium", 2),
      makeStep("high-early", "high", 1),
      makeStep("none", "none", 0),
      makeStep("no-problem", "high", 0, null),
    ];

    expect(getPrioritizedSteps(steps).map(({ id }) => id)).toEqual([
      "high-early",
      "high-late",
      "medium",
      "low",
    ]);
  });

  it("labels completed mission outcomes", () => {
    const session = makeSession();
    expect(getSessionStatusLabel(session)).toBe("Concluída");
    session.missionStatus = "abandoned";
    expect(getSessionStatusLabel(session)).toBe("Abandonada");
  });

  it("formats an in-progress Markdown report without a misleading score suffix", () => {
    const session = makeSession();
    session.status = "running";

    const report = createMarkdownReport(session);

    expect(report).toContain("- **Score de fricção:** Em andamento");
    expect(report).not.toContain("Em andamento/100");
    expect(report).toContain("## Plano de ação UX");
    expect(report).toContain("## Raio-X técnico");
  });
});

import { describe, expect, it } from "vitest";
import {
  createMarkdownReport,
  getPrioritizedSteps,
  getSeverityLabel,
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
  it("labels every issue severity", () => {
    expect(getSeverityLabel("high")).toBe("Alta");
    expect(getSeverityLabel("medium")).toBe("Média");
    expect(getSeverityLabel("low")).toBe("Baixa");
    expect(getSeverityLabel("none")).toBe("Sem alerta");
  });

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
    session.status = "failed";
    expect(getSessionStatusLabel(session)).toBe("Falha na execução");
    session.status = "pending";
    expect(getSessionStatusLabel(session)).toBe("Na fila");
    session.status = "running";
    expect(getSessionStatusLabel(session)).toBe("Agente navegando");
    session.status = "completed";
    session.missionStatus = "abandoned";
    expect(getSessionStatusLabel(session)).toBe("Abandonada");
    session.missionStatus = "blocked";
    expect(getSessionStatusLabel(session)).toBe(
      "Bloqueada por verificação humana",
    );
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

  it("formats mobile reports with findings, recommendations and technical logs", () => {
    const session = makeSession();
    session.viewport = "mobile";
    session.frictionScore = 74;
    session.steps = [
      makeStep("known", "high", 2, "O formulário não explica o erro."),
      {
        ...makeStep("unknown", "low", 3, "Campo sem rótulo."),
        personaId: "removed-persona",
      },
    ];
    session.recommendations = ["Adicionar uma mensagem de validação clara."];
    session.techLogs = [
      {
        id: "http-404",
        type: "http",
        message: "Resposta HTTP 404",
        status: 404,
        url: "https://example.com/missing",
        createdAt: "2026-11-14T00:00:00.000Z",
      },
      {
        id: "console",
        type: "console",
        message: "Aviso sem status nem URL",
        createdAt: "2026-11-14T00:00:00.000Z",
      },
      {
        id: "http-0",
        type: "http",
        message: "Status zero não deve ser exibido",
        status: 0,
        createdAt: "2026-11-14T00:00:00.000Z",
      },
    ];

    const report = createMarkdownReport(session);

    expect(report).toContain("**Dispositivo:** Mobile");
    expect(report).toContain("**Score de fricção:** 74/100");
    expect(report).toContain("### Prioridade Alta — Passo 2");
    expect(report).toContain("**Persona:** O Apressado");
    expect(report).toContain("**Persona:** removed-persona");
    expect(report).toContain("1. Adicionar uma mensagem de validação clara.");
    expect(report).toContain("(HTTP 404) — https://example.com/missing");
    expect(report).toContain("Aviso sem status nem URL");
    expect(report).not.toContain("Status zero não deve ser exibido (HTTP 0)");
  });

  it("reports empty recommendations and technical logs", () => {
    const session = makeSession();
    session.steps = [makeStep("none", "none", 1)];

    const report = createMarkdownReport(session);

    expect(report).toContain("Nenhum problema de UX foi registrado.");
    expect(report).toContain("Nenhuma recomendação disponível.");
    expect(report).toContain("Nenhum erro técnico foi capturado.");
  });

});

import type { Session, Step } from "./types";

const severityOrder = { high: 0, medium: 1, low: 2, none: 3 } as const;

export function getSeverityLabel(severity: Step["severity"]): string {
  switch (severity) {
    case "high":
      return "Alta";
    case "medium":
      return "Média";
    case "low":
      return "Baixa";
    case "none":
      return "Sem alerta";
  }
}

export function getSessionStatusLabel(session: Session): string {
  if (session.status === "failed") {
    return "Falha na execução";
  }
  if (session.status === "pending") {
    return "Na fila";
  }
  if (session.status === "running") {
    return "Agente navegando";
  }
  return session.missionStatus === "completed" ? "Concluída" : "Abandonada";
}

export function getPrioritizedSteps(steps: Step[]): Step[] {
  return steps
    .filter((step) => step.uxProblem && step.severity !== "none")
    .slice()
    .sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity] ||
        left.order - right.order,
    );
}

export function createMarkdownReport(session: Session): string {
  const actionPlan = getPrioritizedSteps(session.steps);
  const personas = session.personas.map(({ name }) => name).join(", ");
  const lines = [
    "# Relatório de Auditoria UX — GhostQA",
    "",
    `- **URL:** ${session.targetUrl}`,
    `- **Objetivo:** ${session.objective}`,
    `- **Dispositivo:** ${session.viewport === "desktop" ? "Desktop" : "Mobile"}`,
    `- **Persona(s):** ${personas}`,
    `- **Status:** ${getSessionStatusLabel(session)}`,
    `- **Score de fricção:** ${session.frictionScore === null ? "Em andamento" : `${session.frictionScore}/100`}`,
    `- **Executado em:** ${new Date(session.createdAt).toLocaleString("pt-BR")}`,
    "",
    "## Plano de ação UX",
    "",
  ];

  if (actionPlan.length === 0) {
    lines.push("Nenhum problema de UX foi registrado.", "");
  } else {
    for (const step of actionPlan) {
      lines.push(
        `### Prioridade ${getSeverityLabel(step.severity)} — Passo ${step.order}`,
        "",
        step.uxProblem ?? "",
        "",
        `**Persona:** ${session.personas.find(({ id }) => id === step.personaId)?.name ?? step.personaId}`,
        "",
      );
    }
  }

  lines.push("## Recomendações", "");
  if (session.recommendations.length === 0) {
    lines.push("Nenhuma recomendação disponível.", "");
  } else {
    session.recommendations.forEach((recommendation, index) => {
      lines.push(`${index + 1}. ${recommendation}`);
    });
    lines.push("");
  }

  lines.push("## Raio-X técnico", "");
  if (session.techLogs.length === 0) {
    lines.push("Nenhum erro técnico foi capturado.", "");
  } else {
    for (const log of session.techLogs) {
      lines.push(
        `- **${log.type}** — ${log.message}${log.status ? ` (HTTP ${log.status})` : ""}${log.url ? ` — ${log.url}` : ""}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

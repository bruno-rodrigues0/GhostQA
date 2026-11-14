import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, errors, type Browser } from "playwright";
import { createOpenRouterClient } from "./openrouter";
import { PLAN_LIMITS } from "./plan-limits";
import {
  getConfiguredOpenRouterModel,
  requestPersonaDecision,
  toIssueSeverity,
  type PersonaDecision,
} from "./ghost-decision";
import type { DeviceViewport, Session, Step, TechLog } from "./types";
import {
  SET_OF_MARK_SCRIPT,
  type MarkedElementInfo,
} from "./set-of-mark";

export interface CaptureSetOfMarkOptions {
  url: string;
  sessionId: string;
  stepNumber: number;
  viewport: DeviceViewport;
}

export interface SetOfMarkCapture {
  screenshotPath: string;
  elements: MarkedElementInfo[];
  techLogs: TechLog[];
}

export interface RunGhostSessionOptions {
  client?: ReturnType<typeof createOpenRouterClient>;
  model?: string;
  decide?: (input: {
    screenshot: Uint8Array;
    persona: Session["personas"][number];
    objective: string;
    history: string[];
  }) => Promise<PersonaDecision>;
  onUpdate?: (session: Session) => Promise<void>;
}

const severityPriority = { high: 0, medium: 1, low: 2, none: 3 } as const;

const viewportSizes: Record<DeviceViewport, { width: number; height: number }> =
  {
    desktop: { width: 1280, height: 800 },
    mobile: { width: 390, height: 844 },
  };

function validateOptions(options: CaptureSetOfMarkOptions): URL {
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new Error("A URL da missão precisa ser uma URL absoluta válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("A URL da missão precisa usar HTTP ou HTTPS.");
  }

  if (!/^[\w-]{1,128}$/.test(options.sessionId)) {
    throw new Error("O identificador da sessão contém caracteres inválidos.");
  }

  if (!Number.isInteger(options.stepNumber) || options.stepNumber < 1) {
    throw new Error("O número do passo precisa ser um inteiro positivo.");
  }

  return url;
}

function addTechLog(session: Session, log: TechLog): void {
  session.techLogs.push(log);
  session.updatedAt = new Date().toISOString();
}

function updateFrictionSummary(session: Session): void {
  const frustration = session.steps.map((step) => step.frustrationLevel);
  session.frictionScore = frustration.length
    ? Math.round(
        (frustration.reduce((total, value) => total + value, 0) /
          frustration.length) *
          10,
      )
    : 0;

  const seen = new Set<string>();
  session.recommendations = session.steps
    .filter(
      (step): step is Step & { uxProblem: string } =>
        step.uxProblem !== null && step.severity !== "none",
    )
    .sort(
      (left, right) =>
        severityPriority[left.severity] - severityPriority[right.severity],
    )
    .filter((step) => {
      const problem = step.uxProblem.trim().toLocaleLowerCase("pt-BR");
      if (seen.has(problem)) {
        return false;
      }
      seen.add(problem);
      return true;
    })
    .map(
      (step) =>
        `Prioridade ${step.severity === "high" ? "alta" : step.severity === "medium" ? "média" : "baixa"}: ${step.uxProblem}. Revise o elemento apontado e valide novamente este trecho da jornada.`,
    );
}

async function removeMarksAndDrawActionMarker(
  page: import("playwright").Page,
  elementId: number | null,
): Promise<void> {
  await page.evaluate((targetId) => {
    document
      .querySelectorAll('[data-ghost-overlay="true"], #ghostqa-som-styles')
      .forEach((node) => node.remove());
    document.querySelectorAll('[data-ghost-marked="true"]').forEach((node) => {
      node.removeAttribute("data-ghost-marked");
    });

    if (targetId === null) {
      return;
    }

    const target = document.querySelector<HTMLElement>(
      `[data-ghost-id="${targetId}"]`,
    );
    if (!target) {
      return;
    }

    const bounds = target.getBoundingClientRect();
    const marker = document.createElement("div");
    marker.dataset.ghostActionMarker = "true";
    marker.setAttribute("aria-hidden", "true");
    marker.style.position = "fixed";
    marker.style.zIndex = "2147483647";
    marker.style.pointerEvents = "none";
    marker.style.left = `${bounds.left + bounds.width / 2 - 10}px`;
    marker.style.top = `${bounds.top + bounds.height / 2 - 10}px`;
    marker.style.width = "20px";
    marker.style.height = "20px";
    marker.style.border = "3px solid #ffffff";
    marker.style.borderRadius = "50%";
    marker.style.background = "#ef4444";
    marker.style.boxShadow = "0 0 0 2px #ef4444, 0 1px 5px rgb(0 0 0 / 65%)";
    document.body.append(marker);
  }, elementId);
}

async function clearActionMarker(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll(
        '[data-ghost-overlay="true"], [data-ghost-action-marker="true"]',
      )
      .forEach((node) => node.remove());
    document.querySelectorAll("[data-ghost-id]").forEach((node) => {
      node.removeAttribute("data-ghost-id");
    });
  });
}

function createStep(
  decision: PersonaDecision,
  personaId: string,
  order: number,
  annotatedScreenshotPath: string,
  cleanScreenshotPath: string,
): Step {
  return {
    id: randomUUID(),
    personaId,
    order,
    thought: decision.pensamento_persona,
    frustrationLevel: decision.nivel_frustracao,
    action: decision.acao,
    elementId: decision.elemento_id,
    typedText: decision.texto_digitado,
    uxProblem: decision.problema_ux_encontrado,
    severity: toIssueSeverity(decision.severidade_problema),
    annotatedScreenshotPath,
    cleanScreenshotPath,
    createdAt: new Date().toISOString(),
  };
}

async function applyDecision(
  page: import("playwright").Page,
  decision: PersonaDecision,
  markedElements: MarkedElementInfo[],
  viewport: DeviceViewport,
): Promise<void> {
  if (
    decision.elemento_id !== null &&
    !markedElements.some(({ id }) => id === decision.elemento_id)
  ) {
    throw new Error(
      `O modelo selecionou elemento_id ${decision.elemento_id}, que não existe nesta tela.`,
    );
  }

  switch (decision.acao) {
    case "click":
      await page.locator(`[data-ghost-id="${decision.elemento_id}"]`).click({
        timeout: 5_000,
      });
      break;
    case "type":
      if (decision.texto_digitado === null) {
        throw new Error("A ação type não contém texto para preencher.");
      }
      await page.locator(`[data-ghost-id="${decision.elemento_id}"]`).fill(
        decision.texto_digitado,
        { timeout: 5_000 },
      );
      break;
    case "scroll":
      if (decision.elemento_id !== null) {
        const bounds = await page
          .locator(`[data-ghost-id="${decision.elemento_id}"]`)
          .boundingBox();
        if (bounds) {
          await page.mouse.move(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
        }
      } else {
        const viewportSize = viewportSizes[viewport];
        await page.mouse.move(viewportSize.width / 2, viewportSize.height / 2);
      }
      await page.mouse.wheel(0, 650);
      break;
    case "finish":
    case "give_up":
      break;
  }
}

export async function runGhostSession(
  inputSession: Session,
  options: RunGhostSessionOptions = {},
): Promise<Session> {
  if (inputSession.personas.length === 0) {
    throw new Error("A sessão precisa conter ao menos uma persona.");
  }

  const model = options.decide
    ? options.model
    : getConfiguredOpenRouterModel(options.model);
  const client =
    options.decide === undefined
      ? options.client ?? createOpenRouterClient()
      : options.client;
  const session: Session = {
    ...inputSession,
    status: "running",
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  console.log(
    `[GhostQA] Iniciando missão ${session.id} com ${session.personas.length} persona(s).`,
  );
  let browser: Browser | undefined;

  try {
    await options.onUpdate?.(session);
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });

    let everyPersonaCompleted = true;
    for (const persona of session.personas) {
      const page = await browser.newPage({
        viewport: viewportSizes[session.viewport],
      });
      const sessionIdForPath = session.id;
      const personaIdForPath = persona.id;
      const screenshotDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionIdForPath,
        personaIdForPath,
      );
      await mkdir(screenshotDirectory, { recursive: true });

      page.on("console", (message) => {
        if (message.type() !== "error") {
          return;
        }
        const log: TechLog = {
          id: randomUUID(),
          type: "console",
          message: message.text(),
          createdAt: new Date().toISOString(),
        };
        addTechLog(session, log);
        console.log(`[GhostQA] Erro de console: ${log.message}`);
      });
      page.on("pageerror", (error) => {
        const log: TechLog = {
          id: randomUUID(),
          type: "pageerror",
          message: error.message,
          createdAt: new Date().toISOString(),
        };
        addTechLog(session, log);
        console.log(`[GhostQA] Erro de página: ${log.message}`);
      });
      page.on("response", (response) => {
        if (response.status() < 400) {
          return;
        }
        const log: TechLog = {
          id: randomUUID(),
          type: "http",
          message: `Resposta HTTP ${response.status()}`,
          url: response.url(),
          status: response.status(),
          createdAt: new Date().toISOString(),
        };
        addTechLog(session, log);
        console.log(`[GhostQA] Resposta HTTP ${log.status}: ${log.url}`);
      });

      console.log(`[GhostQA] Persona ${persona.name}: ${session.targetUrl}`);
      await page.goto(session.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      try {
        await page.waitForLoadState("networkidle", { timeout: 10_000 });
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) {
          throw error;
        }
        console.warn(
          "[GhostQA] A página não atingiu networkidle em 10s; seguindo com o estado atual.",
        );
      }

      const history: string[] = [];
      const maxSteps = PLAN_LIMITS[session.plan].steps;
      let missionStatus: Session["missionStatus"] = "abandoned";
      for (let order = 1; order <= maxSteps; order += 1) {
        await page.addScriptTag({ content: SET_OF_MARK_SCRIPT });
        const markedElements = await page.evaluate(
          () =>
            (
              window as Window & {
                __ghostSomElements?: MarkedElementInfo[];
              }
            ).__ghostSomElements ?? [],
        );
        const annotatedFileName = `${personaIdForPath}-step-${order}-annotated.png`;
        const cleanFileName = `${personaIdForPath}-step-${order}-clean.png`;
        const annotatedFilePath = path.join(
          screenshotDirectory,
          annotatedFileName,
        );
        const cleanFilePath = path.join(screenshotDirectory, cleanFileName);
        await page.screenshot({
          path: annotatedFilePath,
          animations: "disabled",
        });

        const screenshot = await readFile(annotatedFilePath);
        const decision = options.decide
          ? await options.decide({
              screenshot,
              persona,
              objective: session.objective,
              history,
            })
          : await requestPersonaDecision({
              client,
              model,
              screenshot,
              persona,
              objective: session.objective,
              history,
            });

        await removeMarksAndDrawActionMarker(page, decision.elemento_id);
        await page.screenshot({
          path: cleanFilePath,
          animations: "disabled",
        });
        const step = createStep(
          decision,
          persona.id,
          order,
          `/api/runs/${session.id}/screenshots/${persona.id}/${annotatedFileName}`,
          `/api/runs/${session.id}/screenshots/${persona.id}/${cleanFileName}`,
        );
        session.steps.push(step);
        history.push(
          `Passo ${order}: ${step.thought} Ação: ${step.action}. Problema UX: ${step.uxProblem ?? "nenhum"}.`,
        );

        let actionFailed = false;
        if (decision.acao === "finish") {
          missionStatus = "completed";
        } else if (decision.acao === "give_up") {
          missionStatus = "abandoned";
        } else {
          try {
            await applyDecision(page, decision, markedElements, session.viewport);
          } catch (error) {
            if (!(error instanceof errors.TimeoutError)) {
              throw error;
            }
            actionFailed = true;
            const log: TechLog = {
              id: randomUUID(),
              type: "automation",
              message: `A ação ${decision.acao} no elemento [${decision.elemento_id ?? "—"}] expirou; a página pode ter mudado após a captura. A auditoria continuará com uma nova captura.`,
              createdAt: new Date().toISOString(),
            };
            addTechLog(session, log);
            console.warn(`[GhostQA] ${log.message}`);
          }
        }
        await clearActionMarker(page);

        session.missionStatus = missionStatus;
        session.updatedAt = new Date().toISOString();
        await options.onUpdate?.(session);
        console.log(
          `[GhostQA] Persona ${persona.name}, passo ${order}/${maxSteps}: ${decision.acao}${actionFailed ? " (timeout recuperável)" : ""}.`,
        );

        if (decision.acao === "finish" || decision.acao === "give_up") {
          break;
        }
      }

      await page.close();
      if (missionStatus !== "completed") {
        everyPersonaCompleted = false;
      }
    }

    updateFrictionSummary(session);
    session.status = "completed";
    session.missionStatus = everyPersonaCompleted ? "completed" : "abandoned";
    session.errorMessage = null;
    session.updatedAt = new Date().toISOString();
    await options.onUpdate?.(session);
    console.log(`[GhostQA] Missão ${session.id} concluída.`);
    return session;
  } catch (error) {
    session.status = "failed";
    session.errorMessage =
      error instanceof Error ? error.message : "Falha desconhecida no motor.";
    session.updatedAt = new Date().toISOString();
    await options.onUpdate?.(session);
    console.error(
      `[GhostQA] Missão ${session.id} falhou: ${session.errorMessage}`,
    );
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[GhostQA] Navegador encerrado para ${session.id}.`);
    }
  }
}

export async function captureSetOfMarkScreenshot(
  options: CaptureSetOfMarkOptions,
): Promise<SetOfMarkCapture> {
  const targetUrl = validateOptions(options);
  const outputDirectory = path.join(
    process.cwd(),
    "data",
    "private-runs",
    options.sessionId,
  );
  const screenshotFileName = `step-${options.stepNumber}-annotated.png`;
  const screenshotPath = path.join(outputDirectory, screenshotFileName);
  const techLogs: TechLog[] = [];

  await mkdir(outputDirectory, { recursive: true });

  console.log(`[GhostQA] Iniciando captura Set-of-Mark: ${targetUrl.href}`);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage({
      viewport: viewportSizes[options.viewport],
    });

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const log: TechLog = {
        id: randomUUID(),
        type: "console",
        message: message.text(),
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Erro de console: ${log.message}`);
    });

    page.on("pageerror", (error) => {
      const log: TechLog = {
        id: randomUUID(),
        type: "pageerror",
        message: error.message,
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Erro de página: ${log.message}`);
    });

    page.on("response", (response) => {
      if (response.status() < 400) {
        return;
      }

      const log: TechLog = {
        id: randomUUID(),
        type: "http",
        message: `Resposta HTTP ${response.status()}`,
        url: response.url(),
        status: response.status(),
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Resposta HTTP ${log.status}: ${log.url}`);
    });

    console.log(`[GhostQA] Navegando para ${targetUrl.href}`);
    await page.goto(targetUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }

      console.warn(
        "[GhostQA] A página não atingiu networkidle em 10s; seguindo com o estado atual.",
      );
    }

    await page.addScriptTag({ content: SET_OF_MARK_SCRIPT });
    const elements = await page.evaluate(
      () =>
        (
          window as Window & {
            __ghostSomElements?: MarkedElementInfo[];
          }
        ).__ghostSomElements ?? [],
    );

    await page.screenshot({
      path: screenshotPath,
      animations: "disabled",
    });
    console.log(
      `[GhostQA] Captura salva em ${screenshotPath} (${elements.length} elementos marcados).`,
    );

    return {
      screenshotPath: path.relative(process.cwd(), screenshotPath),
      elements,
      techLogs,
    };
  } finally {
    await browser.close();
    console.log(`[GhostQA] Navegador encerrado para ${options.sessionId}.`);
  }
}

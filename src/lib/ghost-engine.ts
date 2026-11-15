import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, errors, type Browser, type Frame, type Page } from "playwright";
import { createOpenRouterClient } from "./openrouter";
import { navigateWithDnsRetry } from "./navigation-retry";
import { PLAN_LIMITS } from "./plan-limits";
import {
  getConfiguredOpenRouterModel,
  requestPersonaDecision,
  toIssueSeverity,
  type PersonaDecision,
} from "./ghost-decision";
import type { DeviceViewport, Session, Step, TechLog } from "./types";
import {
  createSetOfMarkScript,
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

interface CapturedMarkedElement extends MarkedElementInfo {
  frame: Frame;
}

class AutomationTargetUnavailableError extends Error {
  constructor() {
    super("O alvo selecionado mudou ou ficou encoberto antes da interação.");
    this.name = "AutomationTargetUnavailableError";
  }
}

class HumanVerificationChallengeError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} detectado antes da interação.`);
    this.name = "HumanVerificationChallengeError";
  }
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

async function collectMarkedElements(
  page: Page,
): Promise<CapturedMarkedElement[]> {
  const markedElements: CapturedMarkedElement[] = [];
  let startingId = 0;
  for (const frame of page.frames()) {
    if (frame.isDetached()) {
      continue;
    }
    const frameElements =
      await frame.evaluate<MarkedElementInfo[]>(
        createSetOfMarkScript(startingId),
      );
    for (const element of frameElements) {
      markedElements.push({ ...element, frame });
    }
    startingId += frameElements.length;
  }
  return markedElements;
}

async function detectHumanVerificationChallenge(
  page: Page,
): Promise<string | null> {
  for (const frame of page.frames()) {
    if (frame.isDetached()) {
      continue;
    }

    const frameUrl = frame.url().toLowerCase();
    const provider =
      frameUrl.includes("recaptcha") || frameUrl.includes("google.com/recaptcha")
        ? "Google reCAPTCHA"
        : frameUrl.includes("hcaptcha")
          ? "hCaptcha"
          : frameUrl.includes("challenges.cloudflare.com") ||
              frameUrl.includes("turnstile")
            ? "Cloudflare Turnstile"
            : null;
    if (provider && frame !== page.mainFrame()) {
      const frameElement = await frame.frameElement();
      if (await frameElement.isVisible()) {
        return provider;
      }
    }

    const challenge = await frame.evaluate(() => {
      const isVisible = (element: Element): boolean => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      };
      const widgets: Array<[string, string]> = [
        [".h-captcha", "hCaptcha"],
        [".cf-turnstile", "Cloudflare Turnstile"],
        [".g-recaptcha, [data-sitekey]", "CAPTCHA"],
        ["#challenge-form, #cf-challenge-running", "Cloudflare challenge"],
      ];
      for (const [selector, label] of widgets) {
        if (
          [...document.querySelectorAll(selector)].some((element) =>
            isVisible(element),
          )
        ) {
          return label;
        }
      }

      const visibleText = document.body?.innerText ?? "";
      return /verify you are human|prove you are human|i['’]m not a robot|confirm you are not a robot|checking your browser|complete the security check|verifique que você é humano|confirme que você é humano|não sou um robô|nao sou um robo|verificação de segurança|verificacao de seguranca|clique para completar.{0,100}verificar que você é humano|eu sou humano/i.test(visibleText)
        ? "verificação humana"
        : null;
    });
    if (challenge) {
      return challenge;
    }
  }

  return null;
}

function toMarkedElementInfo(
  element: CapturedMarkedElement,
): MarkedElementInfo {
  return {
    id: element.id,
    tagName: element.tagName,
    label: element.label,
    bounds: element.bounds,
    clickPoint: element.clickPoint,
  };
}

async function installShadowRootTracking(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const closedRoots: ShadowRoot[] = [];
    (
      window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
    ).__ghostClosedShadowRoots = closedRoots;

    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = attachShadow.call(this, init);
      if (init.mode === "closed") {
        closedRoots.push(root);
      }
      return root;
    };
  });
}

async function removeMarksAndDrawActionMarker(
  page: Page,
  elementId: number | null,
  targetFrame?: Frame,
  clickPoint?: { x: number; y: number },
): Promise<void> {
  for (const frame of page.frames()) {
    if (frame.isDetached()) {
      continue;
    }
    await frame.evaluate(
      ({ targetId, clickPoint }) => {
        const roots: Array<Document | ShadowRoot> = [document];
        const closedRoots = (
          window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
        ).__ghostClosedShadowRoots;
        for (const root of roots) {
          root.querySelectorAll("*").forEach((element) => {
            const shadowRoot =
              element.shadowRoot ??
              closedRoots?.find((candidate) => candidate.host === element);
            if (shadowRoot) {
              roots.push(shadowRoot);
            }
          });
        }
        for (const root of roots) {
          root
            .querySelectorAll(
              '[data-ghost-overlay="true"], #ghostqa-som-styles, [data-ghost-action-marker="true"]',
            )
            .forEach((node) => node.remove());
          root.querySelectorAll("[data-ghost-marked]").forEach((node) => {
            node.removeAttribute("data-ghost-marked");
          });
        }

        if (targetId === null) {
          return;
        }

        let target: HTMLElement | null = null;
        let targetRoot: Document | ShadowRoot | undefined;
        for (const root of roots) {
          const found = root.querySelector<HTMLElement>(
            `[data-ghost-id="${targetId}"]`,
          );
          if (found) {
            target = found;
            targetRoot = root;
            break;
          }
        }
        if (!target || !targetRoot) {
          return;
        }

        const bounds = target.getBoundingClientRect();
        const marker = document.createElement("div");
        marker.dataset.ghostActionMarker = "true";
        marker.setAttribute("aria-hidden", "true");
        marker.style.position = "fixed";
        marker.style.zIndex = "2147483647";
        marker.style.pointerEvents = "none";
        marker.style.left = `${
          (clickPoint?.x ?? bounds.left + bounds.width / 2) - 10
        }px`;
        marker.style.top = `${
          (clickPoint?.y ?? bounds.top + bounds.height / 2) - 10
        }px`;
        marker.style.width = "20px";
        marker.style.height = "20px";
        marker.style.border = "3px solid #ffffff";
        marker.style.borderRadius = "50%";
        marker.style.background = "#ef4444";
        marker.style.boxShadow =
          "0 0 0 2px #ef4444, 0 1px 5px rgb(0 0 0 / 65%)";
        if (targetRoot instanceof ShadowRoot) {
          targetRoot.append(marker);
        } else {
          document.body.append(marker);
        }
      },
      {
        targetId: frame === targetFrame ? elementId : null,
        clickPoint: frame === targetFrame ? clickPoint : undefined,
      },
    );
  }
}

async function clearActionMarker(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    if (frame.isDetached()) {
      continue;
    }
    await frame.evaluate(() => {
      const roots: Array<Document | ShadowRoot> = [document];
      const closedRoots = (
        window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
      ).__ghostClosedShadowRoots;
      for (const root of roots) {
        root.querySelectorAll("*").forEach((element) => {
          const shadowRoot =
            element.shadowRoot ??
            closedRoots?.find((candidate) => candidate.host === element);
          if (shadowRoot) {
            roots.push(shadowRoot);
          }
        });
      }
      for (const root of roots) {
        root
          .querySelectorAll(
            '[data-ghost-overlay="true"], [data-ghost-action-marker="true"], #ghostqa-som-styles',
          )
          .forEach((node) => node.remove());
        root
          .querySelectorAll("[data-ghost-id], [data-ghost-marked]")
          .forEach((node) => {
            node.removeAttribute("data-ghost-id");
            node.removeAttribute("data-ghost-marked");
          });
      }
    });
  }
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
  page: Page,
  decision: PersonaDecision,
  markedElements: CapturedMarkedElement[],
  viewport: DeviceViewport,
): Promise<void> {
  const target = markedElements.find(
    ({ id }) => id === decision.elemento_id,
  );
  if (
    decision.elemento_id !== null &&
    !target
  ) {
    throw new Error(
      `O modelo selecionou elemento_id ${decision.elemento_id}, que não existe nesta tela.`,
    );
  }

  const verificationChallenge =
    await detectHumanVerificationChallenge(page);
  if (verificationChallenge) {
    throw new HumanVerificationChallengeError(verificationChallenge);
  }

  const isTargetStillClickable = async (): Promise<boolean> => {
    if (!target) {
      return false;
    }
    return target.frame.evaluate(
      ({ id, clickPoint }) => {
        const roots: Array<Document | ShadowRoot> = [document];
        const closedRoots = (
          window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
        ).__ghostClosedShadowRoots;
        for (const root of roots) {
          root.querySelectorAll("*").forEach((element) => {
            const shadowRoot =
              element.shadowRoot ??
              closedRoots?.find((candidate) => candidate.host === element);
            if (shadowRoot) {
              roots.push(shadowRoot);
            }
          });
        }

        let targetElement: HTMLElement | null = null;
        let targetRoot: Document | ShadowRoot | undefined;
        for (const root of roots) {
          const element = root.querySelector<HTMLElement>(
            `[data-ghost-id="${id}"]`,
          );
          if (element) {
            targetElement = element;
            targetRoot = root;
            break;
          }
        }
        if (!targetElement || !targetRoot || !targetElement.isConnected) {
          return false;
        }
        const hit = targetRoot.elementFromPoint(
          clickPoint.x,
          clickPoint.y,
        );
        let current: Element | null = hit;
        while (current) {
          if (current === targetElement) {
            return true;
          }
          const root = current.getRootNode();
          current =
            current.parentElement ??
            (root instanceof ShadowRoot ? root.host : null);
        }
        return false;
      },
      { id: decision.elemento_id, clickPoint: target.clickPoint },
    );
  };

  const clickAtTarget = async (
    target: CapturedMarkedElement,
  ): Promise<void> => {
    if (!(await isTargetStillClickable())) {
      throw new AutomationTargetUnavailableError();
    }
    await target.frame.locator("html").click({
      position: {
        x: target.clickPoint.x,
        y: target.clickPoint.y,
      },
      timeout: 5_000,
    });
  };

  switch (decision.acao) {
    case "click":
      if (!target) {
        throw new Error("A ação click não contém um elemento clicável válido.");
      }
      await clickAtTarget(target);
      break;
    case "type":
      if (decision.texto_digitado === null) {
        throw new Error("A ação type não contém texto para preencher.");
      }
      if (!target) {
        throw new Error("A ação type não contém um campo válido.");
      }
      await clickAtTarget(target);
      await target.frame.page().keyboard.press("Control+A");
      await target.frame.page().keyboard.insertText(decision.texto_digitado);
      break;
    case "scroll":
      if (decision.elemento_id !== null && target) {
        const bounds = await target.frame
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
    let blockedByVerification = false;
    for (const persona of session.personas) {
      if (blockedByVerification) {
        break;
      }
      const page = await browser.newPage({
        viewport: viewportSizes[session.viewport],
      });
      await installShadowRootTracking(page);
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
      const targetHostname = new URL(session.targetUrl).hostname;
      await navigateWithDnsRetry(
        session.targetUrl,
        () =>
          page.goto(session.targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          }),
        (attempt, _error, willRetry) => {
          const log: TechLog = {
            id: randomUUID(),
            type: "automation",
            message: willRetry
              ? `Falha temporária de DNS ao abrir ${targetHostname} (tentativa ${attempt}/3); tentando novamente.`
              : `O DNS não resolveu ${targetHostname} após 3 tentativas. A auditoria falhou antes de carregar a página; verifique a conectividade do ambiente.`,
            createdAt: new Date().toISOString(),
          };
          addTechLog(session, log);
          console.warn(`[GhostQA] ${log.message}`);
        },
      );
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
      let consecutiveActionFailures = 0;
      for (let order = 1; order <= maxSteps; order += 1) {
        const verificationChallenge =
          await detectHumanVerificationChallenge(page);
        if (verificationChallenge) {
          blockedByVerification = true;
          missionStatus = "blocked";
          const log: TechLog = {
            id: randomUUID(),
            type: "automation",
            message: `${verificationChallenge} detectado. A auditoria foi pausada sem interagir nem tentar resolver a verificação; a jornada precisa de intervenção humana para prosseguir.`,
            createdAt: new Date().toISOString(),
          };
          addTechLog(session, log);
          console.warn(`[GhostQA] ${log.message}`);
          break;
        }

        const markedElements = await collectMarkedElements(page);
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
        const availableElementIds = markedElements.map(({ id }) => id);
        let decision: PersonaDecision | undefined;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const decisionHistory =
            attempt === 0
              ? history
              : [
                  ...history,
                  `A decisão anterior selecionou um elemento inexistente. Para esta imagem, IDs válidos: ${JSON.stringify(availableElementIds)}. Se não conseguir identificar um alvo válido, escolha finish ou give_up.`,
                ];
          const nextDecision = options.decide
            ? await options.decide({
                screenshot,
                persona,
                objective: session.objective,
                history: decisionHistory,
              })
            : await requestPersonaDecision({
                client,
                model,
                screenshot,
                persona,
                objective: session.objective,
                history: decisionHistory,
                availableElements: markedElements.map(toMarkedElementInfo),
              });
          const hasInvalidTarget =
            (nextDecision.acao === "click" || nextDecision.acao === "type") &&
            !availableElementIds.includes(nextDecision.elemento_id ?? -1);
          if (!hasInvalidTarget) {
            decision = nextDecision;
            break;
          }

          const log: TechLog = {
            id: randomUUID(),
            type: "automation",
            message: `O modelo selecionou elemento_id ${nextDecision.elemento_id}, que não existe nesta tela. IDs disponíveis: ${JSON.stringify(availableElementIds)}. ${attempt === 0 ? "Solicitando nova decisão." : "A persona será marcada como desistente para evitar falha da auditoria."}`,
            createdAt: new Date().toISOString(),
          };
          addTechLog(session, log);
          console.warn(`[GhostQA] ${log.message}`);

          if (attempt === 1) {
            decision = {
              ...nextDecision,
              pensamento_persona:
                "Não consegui identificar um elemento válido para continuar.",
              acao: "give_up",
              elemento_id: null,
              texto_digitado: null,
              problema_ux_encontrado: null,
              severidade_problema: "nenhuma",
            };
          }
        }
        if (!decision) {
          throw new Error("Não foi possível obter uma decisão para a auditoria.");
        }

        const target = markedElements.find(
          ({ id }) => id === decision?.elemento_id,
        );
        await removeMarksAndDrawActionMarker(
          page,
          decision.elemento_id,
          target?.frame,
          target?.clickPoint,
        );
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

        let actionFailed = false;
        if (decision.acao === "finish") {
          missionStatus = "completed";
        } else if (decision.acao === "give_up") {
          missionStatus = "abandoned";
        } else {
          try {
            await applyDecision(page, decision, markedElements, session.viewport);
            consecutiveActionFailures = 0;
          } catch (error) {
            if (error instanceof HumanVerificationChallengeError) {
              blockedByVerification = true;
              missionStatus = "blocked";
              step.thought =
                "A jornada foi interrompida por uma verificação humana.";
              step.action = "give_up";
              step.elementId = null;
              step.typedText = null;
              step.uxProblem = null;
              step.severity = "none";
              const log: TechLog = {
                id: randomUUID(),
                type: "automation",
                message: `${error.provider} surgiu antes da interação. A auditoria foi pausada sem clicar nem tentar resolver a verificação humana.`,
                createdAt: new Date().toISOString(),
              };
              addTechLog(session, log);
              console.warn(`[GhostQA] ${log.message}`);
            } else if (
              !(error instanceof errors.TimeoutError) &&
              !(error instanceof AutomationTargetUnavailableError)
            ) {
              throw error;
            } else if (
              error instanceof errors.TimeoutError ||
              error instanceof AutomationTargetUnavailableError
            ) {
              actionFailed = true;
              consecutiveActionFailures += 1;
              step.uxProblem = null;
              step.severity = "none";
              const log: TechLog = {
                id: randomUUID(),
                type: "automation",
                message:
                  `A ação ${decision.acao} no elemento [${decision.elemento_id ?? "—"}] não foi confirmada; nenhuma interação foi validada como executada no site. ${target?.label ? `Alvo: "${target.label}". ` : ""}Detalhe: ${error.message}`,
                createdAt: new Date().toISOString(),
              };
              addTechLog(session, log);
              console.warn(`[GhostQA] ${log.message}`);
              if (consecutiveActionFailures >= 3) {
                const repeatedFailureLog: TechLog = {
                  id: randomUUID(),
                  type: "automation",
                  message:
                    "A persona foi encerrada após três interações consecutivas sem confirmação pela automação; não é possível concluir que o site tenha falhado.",
                  createdAt: new Date().toISOString(),
                };
                addTechLog(session, repeatedFailureLog);
                missionStatus = "abandoned";
              }
            }
          }
        }
        await clearActionMarker(page);
        history.push(
          `Passo ${order}: ${step.thought} Ação: ${step.action}. Resultado: ${
            actionFailed
              ? "interação não confirmada pela automação; não atribua falha ao site sem evidência posterior"
              : "ação executada"
          }. Problema UX: ${step.uxProblem ?? "nenhum"}.`,
        );

        session.missionStatus = missionStatus;
        session.updatedAt = new Date().toISOString();
        await options.onUpdate?.(session);
        console.log(
          `[GhostQA] Persona ${persona.name}, passo ${order}/${maxSteps}: ${decision.acao}${actionFailed ? " (timeout recuperável)" : ""}.`,
        );

        if (
          decision.acao === "finish" ||
          decision.acao === "give_up" ||
          consecutiveActionFailures >= 3 ||
          blockedByVerification
        ) {
          break;
        }
      }

      await page.close();
      if (missionStatus === "blocked") {
        everyPersonaCompleted = false;
      } else if (missionStatus !== "completed") {
        everyPersonaCompleted = false;
      }
    }

    updateFrictionSummary(session);
    session.status = "completed";
    session.missionStatus = blockedByVerification
      ? "blocked"
      : everyPersonaCompleted
        ? "completed"
        : "abandoned";
    if (blockedByVerification && session.steps.length === 0) {
      session.frictionScore = null;
    }
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
    await installShadowRootTracking(page);

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
    await navigateWithDnsRetry(
      targetUrl.href,
      () =>
        page.goto(targetUrl.href, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        }),
      (attempt, _error, willRetry) => {
        const message = willRetry
          ? `Falha temporária de DNS ao abrir ${targetUrl.hostname} (tentativa ${attempt}/3); tentando novamente.`
          : `O DNS não resolveu ${targetUrl.hostname} após 3 tentativas. A captura falhou antes de carregar a página.`;
        techLogs.push({
          id: randomUUID(),
          type: "automation",
          message,
          createdAt: new Date().toISOString(),
        });
        console.warn(`[GhostQA] ${message}`);
      },
    );

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

    const capturedElements = await collectMarkedElements(page);
    const elements = capturedElements.map(toMarkedElementInfo);

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

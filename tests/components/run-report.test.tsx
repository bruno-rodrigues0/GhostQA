// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunReport } from "../../src/components/run-report";
import type { Session, Step } from "../../src/lib/types";
import { render } from "../utils/react-dom";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { ...props, href }, children),
}));
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) =>
    React.createElement("img", { src: props.src, alt: props.alt }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function makeStep(
  id: string,
  personaId: string,
  order: number,
  severity: Step["severity"],
  uxProblem: string | null,
  cleanScreenshotPath: string | null = null,
): Step {
  return {
    id,
    personaId,
    order,
    thought: `Thought ${id}`,
    frustrationLevel: 8,
    action: "click",
    elementId: order,
    typedText: null,
    uxProblem,
    severity,
    annotatedScreenshotPath: `/api/screenshots/${id}-annotated.png`,
    cleanScreenshotPath,
    createdAt: "2026-11-15T12:34:56.000Z",
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "run-1",
    targetUrl: "https://example.com/signup",
    objective: "Create an account",
    plan: "pro",
    viewport: "mobile",
    personas: [
      { id: "p1", name: "Careful", description: "Reads all details." },
      { id: "p2", name: "Fast", description: "Wants speed." },
    ],
    status: "completed",
    steps: [
      makeStep("step-high", "p1", 1, "high", "Missing error guidance.", "/clean.png"),
      { ...makeStep("step-medium", "p1", 2, "medium", "Unclear label."), frustrationLevel: 5 },
      {
        ...makeStep("step-low", "p2", 3, "low", "The action is hard to discover."),
        annotatedScreenshotPath: null,
        frustrationLevel: 3,
      },
      {
        ...makeStep("step-none", "p2", 4, "none", "Neutral action."),
        annotatedScreenshotPath: null,
        frustrationLevel: 2,
      },
    ],
    techLogs: [
      {
        id: "log-http",
        type: "http",
        message: "Not found",
        status: 404,
        url: "https://example.com/missing",
        createdAt: "2026-11-15T12:34:56.000Z",
      },
      {
        id: "log-auto",
        type: "automation",
        message: "Action timed out",
        createdAt: "2026-11-15T12:34:56.000Z",
      },
      {
        id: "log-console",
        type: "console",
        message: "Console warning",
        createdAt: "2026-11-15T12:34:56.000Z",
      },
    ],
    frictionScore: 75,
    missionStatus: "blocked",
    recommendations: ["Add clearer validation.", "Label the password field."],
    errorMessage: null,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:34:56.000Z",
    ...overrides,
  };
}

function buttonByText(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.includes(label),
  ) ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RunReport", () => {
  it("shows loading before resolving the report request", async () => {
    let resolveResponse!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    ));
    const ui = await render(<RunReport sessionId="run-loading" />);

    expect(ui.container.textContent).toContain("Carregando jornada da auditoria...");
    await ui.unmount();
    resolveResponse(jsonResponse(makeSession()));
  });

  it("shows a safe unavailable state after failed loads", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Run not found" }, false))
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockRejectedValueOnce("network error"));
    const ui = await render(<RunReport sessionId="missing" />);

    expect(ui.container.textContent).toContain("Auditoria indisponível");
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe("Run not found");
    await ui.unmount();

    const missingId = await render(<RunReport sessionId="missing" />);
    expect(missingId.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível carregar esta auditoria.");
    await missingId.unmount();

    const fallback = await render(<RunReport sessionId="missing" />);
    expect(fallback.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível carregar esta auditoria.");
    await fallback.unmount();
  });

  it("renders a blocked Pro report, filters persona steps, switches panels and exports", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(makeSession())));
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const ui = await render(<RunReport sessionId="run-1" />);

    expect(ui.container.textContent).toContain("A auditoria parou diante de uma verificação humana.");
    expect(ui.container.textContent).toContain("Mobile 390 × 844");
    expect(ui.container.textContent).toContain("Score de fricção");
    expect(ui.container.textContent).toContain("Thought step-medium");
    await ui.click(buttonByText(ui.container, "Passo 1"));
    expect(ui.container.querySelector('img[src="/clean.png"]')).not.toBeNull();
    expect(ui.container.textContent).toContain("Missing error guidance.");
    await ui.click(buttonByText(ui.container, "Passo 2"));
    expect(ui.container.textContent).toContain("01");
    expect(ui.container.textContent).toContain("02");

    await ui.click(buttonByText(ui.container, "Raio-X técnico"));
    expect(ui.container.textContent).toContain("HTTP 404");
    expect(ui.container.textContent).toContain("Automação");
    expect(ui.container.textContent).toContain("Console warning");
    expect(ui.container.textContent).toContain("https://example.com/missing");

    await ui.click(buttonByText(ui.container, "Plano de ação UX"));
    expect(ui.container.textContent).toContain("Plano de ação UX");
    await ui.click(buttonByText(ui.container, "Exportar .md"));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    expect(anchorClick).toHaveBeenCalledOnce();
    await ui.click(buttonByText(ui.container, "Salvar PDF"));
    expect(print).toHaveBeenCalledOnce();

    await ui.click(buttonByText(ui.container, "Fast"));
    expect(ui.container.textContent).toContain("Nenhum screenshot foi capturado nesta jornada.");
    expect(ui.container.textContent).toContain("Thought step-none");
    expect(ui.container.textContent).toContain("The action is hard to discover.");
    await ui.unmount();
  });

  it("shows the free technical upsell, empty panels and completed-screen defaults", async () => {
    const freeRun = makeSession({
      plan: "free",
      viewport: "desktop",
      status: "completed",
      missionStatus: "completed",
      frictionScore: 20,
      personas: [{ id: "p1", name: "Careful", description: "Reads details." }],
      steps: [],
      techLogs: [],
      recommendations: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(freeRun)));
    const ui = await render(<RunReport sessionId="free-run" />);

    expect(ui.container.textContent).toContain("Desktop 1280 × 800");
    expect(ui.container.textContent).toContain("Nenhum passo registrado.");
    expect(ui.container.textContent).toContain("Nenhum problema de UX foi registrado.");
    expect(ui.container.textContent).toContain("Prévia do relatório.");
    await ui.click(buttonByText(ui.container, "Raio-X técnico"));
    expect(ui.container.textContent).toContain("disponíveis no plano Pro");
    expect(buttonByText(ui.container, "Exportar .md")).toBeNull();
    await ui.unmount();

    const proWithoutLogs = makeSession({
      steps: [],
      techLogs: [],
      recommendations: [],
      personas: [{ id: "p1", name: "Careful", description: "Reads details." }],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(proWithoutLogs)));
    const proUi = await render(<RunReport sessionId="pro-empty" />);
    await proUi.click(buttonByText(proUi.container, "Raio-X técnico"));
    expect(proUi.container.textContent).toContain("Nenhum erro técnico foi capturado.");
    await proUi.unmount();
  });

  it("retries completed or failed reports and displays retry errors", async () => {
    const failed = makeSession({
      status: "failed",
      missionStatus: "abandoned",
      errorMessage: null,
      steps: [],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(failed))
      .mockRejectedValueOnce("network unavailable")
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse(makeSession({ status: "running" })));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<RunReport sessionId="run-1" />);

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Ocorreu uma falha durante a auditoria.");
    await ui.click(buttonByText(ui.container, "Executar novamente"));
    expect([...ui.container.querySelectorAll('[role="alert"]')].at(-1)?.textContent)
      .toBe("Não foi possível repetir a auditoria.");

    await ui.click(buttonByText(ui.container, "Executar novamente"));
    expect([...ui.container.querySelectorAll('[role="alert"]')].at(-1)?.textContent)
      .toBe("Não foi possível repetir a auditoria.");
    await ui.click(buttonByText(ui.container, "Executar novamente"));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(ui.container.textContent).toContain("Agente navegando...");
    await ui.unmount();
  });

  it("shows a live-session placeholder and polls until an active run changes status", async () => {
    const active = makeSession({
      plan: "free",
      status: "pending",
      missionStatus: null,
      frictionScore: null,
      steps: [],
      techLogs: [],
      personas: [{ id: "p1", name: "Careful", description: "Reads details." }],
    });
    const completed = makeSession({
      status: "completed",
      missionStatus: "completed",
      steps: [],
      techLogs: [],
      personas: [{ id: "p1", name: "Careful", description: "Reads details." }],
    });
    const callback = vi.fn();
    const setInterval = vi.spyOn(window, "setInterval").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") {
          callback.mockImplementation(() => {
            Reflect.apply(handler, window, []);
          });
        }
        return 73;
      }) as typeof window.setInterval,
    );
    const clearInterval = vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(active))
      .mockResolvedValueOnce(jsonResponse(completed)));
    const ui = await render(<RunReport sessionId="active-run" />);

    expect(ui.container.textContent).toContain("Preparando navegador isolado");
    expect(ui.container.textContent)
      .toContain("A persona está analisando a tela e ainda não registrou um passo.");
    expect(ui.container.textContent).toContain("Aguardando o primeiro passo...");
    expect(ui.container.textContent).toContain("—/100");
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1500);

    await act(async () => {
      callback();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ui.container.textContent).toContain("Nenhum screenshot foi capturado nesta jornada.");
    await ui.unmount();
    expect(clearInterval).toHaveBeenCalledWith(73);
  });
});

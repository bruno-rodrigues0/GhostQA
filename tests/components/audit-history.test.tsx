// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditHistory } from "../../src/components/audit-history";
import type { Session } from "../../src/lib/types";
import { render } from "../utils/react-dom";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { ...props, href }, children),
}));

function response(sessions: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(sessions) } as unknown as Response;
}

function session(
  id: string,
  status: Session["status"],
  missionStatus: Session["missionStatus"],
  score: number | null,
  plan: Session["plan"] = "free",
  viewport: Session["viewport"] = "desktop",
): Session {
  return {
    id,
    targetUrl: `https://${id}.example.com`,
    objective: `Objective ${id}`,
    plan,
    viewport,
    personas: [],
    status,
    steps: [],
    techLogs: [],
    frictionScore: score,
    missionStatus,
    recommendations: [],
    errorMessage: null,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:00:00.000Z",
  };
}

function linkFor(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("a")].find(
    (link) => link.textContent?.includes(label),
  ) ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuditHistory", () => {
  it("renders session status and score variants and filters by URL or objective", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([
      session("failed", "failed", "abandoned", 75),
      session("active", "running", null, 50, "pro", "mobile"),
      session("done", "completed", "completed", 20),
      session("blocked", "completed", "blocked", null),
      session("abandoned", "completed", "abandoned", 10),
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AuditHistory />);

    expect(ui.container.textContent).toContain("5 auditoria(s)");
    expect(ui.container.textContent).toContain("Falha na execução");
    expect(ui.container.textContent).toContain("Agente navegando");
    expect(ui.container.textContent).toContain("Concluída");
    expect(ui.container.textContent).toContain("Bloqueada por verificação humana");
    expect(ui.container.querySelector('a[href="/runs/failed"]')).not.toBeNull();
    expect(ui.container.textContent).toContain("75");
    expect(ui.container.textContent).toContain("50");
    expect(ui.container.textContent).toContain("PRO");
    expect(ui.container.textContent).toContain("Mobile");

    await ui.input(
      ui.container.querySelector('input[type="search"]'),
      "DONE.EXAMPLE",
    );
    expect(ui.container.textContent).toContain("Objective done");
    expect(ui.container.textContent).not.toContain("Objective failed");

    await ui.input(
      ui.container.querySelector('input[type="search"]'),
      "not a matching search",
    );
    expect(ui.container.textContent).toContain("Nenhuma auditoria corresponde à busca.");
    expect(ui.container.textContent).toContain("Tente buscar por outra URL ou objetivo.");
    expect(linkFor(ui.container, "Criar primeira missão")).toBeNull();
    await ui.unmount();
  });

  it("shows an empty state and its first-mission action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));
    const ui = await render(<AuditHistory />);

    expect(ui.container.textContent).toContain("Nenhuma auditoria por aqui ainda.");
    expect(ui.container.textContent).toContain("Crie uma missão");
    expect(linkFor(ui.container, "Criar primeira missão")?.getAttribute("href"))
      .toBe("/");
    await ui.unmount();
  });

  it("shows errors and retries failed requests", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce("network failure")
      .mockResolvedValueOnce(response([])));
    const ui = await render(<AuditHistory />);

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível carregar as auditorias.");
    await ui.click([...ui.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Tentar novamente",
    ) ?? null);
    expect(ui.container.textContent).toContain("Nenhuma auditoria por aqui ainda.");
    await ui.unmount();
  });

  it("uses the API error message when an HTTP response fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ error: "History unavailable" }, false),
    ));
    const ui = await render(<AuditHistory />);

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível carregar as auditorias.");
    await ui.unmount();
  });

  it("refreshes while sessions are running and clears the interval on unmount", async () => {
    const callback = vi.fn();
    const setInterval = vi.spyOn(window, "setInterval").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") {
          callback.mockImplementation(() => {
            Reflect.apply(handler, window, []);
          });
        }
        return 42;
      }) as typeof window.setInterval,
    );
    const clearInterval = vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([session("active", "pending", null, null)]))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AuditHistory />);

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    await act(async () => {
      callback();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await ui.unmount();
    expect(clearInterval).toHaveBeenCalledWith(42);
  });
});

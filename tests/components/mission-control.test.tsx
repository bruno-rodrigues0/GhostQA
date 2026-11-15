// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionControl } from "../../src/components/mission-control";
import { DEFAULT_PERSONAS } from "../../src/lib/personas";
import { render } from "../utils/react-dom";

const { authClient } = vi.hoisted(() => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({ authClient }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { ...props, href }, children),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function buttonByText(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim().includes(label),
  ) ?? null;
}

const account = {
  name: "Ada Lovelace",
  email: "ada@example.com",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MissionControl", () => {
  it("supports examples, persona selection, upgrade dialogs and quota messaging on Free", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "free", used: 5, limit: 5 }}
        isAdmin={false}
      />,
    );

    expect(ui.container.textContent).toContain("Plano Free · Hobby");
    expect(ui.container.querySelector('a[href="/admin"]')).toBeNull();
    expect(ui.container.textContent).toContain("A");

    await ui.click(buttonByText(ui.container, "Loja virtual"));
    expect((ui.container.querySelector('input[name="targetUrl"]') as HTMLInputElement).value)
      .toBe("https://www.mercadolivre.com.br/");

    await ui.click(buttonByText(ui.container, "Mobile"));
    expect(ui.container.querySelector('[role="dialog"]')?.textContent)
      .toContain("Desbloqueie o plano Pro");
    await ui.click(buttonByText(ui.container, "Agora não"));

    await ui.click(buttonByText(ui.container, "Nova persona"));
    expect(ui.container.querySelector('[role="dialog"]')).not.toBeNull();
    await ui.click(buttonByText(ui.container, "Entendi"));

    const secondPersonaButton = [...ui.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes(DEFAULT_PERSONAS[1]!.name),
    );
    await ui.click(secondPersonaButton ?? null);
    await ui.click(secondPersonaButton ?? null);
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Selecione ao menos uma persona para a missão.");
    await ui.unmount();
  });

  it("explains monthly quota exhaustion and can dismiss its dialog by overlay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "pro", used: 100, limit: 100 }}
        isAdmin
      />,
    );

    expect(ui.container.querySelector('a[href="/admin"]')?.textContent)
      .toBe("Administração");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="dialog"]')?.textContent)
      .toContain("Limite mensal atingido");
    expect(ui.container.querySelector('[role="dialog"]')?.textContent)
      .toContain("O limite será renovado no próximo mês.");

    const overlay = ui.container.querySelector('[role="presentation"]');
    await ui.mouseDown(overlay);
    expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
    await ui.unmount();
  });

  it("creates custom personas, supports mobile and reports API failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: "Target unavailable" }, false));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "persona-id" });
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "pro", used: 1, limit: 100 }}
        isAdmin={false}
      />,
    );

    await ui.click(buttonByText(ui.container, "Mobile390 × 844"));
    expect([...ui.container.querySelectorAll("button")].some(
      (button) => button.textContent?.includes("Mobile") && button.getAttribute("aria-pressed") === "true",
    )).toBe(true);

    await ui.click(buttonByText(ui.container, "Nova persona"));
    const personaForm = ui.container.querySelectorAll("form")[1]!;
    const inputs = personaForm.querySelectorAll("input");
    await ui.input(inputs[0], "  Pessoa personalizada  ");
    await ui.input(inputs[1], "");
    await ui.input(inputs[1], "35");
    await ui.input(personaForm.querySelector("textarea"), "  Busca comparar produtos  ");
    await ui.input(personaForm.querySelector("select"), "high");
    await ui.submit(personaForm);

    expect(ui.container.textContent).toContain("Pessoa personalizada");
    expect(ui.container.textContent).toContain("2/3 selecionada(s)");

    await ui.input(ui.container.querySelector('input[name="targetUrl"]'), "https://example.com");
    await ui.input(ui.container.querySelector("textarea[name=objective]"), "Concluir cadastro");
    await ui.submit(ui.container.querySelector("form"));

    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toMatchObject({
      targetUrl: "https://example.com",
      objective: "Concluir cadastro",
      viewport: "mobile",
      personas: [
        { id: DEFAULT_PERSONAS[0]!.id },
        {
          id: "custom-persona-id",
          name: "Pessoa personalizada",
          age: 35,
          description: "Busca comparar produtos",
          context: "Busca comparar produtos",
          technicalLevel: "high",
        },
      ],
    });
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Target unavailable");
    await ui.unmount();
  });

  it("handles backend quota errors, network errors, zero personas and sign-out", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({
        code: "MONTHLY_LIMIT_REACHED",
        error: "limit reached",
      }, false));
    vi.stubGlobal("fetch", fetchMock);
    authClient.signOut.mockResolvedValue({});
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "free", used: 0, limit: 5 }}
        isAdmin={false}
      />,
    );

    const personaButton = [...ui.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes(DEFAULT_PERSONAS[0]!.name),
    );
    await ui.click(personaButton ?? null);
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Selecione ao menos uma persona para a missão.");
    await ui.click(personaButton ?? null);

    await ui.input(ui.container.querySelector('input[name="targetUrl"]'), "https://example.com");
    await ui.input(ui.container.querySelector("textarea[name=objective]"), "Run task");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="dialog"]')?.textContent)
      .toContain("Desbloqueie o plano Pro");

    await ui.click(buttonByText(ui.container, "Sair"));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/login");
    await ui.unmount();
  });

  it("navigates to a created run and supports closing the persona dialog", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: "run-123" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "custom-id" });
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "pro", used: 0, limit: 100 }}
        isAdmin={false}
      />,
    );

    await ui.click(buttonByText(ui.container, "Nova persona"));
    await ui.click(ui.container.querySelector('button[aria-label="Fechar"]'));
    expect(ui.container.querySelectorAll("form")).toHaveLength(1);
    await ui.input(ui.container.querySelector('input[name="targetUrl"]'), "https://example.com");
    await ui.input(ui.container.querySelector("textarea[name=objective]"), "Run task");
    await ui.submit(ui.container.querySelector("form"));

    expect(assign).toHaveBeenCalledWith("/runs/run-123");
    await ui.unmount();
  });

  it("keeps Pro selection capped at three and falls back on network submission failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockRejectedValueOnce("network unavailable");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "another-id" });
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "pro", used: 0, limit: 100 }}
        isAdmin={false}
      />,
    );

    await ui.click(buttonByText(ui.container, "Nova persona"));
    const personaForm = ui.container.querySelectorAll("form")[1]!;
    await ui.input(personaForm.querySelector("input"), "Custom profile");
    await ui.input(personaForm.querySelector("textarea"), "Custom context");
    await ui.submit(personaForm);

    await ui.click(buttonByText(ui.container, DEFAULT_PERSONAS[1]!.name));
    await ui.click(buttonByText(ui.container, DEFAULT_PERSONAS[2]!.name));
    expect(ui.container.textContent).toContain("3/3 selecionada(s)");
    expect(buttonByText(ui.container, "Nova persona")?.disabled).toBe(true);

    await ui.input(ui.container.querySelector('input[name="targetUrl"]'), "https://example.com");
    await ui.input(ui.container.querySelector("textarea[name=objective]"), "Run task");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível iniciar a missão.");
    await ui.unmount();
  });

  it("reports history request failures without terminating the mission form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("History unavailable")));
    const ui = await render(
      <MissionControl
        user={account}
        account={{ plan: "free", used: 0, limit: 5 }}
        isAdmin={false}
      />,
    );

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("History unavailable");
    expect(ui.container.querySelector("form")).not.toBeNull();
    await ui.unmount();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network unavailable"));
    const fallback = await render(
      <MissionControl
        user={account}
        account={{ plan: "free", used: 0, limit: 5 }}
        isAdmin={false}
      />,
    );
    expect(fallback.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível carregar o histórico de auditorias.");
    await fallback.unmount();
  });
});

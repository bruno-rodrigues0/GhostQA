// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "../../src/components/auth-form";
import { render } from "../utils/react-dom";

const { authClient } = vi.hoisted(() => ({
  authClient: {
    requestPasswordReset: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

vi.mock("@/lib/auth-client", () => ({ authClient }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href }, children),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an account and returns to sign in with a confirmation notice", async () => {
    authClient.signUp.email.mockResolvedValue({});
    const ui = await render(<AuthForm />);

    await ui.click(ui.container.querySelector('button[type="button"]:last-child'));
    expect(ui.container.querySelector("h1")?.textContent).toBe("Criar conta");
    expect(ui.container.querySelector('input[autocomplete="name"]')).not.toBeNull();
    expect(ui.container.querySelector('input[type="password"]')?.getAttribute("minlength"))
      .toBe("12");

    await ui.input(ui.container.querySelector('input[autocomplete="name"]'), "Ada Lovelace");
    await ui.input(ui.container.querySelector('input[type="email"]'), "ada@example.com");
    await ui.input(ui.container.querySelector('input[type="password"]'), "a-secure-password");
    await ui.submit(ui.container.querySelector("form"));

    expect(authClient.signUp.email).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "a-secure-password",
    });
    expect(ui.container.querySelector("h1")?.textContent).toBe("Entrar");
    expect(ui.container.querySelector('[role="status"]')?.textContent)
      .toContain("Verifique seu e-mail");

    await ui.unmount();
  });

  it("shows sign-up failures, including fallback and thrown non-Error values", async () => {
    authClient.signUp.email
      .mockResolvedValueOnce({ error: {} })
      .mockRejectedValueOnce("unexpected");
    const ui = await render(<AuthForm />);

    await ui.click(ui.container.querySelector('button[type="button"]:last-child'));
    await ui.input(ui.container.querySelector('input[autocomplete="name"]'), "Ada");
    await ui.input(ui.container.querySelector('input[type="email"]'), "ada@example.com");
    await ui.input(ui.container.querySelector('input[type="password"]'), "a-secure-password");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível autenticar.");

    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível autenticar.");
    await ui.unmount();
  });

  it("shows sign-in errors and navigates to the home page after success", async () => {
    authClient.signIn.email
      .mockResolvedValueOnce({ error: { message: "Senha incorreta." } })
      .mockResolvedValueOnce({});
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { origin: "https://bunter.example", assign },
    });
    const ui = await render(<AuthForm />);

    await ui.input(ui.container.querySelector('input[type="email"]'), "ada@example.com");
    await ui.input(ui.container.querySelector('input[type="password"]'), "wrong-password");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Senha incorreta.");

    await ui.submit(ui.container.querySelector("form"));
    expect(assign).toHaveBeenCalledWith("/");
    await ui.unmount();
  });

  it("requests password reset, showing confirmation and API errors", async () => {
    authClient.requestPasswordReset
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ error: { message: "E-mail inválido." } })
      .mockRejectedValueOnce(new Error("Serviço indisponível"));
    const ui = await render(<AuthForm />);

    await ui.click(buttonByText(ui.container, "Esqueci minha senha"));
    expect(ui.container.querySelector("h1")?.textContent).toBe("Criar conta");
    expect(ui.container.querySelector('input[type="password"]')).toBeNull();
    expect(buttonByText(ui.container, "Voltar para entrar")).not.toBeNull();
    await ui.input(ui.container.querySelector('input[type="email"]'), "ada@example.com");
    await ui.submit(ui.container.querySelector("form"));
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
      email: "ada@example.com",
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(ui.container.querySelector('[role="status"]')).not.toBeNull();

    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe("E-mail inválido.");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe("Serviço indisponível");
    await ui.unmount();
  });

  it("uses a fallback reset error and clears notices when switching modes", async () => {
    authClient.requestPasswordReset.mockResolvedValue({ error: {} });
    const ui = await render(<AuthForm />);
    await ui.click(buttonByText(ui.container, "Esqueci minha senha"));
    await ui.input(ui.container.querySelector('input[type="email"]'), "ada@example.com");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível solicitar a redefinição.");

    await ui.click(buttonByText(ui.container, "Voltar para entrar"));
    expect(ui.container.querySelector('[role="alert"]')).toBeNull();
    await ui.unmount();
  });
});

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  ) ?? null;
}

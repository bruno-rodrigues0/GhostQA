// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "../../src/components/reset-password-form";
import { render } from "../utils/react-dom";

const { authClient, searchParams } = vi.hoisted(() => ({
  authClient: { resetPassword: vi.fn() },
  searchParams: { token: null as string | null },
}));

vi.mock("@/lib/auth-client", () => ({ authClient }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(
    searchParams.token ? `token=${searchParams.token}` : "",
  ),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href }, children),
}));

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    searchParams.token = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports missing/expired tokens and disables submission", async () => {
    const ui = await render(<ResetPasswordForm />);
    const submit = ui.container.querySelector("button");
    expect(submit?.disabled).toBe(true);

    await ui.submit(ui.container.querySelector("form"));

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("O link de redefinição é inválido ou expirou.");
    expect(authClient.resetPassword).not.toHaveBeenCalled();
    await ui.unmount();
  });

  it("updates the password, shows success and offers a login link", async () => {
    searchParams.token = "valid-token";
    authClient.resetPassword.mockResolvedValue({});
    const ui = await render(<ResetPasswordForm />);

    expect(ui.container.querySelector("button")?.disabled).toBe(false);
    await ui.input(ui.container.querySelector("input"), "a-new-secure-password");
    await ui.submit(ui.container.querySelector("form"));

    expect(authClient.resetPassword).toHaveBeenCalledWith({
      newPassword: "a-new-secure-password",
      token: "valid-token",
    });
    expect(ui.container.querySelector('[role="status"]')?.textContent)
      .toBe("Senha atualizada com sucesso.");
    expect(
      [...ui.container.querySelectorAll('a[href="/login"]')].some(
        (link) => link.textContent === "Entrar",
      ),
    ).toBe(true);
    await ui.unmount();
  });

  it("shows API fallback and explicit errors without changing the form", async () => {
    searchParams.token = "valid-token";
    authClient.resetPassword
      .mockResolvedValueOnce({ error: {} })
      .mockRejectedValueOnce(new Error("Token expirado"));
      const ui = await render(<ResetPasswordForm />);

    await ui.input(ui.container.querySelector("input"), "a-new-secure-password");
    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível redefinir a senha.");

    await ui.submit(ui.container.querySelector("form"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Token expirado");
    expect(ui.container.querySelector("form")).not.toBeNull();
    await ui.unmount();
  });

  it("uses a fallback for unexpected thrown values", async () => {
    searchParams.token = "valid-token";
    authClient.resetPassword.mockRejectedValue("failure");
    const ui = await render(<ResetPasswordForm />);

    await ui.input(ui.container.querySelector("input"), "a-new-secure-password");
    await ui.submit(ui.container.querySelector("form"));

    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível redefinir a senha.");
    await ui.unmount();
  });
});

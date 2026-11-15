// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminUsers } from "../../src/components/admin-users";
import { render } from "../utils/react-dom";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function buttonByText(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  ) ?? null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminUsers", () => {
  it("loads account rows, records a grant note and refreshes the list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          id: "free-user",
          name: "Free User",
          email: "free@example.com",
          plan: "free",
          grant: null,
        },
        {
          id: "pro-user",
          name: "Pro User",
          email: "pro@example.com",
          plan: "pro",
          grant: { note: "Pilot", createdAt: "2026-01-01" },
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: "free-user",
          name: "Free User",
          email: "free@example.com",
          plan: "pro",
          grant: { note: "Trial", createdAt: "2026-01-02" },
        },
      ]));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AdminUsers />);

    expect(ui.container.textContent).toContain("Free User");
    expect(ui.container.textContent).toContain("Nota: Pilot");
    expect(ui.container.textContent).toContain("Revogar Pro");
    await ui.input(ui.container.querySelector("input"), " Trial ");
    await ui.click(buttonByText(ui.container, "Conceder Pro"));

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "free-user", plan: "pro", note: " Trial " }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ui.container.textContent).toContain("Nota: Trial");
    await ui.unmount();
  });

  it("shows loading and handles API and transport failures when listing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Admin only" }, false))
      .mockResolvedValueOnce(jsonResponse([], false))
      .mockRejectedValueOnce("network failure");
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AdminUsers />);

    expect(ui.container.textContent).toContain("Admin only");
    await ui.unmount();

    const fallbackUI = await render(<AdminUsers />);
    expect(fallbackUI.container.textContent).toContain("Não foi possível carregar as contas.");
    await fallbackUI.unmount();

    const networkUI = await render(<AdminUsers />);
    expect(networkUI.container.textContent).toContain("Não foi possível carregar as contas.");
    await networkUI.unmount();
  });

  it("revokes a Pro grant and reports server errors from plan changes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        id: "pro-user",
        name: "Pro User",
        email: "pro@example.com",
        plan: "pro",
        grant: null,
      }]))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse([{
        id: "free-user",
        name: "Free User",
        email: "free@example.com",
        plan: "free",
        grant: null,
      }]))
      .mockResolvedValueOnce(jsonResponse({ error: "Grant denied" }, false));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AdminUsers />);

    await ui.click(buttonByText(ui.container, "Revogar Pro"));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/users", expect.objectContaining({
      body: JSON.stringify({ userId: "pro-user", plan: "free", note: "" }),
    }));

    await ui.click(buttonByText(ui.container, "Conceder Pro"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe("Grant denied");
    await ui.unmount();
  });

  it("uses a fallback when a plan update fails without a response message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        id: "free-user",
        name: "Free User",
        email: "free@example.com",
        plan: "free",
        grant: null,
      }]))
      .mockResolvedValueOnce(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);
    const ui = await render(<AdminUsers />);

    await ui.click(buttonByText(ui.container, "Conceder Pro"));
    expect(ui.container.querySelector('[role="alert"]')?.textContent)
      .toBe("Não foi possível alterar o plano.");
    await ui.unmount();
  });
});

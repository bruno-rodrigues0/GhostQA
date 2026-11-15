import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, plans, navigation, components } = vi.hoisted(() => ({
  auth: {
    getCurrentUser: vi.fn(),
    isAdminEmail: vi.fn(),
  },
  plans: { getUserMonthlyUsage: vi.fn() },
  navigation: { redirect: vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }) },
  components: {
    MissionControl: vi.fn(),
    AuditHistory: vi.fn(),
    RunReport: vi.fn(),
    AdminUsers: vi.fn(),
    AuthForm: vi.fn(),
    ResetPasswordForm: vi.fn(),
  },
}));

vi.mock("@/lib/auth-session", () => auth);
vi.mock("@/lib/plan-limits", () => plans);
vi.mock("next/navigation", () => navigation);
vi.mock("@/components/mission-control", () => components);
vi.mock("@/components/audit-history", () => components);
vi.mock("@/components/run-report", () => components);
vi.mock("@/components/admin-users", () => components);
vi.mock("@/components/auth-form", () => components);
vi.mock("@/components/reset-password-form", () => components);
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import Home from "../../src/app/page";
import AuditsPage from "../../src/app/audits/page";
import LoginPage from "../../src/app/login/page";
import ResetPasswordPage from "../../src/app/reset-password/page";
import RunPage from "../../src/app/runs/[id]/page";
import AdminPage from "../../src/app/admin/page";

const user = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue(user);
  auth.isAdminEmail.mockReturnValue(true);
  plans.getUserMonthlyUsage.mockResolvedValue({ plan: "free", used: 1, limit: 5 });
});

describe("server-rendered app pages", () => {
  it("redirects anonymous home visitors and loads account usage for signed-in users", async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    await expect(Home()).rejects.toThrow("redirect:/login");

    const result = await Home();
    expect(plans.getUserMonthlyUsage).toHaveBeenCalledWith("user-1");
    expect(result.type).toBe(components.MissionControl);
    expect(result.props).toMatchObject({
      user: { name: "Test User", email: "test@example.com" },
      account: { plan: "free", used: 1 },
      isAdmin: true,
    });
  });

  it("requires authentication for audit history and individual run reports", async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AuditsPage()).rejects.toThrow("redirect:/login");

    auth.getCurrentUser.mockResolvedValueOnce(user);
    const audits = await AuditsPage();
    expect(audits.type).toBe(components.AuditHistory);

    auth.getCurrentUser.mockResolvedValueOnce(null);
    await expect(RunPage({ params: Promise.resolve({ id: "run-1" }) }))
      .rejects.toThrow("redirect:/login");

    auth.getCurrentUser.mockResolvedValueOnce(user);
    const report = await RunPage({ params: Promise.resolve({ id: "run-2" }) });
    expect(report.type).toBe(components.RunReport);
    expect(report.props).toEqual({ sessionId: "run-2" });
  });

  it("redirects signed-in login users and shows the login form to guests", async () => {
    await expect(LoginPage()).rejects.toThrow("redirect:/");
    auth.getCurrentUser.mockResolvedValueOnce(null);
    const result = await LoginPage();
    expect(result.type).toBe(components.AuthForm);
  });

  it("restricts the admin page to authenticated administrators", async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AdminPage()).rejects.toThrow("redirect:/login");

    auth.getCurrentUser.mockResolvedValueOnce(user);
    auth.isAdminEmail.mockReturnValueOnce(false);
    await expect(AdminPage()).rejects.toThrow("redirect:/");

    auth.getCurrentUser.mockResolvedValueOnce(user);
    const page = await AdminPage();
    expect(page.type).toBe("main");
    const adminUsersElement = React.Children.toArray(
      page.props.children.props.children,
    ).find(
      (child) =>
        React.isValidElement(child) && child.type === components.AdminUsers,
    );
    expect(adminUsersElement).toBeDefined();
  });

  it("wraps reset-password content in a suspense boundary", () => {
    const page = ResetPasswordPage();
    expect(page.type).toBe(React.Suspense);
    expect(page.props.children.type).toBe(components.ResetPasswordForm);
    expect(page.props.fallback.props.children).toBe("Carregando...");
  });
});

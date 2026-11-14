import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail } from "../../src/lib/auth-session";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin allowlist", () => {
  it("compares normalized email addresses against server configuration", () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com, OWNER@example.com ");

    expect(isAdminEmail(" Admin@Example.com ")).toBe(true);
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("does not grant administration when the allowlist is empty", () => {
    vi.stubEnv("ADMIN_EMAILS", "");

    expect(isAdminEmail("admin@example.com")).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const { betterAuth, prismaAdapter, sendAuthEmail } = vi.hoisted(() => ({
  betterAuth: vi.fn((configuration: unknown) => ({ configuration })),
  prismaAdapter: vi.fn(() => ({ adapter: "prisma" })),
  sendAuthEmail: vi.fn(),
}));

vi.mock("better-auth", () => ({ betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter }));
vi.mock("@/lib/email", () => ({ sendAuthEmail }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: {} } }));

import { getAuth } from "../../src/lib/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("authentication server configuration", () => {
  it("requires a sufficiently long secret and a base URL", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "short");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => getAuth()).toThrow(
      "BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres.",
    );

    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(() => getAuth()).toThrow("BETTER_AUTH_URL não está configurada.");
  });

  it("configures verified email/password sessions and sends both email types", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "https://bunter.example");

    const result = getAuth();
    expect(betterAuth).toHaveBeenCalledOnce();
    const configuration = vi.mocked(betterAuth).mock.calls[0][0] as {
      baseURL: string;
      emailAndPassword: {
        enabled: boolean;
        minPasswordLength: number;
        requireEmailVerification: boolean;
        sendResetPassword: (input: { user: { email: string }; url: string }) => Promise<void>;
      };
      emailVerification: {
        sendOnSignUp: boolean;
        sendOnSignIn: boolean;
        autoSignInAfterVerification: boolean;
        sendVerificationEmail: (input: { user: { email: string }; url: string }) => Promise<void>;
      };
      session: { expiresIn: number; updateAge: number };
      advanced: { cookiePrefix: string };
    };
    expect(configuration).toMatchObject({
      baseURL: "https://bunter.example",
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        requireEmailVerification: true,
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
      },
      session: { expiresIn: 604800, updateAge: 86400 },
      advanced: { cookiePrefix: "bunter" },
    });

    await configuration.emailAndPassword.sendResetPassword({
      user: { email: "person@example.com" },
      url: "https://bunter.example/reset",
    });
    await configuration.emailVerification.sendVerificationEmail({
      user: { email: "person@example.com" },
      url: "https://bunter.example/verify",
    });
    expect(sendAuthEmail).toHaveBeenNthCalledWith(1, {
      to: "person@example.com",
      subject: "Redefinição de senha do Bunter",
      url: "https://bunter.example/reset",
    });
    expect(sendAuthEmail).toHaveBeenNthCalledWith(2, {
      to: "person@example.com",
      subject: "Confirme seu e-mail do Bunter",
      url: "https://bunter.example/verify",
    });
    expect(result).toHaveProperty("configuration");
  });
});

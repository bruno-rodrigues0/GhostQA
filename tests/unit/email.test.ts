import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import { sendAuthEmail } from "../../src/lib/email";

beforeEach(() => {
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_FROM", "Bunter <noreply@example.com>");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
  createTransport.mockReturnValue({ sendMail });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("authentication email delivery", () => {
  it("requires host and sender configuration", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendAuthEmail({
      to: "user@example.com",
      subject: "Verify",
      url: "https://example.com/verify",
    })).rejects.toThrow("SMTP_HOST e SMTP_FROM são necessários");

    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_FROM", "");
    await expect(sendAuthEmail({
      to: "user@example.com",
      subject: "Verify",
      url: "https://example.com/verify",
    })).rejects.toThrow("SMTP_HOST e SMTP_FROM são necessários");
  });

  it("rejects invalid ports and incomplete SMTP credentials", async () => {
    for (const port of ["0", "65536", "587.5", "invalid"]) {
      vi.stubEnv("SMTP_PORT", port);
      await expect(sendAuthEmail({
        to: "user@example.com",
        subject: "Verify",
        url: "https://example.com/verify",
      })).rejects.toThrow("SMTP_PORT precisa ser um número de porta válido.");
    }

    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "bunter");
    await expect(sendAuthEmail({
      to: "user@example.com",
      subject: "Verify",
      url: "https://example.com/verify",
    })).rejects.toThrow("Configure SMTP_USER e SMTP_PASSWORD juntos.");
  });

  it("sends a plain-text message with optional authentication and secure port defaults", async () => {
    await sendAuthEmail({
      to: "user@example.com",
      subject: "Verify",
      url: "https://example.com/verify",
    });
    expect(createTransport).toHaveBeenNthCalledWith(1, {
      host: "smtp.example.com",
      port: 587,
      secure: false,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Bunter <noreply@example.com>",
      to: "user@example.com",
      subject: "Verify",
      text: "Verify\n\nAcesse o link para continuar:\nhttps://example.com/verify\n\nSe você não solicitou esta ação, ignore esta mensagem.",
    });

    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "bunter");
    vi.stubEnv("SMTP_PASSWORD", "secret");
    await sendAuthEmail({
      to: "user@example.com",
      subject: "Reset",
      url: "https://example.com/reset",
    });
    expect(createTransport).toHaveBeenNthCalledWith(2, {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "bunter", pass: "secret" },
    });
  });

  it("propagates delivery failures", async () => {
    const failure = new Error("SMTP unavailable");
    sendMail.mockRejectedValue(failure);
    await expect(sendAuthEmail({
      to: "user@example.com",
      subject: "Verify",
      url: "https://example.com/verify",
    })).rejects.toBe(failure);
  });
});

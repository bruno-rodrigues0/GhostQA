import { describe, expect, it } from "vitest";
import { authClient } from "../../src/lib/auth-client";

describe("authentication client", () => {
  it("creates the browser authentication client", () => {
    expect(authClient).toBeDefined();
    expect(authClient.signIn.email).toBeTypeOf("function");
    expect(authClient.signUp.email).toBeTypeOf("function");
    expect(authClient.resetPassword).toBeTypeOf("function");
    expect(authClient.requestPasswordReset).toBeTypeOf("function");
  });
});

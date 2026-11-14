import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../../middleware";

describe("public screenshot migration guard", () => {
  it("blocks old static screenshot URLs", () => {
    const request = new NextRequest(
      "http://localhost/runs/e607b668-fca3-4f4f-9b99-80a3cc74f410/apressado/apressado-step-1-clean.png",
    );

    const response = middleware(request);

    expect(response.status).toBe(404);
  });

  it("does not block authenticated report pages", () => {
    const request = new NextRequest(
      "http://localhost/runs/e607b668-fca3-4f4f-9b99-80a3cc74f410",
    );

    const response = middleware(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

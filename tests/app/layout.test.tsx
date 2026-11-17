import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: vi.fn(() => ({ variable: "font-geist-test" })),
}));

import RootLayout, { metadata } from "../../src/app/layout";

describe("root layout", () => {
  it("sets the product metadata and wraps content with the localized document shell", () => {
    const page = RootLayout({ children: React.createElement("main", null, "content") });

    expect(metadata).toEqual({
      title: "Bunter | Mission Control",
      description: "Auditoria comportamental de UX com personas sintéticas.",
    });
    expect(page.type).toBe("html");
    expect(page.props.lang).toBe("pt-BR");
    expect(page.props.className).toContain("dark");
    expect(page.props.className).toContain("font-geist-test");
    expect(page.props.children.type).toBe("body");
    expect(page.props.children.props.children.props.children).toBe("content");
  });
});

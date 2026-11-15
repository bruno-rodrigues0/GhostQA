// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "../../src/components/ui/button";
import { render } from "../utils/react-dom";

describe("Button", () => {
  it("applies default and custom variants and sizes", async () => {
    const defaultClasses = buttonVariants();
    expect(defaultClasses).toContain("bg-primary");
    expect(buttonVariants({ variant: "outline", size: "xs" })).toContain("border-border");
    expect(buttonVariants({ variant: "secondary", size: "sm" })).toContain("bg-secondary");
    expect(buttonVariants({ variant: "ghost", size: "lg" })).toContain("hover:bg-muted");
    expect(buttonVariants({ variant: "destructive", size: "icon" })).toContain("bg-destructive/10");
    expect(buttonVariants({ variant: "link", size: "icon-xs" })).toContain("underline-offset-4");
    expect(buttonVariants({ size: "icon-sm" })).toContain("size-7");
    expect(buttonVariants({ size: "icon-lg", className: "custom-class" }))
      .toContain("custom-class");

    const ui = await render(<Button type="button" variant="outline" size="sm">Continue</Button>);
    const button = ui.container.querySelector("button");
    expect(button?.textContent).toBe("Continue");
    expect(button?.getAttribute("data-slot")).toBe("button");
    expect(button?.className).toContain("border-border");
    await ui.unmount();
  });
});

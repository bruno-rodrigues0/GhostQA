import { describe, expect, it } from "vitest";
import { cn } from "../../src/lib/utils";

describe("class name helper", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("p-2", false && "hidden", "text-sm", "p-4")).toBe("text-sm p-4");
    expect(cn(["flex", "items-center"], { hidden: true, block: false }))
      .toBe("items-center hidden");
  });
});

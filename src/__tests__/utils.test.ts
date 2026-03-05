import { describe, expect, test } from "bun:test";
import { cn } from "../client/lib/utils.ts";

describe("utils", () => {
  test("cn joins plain class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  test("cn resolves conflicting Tailwind utilities", () => {
    expect(cn("px-2", "px-4", "text-sm", "text-lg")).toBe("px-4 text-lg");
  });

  test("cn ignores nullish and falsy conditional inputs", () => {
    expect(cn("base", undefined, null, false, ["active", 0 && "hidden"])).toBe("base active");
  });
});

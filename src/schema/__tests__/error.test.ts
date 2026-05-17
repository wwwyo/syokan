import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { formatValidationError } from "@/schema";

describe("formatValidationError", () => {
  test("returns one issue per zod issue with path and message", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ name: 1, age: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues).toHaveLength(2);
      expect(issues[0]?.path).toEqual(["name"]);
      expect(issues[0]?.code).toBe("invalid_type");
      expect(issues[1]?.path).toEqual(["age"]);
    }
  });

  test("path includes numeric array indices", () => {
    const schema = z.array(z.object({ id: z.string() }));
    const result = schema.safeParse([{ id: 1 }, { id: "ok" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues[0]?.path).toEqual([0, "id"]);
    }
  });

  test("includes expected type for invalid_type issues", () => {
    const schema = z.string();
    const result = schema.safeParse(42);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues[0]?.expected).toBe("string");
    }
  });

  test("returns empty array for empty error", () => {
    const schema = z.string();
    const result = schema.safeParse("ok");
    expect(result.success).toBe(true);
  });
});

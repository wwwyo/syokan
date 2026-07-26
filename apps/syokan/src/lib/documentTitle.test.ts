import { describe, expect, test } from "bun:test";
import { formatDocumentTitle } from "./documentTitle";

describe("formatDocumentTitle", () => {
  test("suffixes the view title with the app name", () => {
    expect(formatDocumentTitle("Daily RSS")).toBe("Daily RSS | syokan");
  });

  test("falls back to the bare app name for an absent or blank title", () => {
    expect(formatDocumentTitle(undefined)).toBe("syokan");
    expect(formatDocumentTitle("")).toBe("syokan");
    expect(formatDocumentTitle("   ")).toBe("syokan");
  });

  test("trims surrounding whitespace", () => {
    expect(formatDocumentTitle("  PR review  ")).toBe("PR review | syokan");
  });
});

import { describe, expect, test } from "bun:test";
import { formatDateTime } from "./date";

describe("formatDateTime", () => {
  test("formats an ISO string to YYYY-MM-DD HH:mm", () => {
    const out = formatDateTime("2026-05-21T12:34:00Z");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // noon UTC stays on the same date across the usual TZ offset range
    expect(out.startsWith("2026-05-21")).toBe(true);
  });

  test("zero-pads single-digit month/day to two digits", () => {
    // noon UTC: the date stays 2026-01-02 regardless of TZ
    const out = formatDateTime("2026-01-02T12:00:00Z");
    expect(out.startsWith("2026-01-02 ")).toBe(true);
  });

  test("returns the raw string when the input is unparseable", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("")).toBe("");
  });
});

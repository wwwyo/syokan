import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Time } from ".";

describe("Time", () => {
  test("renders a <time> with the machine-readable dateTime attribute", () => {
    const html = renderToString(
      createElement(Time, { datetime: "2026-05-21T03:04:00Z" }),
    );
    expect(html).toContain("<time");
    expect(html).toContain('dateTime="2026-05-21T03:04:00Z"');
  });

  test("renders the formatted text, not the raw ISO string", () => {
    const html = renderToString(
      createElement(Time, { datetime: "2026-05-21T03:04:00Z" }),
    );
    // formatDateTime is "YYYY-MM-DD HH:mm" (no T/Z). Verify only the format, avoiding TZ dependence
    expect(html).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(html).not.toContain("T03:04:00Z<");
  });

  test("muted applies the muted foreground class", () => {
    const el = Time({ datetime: "2026-05-21T03:04:00Z", muted: true });
    expect((el.props as { className: string }).className).toContain(
      "text-muted-foreground",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Probe, probePropsSchema } from ".";
import { probeCheckSchema } from "./check";

describe("probeCheckSchema", () => {
  test("accepts the three predefined kinds", () => {
    expect(
      probeCheckSchema.safeParse({
        kind: "diff_clean",
        repo: "/repo",
        base: "main",
        paths: ["src/a.ts"],
      }).success,
    ).toBe(true);
    expect(
      probeCheckSchema.safeParse({
        kind: "search_count",
        path: "/repo/src",
        pattern: "TODO",
        expected: 0,
        op: "max",
      }).success,
    ).toBe(true);
    expect(
      probeCheckSchema.safeParse({ kind: "file_exists", path: "/repo/README.md" })
        .success,
    ).toBe(true);
  });

  test("rejects arbitrary commands and relative paths", () => {
    expect(
      probeCheckSchema.safeParse({ kind: "shell", command: "rm -rf /" }).success,
    ).toBe(false);
    expect(
      probeCheckSchema.safeParse({
        kind: "file_exists",
        path: "relative/path",
      }).success,
    ).toBe(false);
  });
});

describe("probePropsSchema", () => {
  test("accepts a generation-time result and shareVisible", () => {
    const result = probePropsSchema.safeParse({
      label: "no stray console.log",
      check: {
        kind: "search_count",
        path: "/repo/src",
        pattern: "console.log",
        expected: 0,
      },
      result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
      shareVisible: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("Probe", () => {
  const check = {
    kind: "search_count" as const,
    path: "/repo/src",
    pattern: "console.log",
    expected: 0,
  };

  test("always shows what would run (kind and args)", () => {
    const html = renderToString(createElement(Probe, { check }));
    expect(html).toContain("search_count");
    expect(html).toContain("console.log");
    expect(html).toContain("/repo/src");
    expect(html).toContain("re-run");
  });

  test("shows the generation-time result status", () => {
    const html = renderToString(
      createElement(Probe, {
        check,
        result: {
          status: "pass" as const,
          detail: "0 matches in 12 files",
          ranAt: "2026-07-06T00:00:00Z",
        },
      }),
    );
    expect(html).toContain("pass");
    expect(html).toContain("0 matches in 12 files");
  });

  test("without a result shows not run", () => {
    const html = renderToString(createElement(Probe, { check }));
    expect(html).toContain("not run");
  });
});

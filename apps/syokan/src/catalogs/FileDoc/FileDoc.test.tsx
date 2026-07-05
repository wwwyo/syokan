import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FileDocBody, fileDocPropsSchema, reasonFromStatus } from ".";

function html(path: string, state: Parameters<typeof FileDocBody>[0]["state"]) {
  return renderToString(createElement(FileDocBody, { path, state }));
}

describe("fileDocPropsSchema", () => {
  test("accepts a path, rejects empty / extra keys", () => {
    expect(fileDocPropsSchema.safeParse({ path: "/a/b.md" }).success).toBe(true);
    expect(fileDocPropsSchema.safeParse({ path: "" }).success).toBe(false);
    expect(fileDocPropsSchema.safeParse({}).success).toBe(false);
    expect(
      fileDocPropsSchema.safeParse({ path: "/a", as: "markdown" }).success,
    ).toBe(false);
  });
});

describe("reasonFromStatus", () => {
  test("prefers a known body.error", () => {
    expect(reasonFromStatus(500, { error: "not_text" })).toBe("not_text");
  });

  test("falls back to the status when the body is unreadable", () => {
    expect(reasonFromStatus(413, null)).toBe("too_large");
    expect(reasonFromStatus(415, null)).toBe("not_text");
    expect(reasonFromStatus(422, null)).toBe("not_regular_file");
    expect(reasonFromStatus(403, null)).toBe("permission_denied");
  });

  test("unknown status → generic error", () => {
    expect(reasonFromStatus(500, null)).toBe("error");
  });
});

describe("FileDocBody", () => {
  test("loading shows a placeholder", () => {
    expect(html("/a/notes.md", { kind: "loading" })).toContain(
      'data-slot="file-doc-loading"',
    );
  });

  test("error shows the message and the path", () => {
    const out = html("/a/missing.md", { kind: "error", reason: "not_found" });
    expect(out).toContain('data-slot="file-doc-error"');
    expect(out).toContain("File not found");
    expect(out).toContain("/a/missing.md");
  });

  test("markdown extension renders MarkdownDoc", () => {
    const out = html("/a/notes.md", { kind: "ok", content: "# Title" });
    expect(out).toContain('data-slot="markdown-doc"');
  });

  test(".json renders as Code", () => {
    const out = html("/a/config.json", { kind: "ok", content: '{"a":1}' });
    expect(out).toContain('data-slot="code"');
  });

  test(".log / unknown renders as PlainText", () => {
    const out = html("/a/app.log", { kind: "ok", content: "line" });
    expect(out).toContain('data-slot="plain-text"');
  });
});

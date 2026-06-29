import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FileDocBody, fileDocPropsSchema } from ".";

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

describe("FileDocBody", () => {
  test("loading shows a placeholder", () => {
    expect(html("/a/notes.md", { kind: "loading" })).toContain(
      'data-slot="file-doc-loading"',
    );
  });

  test("error shows the message and the path", () => {
    const out = html("/a/missing.md", { kind: "error", reason: "not_found" });
    expect(out).toContain('data-slot="file-doc-error"');
    expect(out).toContain("見つかりません");
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

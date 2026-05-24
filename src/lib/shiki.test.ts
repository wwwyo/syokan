import { describe, expect, test } from "bun:test";
import { highlightToHtml } from "./shiki";

describe("highlightToHtml", () => {
  test("produces a dual-theme shiki <pre> with token spans", async () => {
    const html = await highlightToHtml("const x: number = 1;", "ts");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("shiki-themes");
    // dual theme CSS variables (defaultColor:false)
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
    expect(html).toContain("const");
  });

  test("falls back to plaintext for an unknown language without throwing", async () => {
    const html = await highlightToHtml("just some text", "made-up-lang");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("just some text");
  });

  test("highlights bash", async () => {
    const html = await highlightToHtml("echo hello", "bash");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("echo");
  });
});

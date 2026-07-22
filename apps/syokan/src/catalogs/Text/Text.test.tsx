import { describe, expect, test } from "bun:test";
import { Text } from ".";

describe("Text", () => {
  test("renders the body", () => {
    const el = Text({ body: "hello" });
    expect((el.props as { children: string }).children).toBe("hello");
  });

  test("muted applies the muted foreground class", () => {
    const el = Text({ body: "x", muted: true });
    expect((el.props as { className: string }).className).toContain(
      "text-muted-foreground",
    );
  });

  test("body without newlines renders a single p unchanged", () => {
    const el = Text({ body: "no line breaks here" });
    expect(el.type).toBe("p");
    expect((el.props as { children: unknown }).children).toBe(
      "no line breaks here",
    );
  });

  test("a single newline becomes a <br> within the same p", () => {
    const el = Text({ body: "line one\nline two" });
    expect(el.type).toBe("p");
    const children = (el.props as { children: unknown[] }).children;
    expect(children).toEqual([
      "line one",
      expect.objectContaining({ type: "br" }),
      "line two",
    ]);
  });

  test("a blank line (\\n\\n) splits the body into separate p elements", () => {
    const el = Text({ body: "first paragraph\n\nsecond paragraph" });
    expect(el.type).toBe("div");
    const paragraphs = (el.props as { children: unknown[] }).children;
    expect(paragraphs).toHaveLength(2);
    expect(
      (paragraphs as { type: string; props: { children: string } }[]).map(
        (p) => p.props.children,
      ),
    ).toEqual(["first paragraph", "second paragraph"]);
    expect(
      (paragraphs as { props: { "data-slot": string } }[]).every(
        (p) => p.props["data-slot"] === "text",
      ),
    ).toBe(true);
  });

  test("leading/trailing newlines and runs of 3+ newlines don't produce empty paragraphs", () => {
    const el = Text({ body: "\n\na\n\n\nb\n\n" });
    expect(el.type).toBe("div");
    const paragraphs = (el.props as { children: unknown[] }).children;
    expect(paragraphs).toHaveLength(2);
    expect(
      (paragraphs as { props: { children: string } }[]).map(
        (p) => p.props.children,
      ),
    ).toEqual(["a", "b"]);
  });

  test("muted applies to every paragraph when there are multiple", () => {
    const el = Text({ body: "one\n\ntwo", muted: true });
    const paragraphs = (el.props as { children: unknown[] }).children;
    expect(
      (paragraphs as { props: { className: string } }[]).every((p) =>
        p.props.className.includes("text-muted-foreground"),
      ),
    ).toBe(true);
  });

  test("a lone newline renders a single empty p, not a <br>", () => {
    const el = Text({ body: "\n" });
    expect(el.type).toBe("p");
    expect((el.props as { children: unknown }).children).toBe("");
  });

  test("two newlines (\\n\\n) with nothing else render a single empty p, not a <br>", () => {
    const el = Text({ body: "\n\n" });
    expect(el.type).toBe("p");
    expect((el.props as { children: unknown }).children).toBe("");
  });

  test("CRLF soft break renders one <br>, same as LF", () => {
    const el = Text({ body: "a\r\nb" });
    expect(el.type).toBe("p");
    const children = (el.props as { children: unknown[] }).children;
    expect(children).toEqual([
      "a",
      expect.objectContaining({ type: "br" }),
      "b",
    ]);
  });

  test("CRLF paragraph break splits into two p elements, same as LF", () => {
    const el = Text({ body: "a\r\n\r\nb" });
    expect(el.type).toBe("div");
    const paragraphs = (el.props as { children: unknown[] }).children;
    expect(
      (paragraphs as { props: { children: string } }[]).map(
        (p) => p.props.children,
      ),
    ).toEqual(["a", "b"]);
  });
});

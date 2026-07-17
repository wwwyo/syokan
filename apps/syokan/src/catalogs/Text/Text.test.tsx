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
});

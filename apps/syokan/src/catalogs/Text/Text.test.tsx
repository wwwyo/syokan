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

  test("clamp applies line-clamp-3", () => {
    const el = Text({ body: "x", clamp: true });
    expect((el.props as { className: string }).className).toContain(
      "line-clamp-3",
    );
  });
});

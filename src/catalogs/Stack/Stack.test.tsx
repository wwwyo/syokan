import { describe, expect, test } from "bun:test";
import { ResizablePanelGroup } from "@/components/ui/resizable";
import { Stack } from ".";

describe("Stack", () => {
  test("defaults to a plain vertical flex stack", () => {
    const el = Stack({ children: null });
    expect(el.type).toBe("div");
    expect((el.props as { className: string }).className).toContain("flex-col");
  });

  test("horizontal direction switches to flex-row", () => {
    const el = Stack({ direction: "horizontal", children: null });
    expect((el.props as { className: string }).className).toContain("flex-row");
  });

  test("resizable=true renders a ResizablePanelGroup with the matching orientation", () => {
    const el = Stack({
      resizable: true,
      direction: "horizontal",
      children: null,
    });
    expect(el.type).toBe(ResizablePanelGroup);
    expect((el.props as { orientation: string }).orientation).toBe("horizontal");
  });

  test("vertical resizable gets a minimum height so panels do not collapse", () => {
    const el = Stack({ resizable: true, direction: "vertical", children: null });
    expect((el.props as { className: string }).className).toContain("min-h");
  });

  test("horizontal resizable forces no height (content-driven)", () => {
    const el = Stack({
      resizable: true,
      direction: "horizontal",
      children: null,
    });
    expect((el.props as { className: string }).className).not.toContain("min-h");
  });
});

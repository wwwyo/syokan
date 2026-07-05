import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createCatalog, defineComponent } from "./catalog";
import { formatValidationError } from "./error";

const TextSpec = defineComponent({
  type: "Text",
  propsSchema: z
    .object({
      content: z.string().min(1),
    })
    .strict(),
});

const ContainerSpec = defineComponent({
  type: "Container",
  propsSchema: z.object({}).strict(),
});

describe("createCatalog", () => {
  test("parses valid tree with nested children", () => {
    const { itemSchema } = createCatalog([TextSpec, ContainerSpec]);
    const parsed = itemSchema.parse({
      type: "Container",
      props: {},
      children: [{ type: "Text", props: { content: "hello" } }],
    });
    expect(parsed.type).toBe("Container");
    expect(parsed.children?.[0]?.type).toBe("Text");
  });

  test("registry exposes specs by type", () => {
    const { registry } = createCatalog([TextSpec, ContainerSpec]);
    expect(registry.get("Text")).toBe(TextSpec);
    expect(registry.get("Container")).toBe(ContainerSpec);
    expect(registry.get("Unknown")).toBeUndefined();
  });

  test("rejects unknown component types with path on discriminator", () => {
    const { itemSchema } = createCatalog([TextSpec, ContainerSpec]);
    const result = itemSchema.safeParse({
      type: "Unknown",
      props: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.path).toEqual(["type"]);
    }
  });

  test("rejects invalid props with full path including field name", () => {
    const { itemSchema } = createCatalog([TextSpec]);
    const result = itemSchema.safeParse({
      type: "Text",
      props: { content: 123 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      const contentIssue = issues.find(
        (i) => i.path[0] === "props" && i.path[1] === "content",
      );
      expect(contentIssue).toBeDefined();
      expect(contentIssue?.expected).toBe("string");
    }
  });

  test("recursive children validation surfaces nested path", () => {
    const { itemSchema } = createCatalog([TextSpec, ContainerSpec]);
    const result = itemSchema.safeParse({
      type: "Container",
      props: {},
      children: [
        { type: "Container", props: {} },
        { type: "Text", props: { content: 999 } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      const nested = issues.find(
        (i) =>
          i.path[0] === "children" &&
          i.path[1] === 1 &&
          i.path[2] === "props" &&
          i.path[3] === "content",
      );
      expect(nested).toBeDefined();
    }
  });

  test("rejects unknown props when spec is strict", () => {
    const { itemSchema } = createCatalog([TextSpec]);
    const result = itemSchema.safeParse({
      type: "Text",
      props: { content: "ok", extra: "nope" },
    });
    expect(result.success).toBe(false);
  });

  test("throws on empty catalog", () => {
    expect(() => createCatalog([])).toThrow(/at least one/);
  });

  test("throws on duplicate component types", () => {
    const Dup = defineComponent({
      type: "Text",
      propsSchema: z.object({}).strict(),
    });
    expect(() => createCatalog([TextSpec, Dup])).toThrow(/duplicate/);
  });

  test("supports catalog with single component", () => {
    const { itemSchema } = createCatalog([TextSpec]);
    const parsed = itemSchema.parse({ type: "Text", props: { content: "hi" } });
    expect(parsed.type).toBe("Text");
  });

  test("rejects unknown fields on item node (no silent strip)", () => {
    const { itemSchema } = createCatalog([TextSpec]);
    const result = itemSchema.safeParse({
      type: "Text",
      props: { content: "hi" },
      childen: [],
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional key on item node and exposes it on the parsed value", () => {
    const { itemSchema } = createCatalog([TextSpec, ContainerSpec]);
    const parsed = itemSchema.parse({
      type: "Container",
      props: {},
      key: "header",
      children: [
        { type: "Text", props: { content: "hi" }, key: "greeting" },
      ],
    });
    expect(parsed.key).toBe("header");
    expect(parsed.children?.[0]?.key).toBe("greeting");
  });

  test("rejects empty string key (must satisfy min(1))", () => {
    const { itemSchema } = createCatalog([TextSpec]);
    const result = itemSchema.safeParse({
      type: "Text",
      props: { content: "hi" },
      key: "",
    });
    expect(result.success).toBe(false);
  });
});

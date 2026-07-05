import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createCatalog, defineComponent } from "./catalog";
import { formatValidationError } from "./error";
import {
  CURRENT_SCHEMA_VERSION,
  createSnapshotEnvelopeSchema,
} from "./snapshot";

const TextSpec = defineComponent({
  type: "Text",
  propsSchema: z.object({ content: z.string().min(1) }).strict(),
});

const { itemSchema } = createCatalog([TextSpec]);
const envelopeSchema = createSnapshotEnvelopeSchema(itemSchema);

const baseRoot = { type: "Text", props: { content: "hello" } } as const;

describe("snapshot envelope", () => {
  test("parses fully populated envelope", () => {
    const parsed = envelopeSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc-123",
      title: "Sample",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
      metadata: { source: { label: "manual-cli" } },
    });
    expect(parsed.id).toBe("abc-123");
    expect(parsed.metadata?.source?.label).toBe("manual-cli");
  });

  test("accepts envelope without optional fields", () => {
    const parsed = envelopeSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
    });
    expect(parsed.title).toBeUndefined();
    expect(parsed.metadata).toBeUndefined();
  });

  test("rejects mismatched schemaVersion", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: 999,
      id: "abc",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues.some((i) => i.path[0] === "schemaVersion")).toBe(true);
    }
  });

  test("rejects empty id", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid createdAt", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: baseRoot,
      createdAt: "not-a-date",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues.some((i) => i.path[0] === "createdAt")).toBe(true);
    }
  });

  test("rejects unknown metadata fields (strict)", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
      metadata: { unknown: "field" },
    });
    expect(result.success).toBe(false);
  });

  test("preserves unknown fields under metadata.source (loose for future expansion)", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
      metadata: {
        source: {
          label: "rss-daily",
          url: "https://example.com/feed",
          fetchedAt: "2026-05-10T11:00:00Z",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // loose, so it's preserved rather than stripped (not silently dropped)
      const source = result.data.metadata?.source as Record<string, unknown>;
      expect(source?.url).toBe("https://example.com/feed");
      expect(source?.fetchedAt).toBe("2026-05-10T11:00:00Z");
    }
  });

  test("rejects unknown fields on envelope (no silent strip)", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: baseRoot,
      createdAt: "2026-05-10T12:00:00Z",
      extraneous: "field",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid root item via catalog", () => {
    const result = envelopeSchema.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "abc",
      root: { type: "UnknownComponent", props: {} },
      createdAt: "2026-05-10T12:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationError(result.error);
      expect(issues.some((i) => i.path[0] === "root")).toBe(true);
    }
  });
});

import { z } from "zod";
import type { Item } from "./catalog";

export const CURRENT_SCHEMA_VERSION = 1 as const;

// metadata 本体は strict (top-level に予約外 field を生やさない PRD 方針)。
// 一方 source の内側は loose にして label 以外 (url / fetchedAt 等) の後付けを
// migration なしで受け入れる。PRD #3 を一段緩めた判断 (C3=2)。
export const snapshotMetadataSchema = z
  .object({
    source: z
      .object({
        label: z.string().min(1),
      })
      .optional(),
  })
  .strict();

export type SnapshotMetadata = z.infer<typeof snapshotMetadataSchema>;

export type SnapshotEnvelope = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  title?: string;
  root: Item;
  createdAt: string;
  metadata?: SnapshotMetadata;
};

export function createSnapshotEnvelopeSchema(itemSchema: z.ZodType<Item>) {
  return z
    .object({
      schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      root: itemSchema,
      createdAt: z.iso.datetime(),
      metadata: snapshotMetadataSchema.optional(),
    })
    .strict();
}

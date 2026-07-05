import { z } from "zod";
import type { Item } from "./catalog";

export const CURRENT_SCHEMA_VERSION = 1 as const;

// metadata itself is strict (the PRD policy: no unreserved fields at the top level).
// The inside of source, on the other hand, is loose so it accepts later additions beyond
// label (url / fetchedAt etc.) without migration. A one-notch relaxation of PRD #3 (C3=2).
export const snapshotMetadataSchema = z
  .object({
    source: z
      .object({
        label: z.string().min(1),
      })
      // .loose() keeps later fields beyond label (url / fetchedAt etc.) instead of stripping them.
      // With a plain object, unknown keys are silently stripped and the stored content is lost.
      .loose()
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

// A single row of the list (GET /api/snapshots): a lightweight summary with root dropped from the envelope.
// Placing the server (store) / client (sidebar) contract in one spot prevents drift.
export type SnapshotSummary = {
  id: string;
  title?: string;
  createdAt: string;
  source?: { label: string };
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

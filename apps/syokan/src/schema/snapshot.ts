import { z } from "zod";
import type { Item } from "./catalog";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type SnapshotEnvelope = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  title?: string;
  root: Item;
  createdAt: string;
};

// A single row of the list (GET /api/snapshots): a lightweight summary with root dropped from the envelope.
// Placing the server (store) / client (sidebar) contract in one spot prevents drift.
export type SnapshotSummary = {
  id: string;
  title?: string;
  createdAt: string;
};

export function createSnapshotEnvelopeSchema(itemSchema: z.ZodType<Item>) {
  return z
    .object({
      schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      root: itemSchema,
      createdAt: z.iso.datetime(),
    })
    .strict();
}

import { z } from "zod";
import type { Item } from "./catalog";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type SnapshotEnvelope = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  title?: string;
  root: Item;
  createdAt: string;
  // When the snapshot was last archived (DELETE); null while it is active.
  archivedAt: string | null;
};

// A single row of the list (GET /api/snapshots): a lightweight summary with root dropped from the envelope.
// Placing the server (store) / client (sidebar) contract in one spot prevents drift.
export type SnapshotSummary = {
  id: string;
  title?: string;
  createdAt: string;
  archivedAt: string | null;
};

export function createSnapshotEnvelopeSchema(itemSchema: z.ZodType<Item>) {
  return z
    .object({
      schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      root: itemSchema,
      createdAt: z.iso.datetime(),
      archivedAt: z.iso.datetime().nullable(),
    })
    .strict();
}

// The POST/PUT request-body shape: distinct from the stored SnapshotEnvelope above
// (no id/createdAt; schemaVersion is optional; carries idempotencyKey instead). This is
// the SSOT published at GET /api/catalog under `envelope` (see catalogs/manifest.ts) so
// producers pull the contract from the API instead of a hand-copied doc. Tree-wide id
// uniqueness (findDuplicateId) is a cross-node invariant the schema alone can't express
// concisely, so callers layer a superRefine on top (see server/routes.ts).
export function createSnapshotInputSchema(itemSchema: z.ZodType<Item>) {
  return z
    .object({
      schemaVersion: z.literal(CURRENT_SCHEMA_VERSION).optional(),
      title: z.string().min(1).optional(),
      root: itemSchema,
      idempotencyKey: z.string().min(1).optional(),
    })
    .strict();
}

// The PATCH /api/snapshots/:id writeback body (PRD view-writeback): a conditional
// set on one item of the node's `items`. `item` identifies the item by label
// correspondence — its label appearing `occurrence`th (1-based) among same-label
// items — never by index; `expect` gates node props on their current values —
// a Checklist sends the whole `items` array it rendered (a compare-and-set), so
// a same-label insertion that would silently shift `occurrence` is refused before
// the wrong item is written. `null` in `expect` counts as "the prop is absent"
// (JSON has no undefined).
// e.g. { nodeId: "todos", item: { label: "牛乳を買う", occurrence: 2 },
//        set: { checked: true },
//        expect: { items: [ { label: "牛乳を買う", checked: false }, ... ] } }
// Declared here so the client builder (lib/snapshots.ts), the store, and the route
// validator share one contract and can't drift.
export const snapshotPatchInputSchema = z
  .object({
    nodeId: z.string().min(1),
    item: z
      .object({ label: z.unknown(), occurrence: z.number().int().min(1) })
      .strict(),
    set: z
      .record(z.string(), z.unknown())
      .refine((set) => Object.keys(set).length > 0, "set must not be empty"),
    expect: z.record(z.string(), z.unknown()),
  })
  .strict();

export type SnapshotPatchInput = z.infer<typeof snapshotPatchInputSchema>;

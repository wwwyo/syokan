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
      // .loose() で label 以外 (url / fetchedAt 等) の後付け field を strip せず保持する。
      // plain object だと unknown key は silently strip され、保存内容が欠落する。
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

// 一覧 (GET /api/snapshots) の 1 行。envelope から root を落とした軽量サマリ。
// server (store) と client (sidebar) の契約を 1 箇所に置き drift を防ぐ。
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

import type { BunRequest } from "bun";
import { z } from "zod";
import { itemSchema } from "@/catalogs";
import {
  CURRENT_SCHEMA_VERSION,
  formatValidationError,
  snapshotMetadataSchema,
} from "@/schema";
import { type SnapshotStore } from "./store";

const postInputSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION).optional(),
    title: z.string().min(1).optional(),
    root: itemSchema,
    metadata: snapshotMetadataSchema.optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();

function jsonError(
  status: number,
  payload: { error: string; [key: string]: unknown },
) {
  return Response.json(payload, { status });
}

async function readJsonBody(req: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: Response }
> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return {
      ok: false,
      response: jsonError(400, {
        error: "invalid_json",
        message: "Request body is not valid JSON",
      }),
    };
  }
}

export type ApiHandlers = {
  postItems: (req: Request) => Promise<Response>;
  listViews: () => Promise<Response>;
  getView: (req: BunRequest<"/api/views/:id">) => Promise<Response>;
  deleteView: (req: BunRequest<"/api/views/:id">) => Promise<Response>;
};

export function createApiHandlers(store: SnapshotStore): ApiHandlers {
  return {
    async postItems(req) {
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = postInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the snapshot schema",
          issues: formatValidationError(parsed.error),
        });
      }
      const input = parsed.data;
      const envelope = await store.create({
        title: input.title,
        root: input.root,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey,
      });
      return Response.json(
        {
          id: envelope.id,
          url: `/views/${envelope.id}`,
          snapshot: envelope,
        },
        { status: 201 },
      );
    },

    async listViews() {
      const items = await store.list();
      return Response.json({ items });
    },

    async getView(req) {
      const id = req.params.id;
      const env = await store.get(id);
      if (!env) {
        return jsonError(404, {
          error: "not_found",
          message: `Snapshot ${id} not found`,
        });
      }
      return Response.json(env);
    },

    async deleteView(req) {
      const id = req.params.id;
      const ok = await store.delete(id);
      if (!ok) {
        return jsonError(404, {
          error: "not_found",
          message: `Snapshot ${id} not found`,
        });
      }
      return Response.json({ ok: true });
    },
  };
}

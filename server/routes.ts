import type { BunRequest } from "bun";
import { z } from "zod";
import { itemSchema } from "@/catalogs";
import { catalogManifest } from "@/catalogs/manifest";
import {
  CURRENT_SCHEMA_VERSION,
  formatValidationError,
  snapshotMetadataSchema,
} from "@/schema";
import { type SnapshotStore } from "./store";
import { type TemplateStore } from "./templates";

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
  createSnapshot: (req: Request) => Promise<Response>;
  listSnapshots: () => Promise<Response>;
  getSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
  deleteSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
};

export function createApiHandlers(store: SnapshotStore): ApiHandlers {
  return {
    async createSnapshot(req) {
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
          url: `/snapshots/${envelope.id}`,
          snapshot: envelope,
        },
        { status: 201 },
      );
    },

    async listSnapshots() {
      const items = await store.list();
      return Response.json({ items });
    },

    async getSnapshot(req) {
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

    async deleteSnapshot(req) {
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

// catalog は src/catalogs が SSOT。定義済みの type 一覧を毎回そこから導出して返す。
export function getCatalog(): Response {
  return Response.json({ items: catalogManifest() });
}

const templateInputSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    // 中身は解釈しない保管庫だが、null/undefined は雛形として無意味なので弾く。
    json: z
      .unknown()
      .refine((v) => v !== undefined && v !== null, "json is required"),
  })
  .strict();

export type TemplateApiHandlers = {
  listTemplates: () => Promise<Response>;
  createTemplate: (req: Request) => Promise<Response>;
  getTemplate: (req: BunRequest<"/api/templates/:id">) => Promise<Response>;
  deleteTemplate: (req: BunRequest<"/api/templates/:id">) => Promise<Response>;
};

export function createTemplateHandlers(
  store: TemplateStore,
): TemplateApiHandlers {
  return {
    async listTemplates() {
      const items = await store.list();
      return Response.json({ items });
    },

    async createTemplate(req) {
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = templateInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the template schema",
          issues: formatValidationError(parsed.error),
        });
      }
      const template = await store.add(parsed.data);
      return Response.json({ id: template.id, template }, { status: 201 });
    },

    async getTemplate(req) {
      const id = req.params.id;
      const template = await store.get(id);
      if (!template) {
        return jsonError(404, {
          error: "not_found",
          message: `Template ${id} not found`,
        });
      }
      return Response.json(template);
    },

    async deleteTemplate(req) {
      const id = req.params.id;
      const ok = await store.remove(id);
      if (!ok) {
        return jsonError(404, {
          error: "not_found",
          message: `Template ${id} not found`,
        });
      }
      return Response.json({ ok: true });
    },
  };
}

import type { BunRequest } from "bun";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { itemSchema } from "../src/catalogs";
import { catalogManifest } from "../src/catalogs/manifest";
import { isFontValue } from "../src/lib/fonts";
import {
  CURRENT_SCHEMA_VERSION,
  formatValidationError,
  settingPatchSchema,
  type SnapshotEnvelope,
  snapshotMetadataSchema,
} from "../src/schema";
import {
  type FileWatcher,
  FILE_SIZE_LIMIT,
  type ReadFileFailure,
  readTextFile,
} from "./fileSource";
import { type SettingStore } from "./setting";
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

// PUT is identical to POST except it requires idempotencyKey.
const putInputSchema = postInputSchema.extend({
  idempotencyKey: z.string().min(1),
});

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

// Shared by POST/PUT: read the body and validate it against the snapshot schema.
async function parseSnapshotBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const body = await readJsonBody(req);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, {
        error: "validation_failed",
        message: "Request body does not satisfy the snapshot schema",
        issues: formatValidationError(parsed.error),
      }),
    };
  }
  return { ok: true, value: parsed.data };
}

function snapshotResponse(
  envelope: SnapshotEnvelope,
  status?: number,
): Response {
  return Response.json(
    { id: envelope.id, url: `/snapshots/${envelope.id}`, snapshot: envelope },
    status !== undefined ? { status } : undefined,
  );
}

export type ApiHandlers = {
  createSnapshot: (req: Request) => Promise<Response>;
  updateSnapshot: (req: Request) => Promise<Response>;
  listSnapshots: () => Promise<Response>;
  getSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
  deleteSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
};

export function createApiHandlers(store: SnapshotStore): ApiHandlers {
  return {
    async createSnapshot(req) {
      const body = await parseSnapshotBody(req, postInputSchema);
      if (!body.ok) return body.response;
      const envelope = await store.create(body.value);
      return snapshotResponse(envelope, 201);
    },

    // 404 if there's no match (AIP-134's Update default; use POST when you want to create).
    async updateSnapshot(req) {
      const body = await parseSnapshotBody(req, putInputSchema);
      if (!body.ok) return body.response;
      const result = await store.update(body.value);
      if (!result.ok) {
        return jsonError(404, {
          error: "not_found",
          message: `No snapshot found for idempotencyKey "${body.value.idempotencyKey}"; POST to create one`,
        });
      }
      return snapshotResponse(result.envelope);
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

// The catalog's SSOT is src/catalogs. Derive and return the list of defined types from there every time.
export function getCatalog(): Response {
  return Response.json({ items: catalogManifest() });
}

const templateInputSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    // It's a vault that doesn't interpret the contents, but null/undefined is meaningless as a template, so reject it.
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

// Map failure reasons to HTTP status codes. The client branches on status (FR-9~12).
const FILE_FAILURE_STATUS: Record<ReadFileFailure, number> = {
  not_found: 404,
  not_regular_file: 422,
  permission_denied: 403,
  too_large: 413,
  not_text: 415,
};

export type FileApiHandlers = {
  readFile: (req: Request) => Promise<Response>;
  watchFile: (req: Request) => Response;
};

// File-reference node (FileDoc) read + change watching. The read returns the body/error via GET,
// and watching notifies only "it changed" over SSE (the client re-fetches the content via GET). Watchers are
// runtime state scoped to the server process's lifetime — not persisted.
// Extract and validate the path query param. Relative paths depend on the server CWD and could point
// at an unintended file, so only absolute paths are accepted (the CLI always passes an absolute path).
function readPathParam(
  req: Request,
): { ok: true; path: string } | { ok: false; response: Response } {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) {
    return {
      ok: false,
      response: jsonError(400, {
        error: "missing_path",
        message: "query param 'path' is required",
      }),
    };
  }
  if (!isAbsolute(path)) {
    return {
      ok: false,
      response: jsonError(400, {
        error: "invalid_path",
        message: "path must be absolute",
      }),
    };
  }
  return { ok: true, path };
}

export function createFileHandlers(watcher: FileWatcher): FileApiHandlers {
  return {
    async readFile(req) {
      const param = readPathParam(req);
      if (!param.ok) return param.response;
      const result = await readTextFile(param.path);
      if (result.ok) return Response.json({ content: result.content });
      const status = FILE_FAILURE_STATUS[result.reason];
      return jsonError(status, {
        error: result.reason,
        ...(result.reason === "too_large" ? { limit: FILE_SIZE_LIMIT } : {}),
      });
    },

    watchFile(req) {
      const param = readPathParam(req);
      if (!param.ok) return param.response;
      const path = param.path;
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | undefined;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(": connected\n\n"));
          unsubscribe = watcher.subscribe(path, () => {
            try {
              controller.enqueue(encoder.encode("event: change\ndata: {}\n\n"));
            } catch {
              // Client already disconnected (can't enqueue). cancel handles the teardown.
            }
          });
        },
        // On client disconnect Bun calls cancel → unsubscribe (= watcher refcount--).
        cancel() {
          unsubscribe?.();
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
      });
    },
  };
}

export type SettingApiHandlers = {
  getSetting: () => Promise<Response>;
  updateSetting: (req: Request) => Promise<Response>;
};

export function createSettingHandlers(store: SettingStore): SettingApiHandlers {
  return {
    async getSetting() {
      return Response.json(await store.get());
    },

    async updateSetting(req) {
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = settingPatchSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the setting schema",
          issues: formatValidationError(parsed.error),
        });
      }
      // The schema only checks that font has an identifier shape, so the existence check against
      // the preset table (SSOT) happens here. Symmetric with theme (enum): an unknown font is not persisted and returns 400.
      if (parsed.data.font !== undefined && !isFontValue(parsed.data.font)) {
        return jsonError(400, {
          error: "validation_failed",
          message: `Unknown font preset: ${parsed.data.font}`,
        });
      }
      const setting = await store.update(parsed.data);
      return Response.json(setting);
    },
  };
}

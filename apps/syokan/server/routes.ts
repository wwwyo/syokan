import type { BunRequest } from "bun";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { itemSchema } from "../src/catalogs";
import { catalogManifest, catalogEnvelopeSchema } from "../src/catalogs/manifest";
import { probeCheckSchema } from "../src/catalogs/Probe/check";
import { resolveRepoHead, runProbe } from "./probe";
import { isFontValue } from "../src/lib/fonts";
import { crossOrigin } from "./origin";
import {
  createSnapshotInputSchema,
  findDuplicateId,
  formatValidationError,
  type Item,
  settingPatchSchema,
  type SnapshotEnvelope,
} from "../src/schema";
import { type SettingStore } from "./setting";
import { FORBIDDEN_PROP_KEYS, type SnapshotStore } from "./store";
import { type TemplateStore } from "./templates";

// ids must be unique tree-wide: anchor lookup and UI-state keying both assume it.
function uniqueRootIds(
  value: { root: Item },
  ctx: z.RefinementCtx,
): void {
  const dup = findDuplicateId(value.root);
  if (dup !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["root"],
      message: `duplicate node id "${dup}" (ids must be unique tree-wide)`,
    });
  }
}

const inputBaseSchema = createSnapshotInputSchema(itemSchema);

const postInputSchema = inputBaseSchema.superRefine(uniqueRootIds);

// PUT is identical to POST except it requires idempotencyKey.
const putInputSchema = inputBaseSchema
  .extend({ idempotencyKey: z.string().min(1) })
  .superRefine(uniqueRootIds);

// The writeback body (PRD view-writeback): a conditional set on one Checklist item
// of the node carrying `nodeId`. `item` identifies the item by label correspondence
// — its label appearing `occurrence`th (1-based) among same-label items — never by
// index; `expect` gates each listed prop on its current value (`null` = absent).
// e.g. { nodeId: "todos", item: { label: "牛乳を買う", occurrence: 2 },
//        set: { checked: true }, expect: { checked: false } }
const patchInputSchema = z
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

// Mutation endpoints reject requests carrying a foreign Origin (a browser page on
// another origin — another localhost port included — must not drive writes). GETs are
// unguarded: cross-origin reads can't read the response under the same-origin policy.
function forbidden(req: Request): Response | null {
  return crossOrigin(req)
    ? jsonError(403, {
        error: "forbidden",
        message: "cross-origin requests are not accepted",
      })
    : null;
}

export type ApiHandlers = {
  createSnapshot: (req: Request) => Promise<Response>;
  updateSnapshot: (req: Request) => Promise<Response>;
  listSnapshots: () => Promise<Response>;
  getSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
  patchSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
  deleteSnapshot: (req: BunRequest<"/api/snapshots/:id">) => Promise<Response>;
  watchChanges: () => Response;
};

export function createApiHandlers(store: SnapshotStore): ApiHandlers {
  return {
    async createSnapshot(req) {
      const deny = forbidden(req);
      if (deny) return deny;
      const body = await parseSnapshotBody(req, postInputSchema);
      if (!body.ok) return body.response;
      const envelope = await store.create(body.value);
      return snapshotResponse(envelope, 201);
    },

    // 404 if there's no match (AIP-134's Update default; use POST when you want to create).
    async updateSnapshot(req) {
      const deny = forbidden(req);
      if (deny) return deny;
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

    // Node-scoped writeback from a view (a Checklist check). The set is
    // conditional: it lands only when the item resolves by the label
    // correspondence and every `expect`ed prop still holds its value, and the
    // resulting tree must satisfy the catalog schema — a view can't corrupt
    // the store.
    async patchSnapshot(req) {
      const deny = forbidden(req);
      if (deny) return deny;
      const id = req.params.id;
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      // Zod rebuilds records (Object.assign), which turns an own "__proto__" key
      // into a prototype assignment and hides it from the parsed output — scan
      // the raw body so such a key is rejected instead of silently dropped.
      for (const map of [
        (body.value as { set?: unknown }).set,
        (body.value as { expect?: unknown }).expect,
      ]) {
        if (map === null || typeof map !== "object") continue;
        for (const key of Object.keys(map)) {
          if (FORBIDDEN_PROP_KEYS.has(key)) {
            return jsonError(422, {
              error: "invalid_set",
              message: "The set does not satisfy the catalog schema",
            });
          }
        }
      }
      const parsed = patchInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the patch schema",
          issues: formatValidationError(parsed.error),
        });
      }
      const result = await store.patch(
        id,
        parsed.data,
        (root) => itemSchema.safeParse(root).success,
      );
      if (!result.ok) {
        switch (result.error) {
          case "not_found":
            return jsonError(404, {
              error: "not_found",
              message: `Snapshot ${id} not found`,
            });
          // The node's id is gone from the latest tree (an LLM rewrote it): the view
          // must revert the operation — the writeback was refused, not dropped.
          case "node_not_found":
            return jsonError(409, {
              error: "node_not_found",
              message: `Node ${result.nodeId} is not in the latest tree`,
            });
          // The item can't be identified in the latest tree — the label is
          // absent or `occurrence` is out of range (an LLM insert/delete/reorder
          // broke the correspondence). Never redirect the write to another item.
          case "target_not_found":
            return jsonError(409, {
              error: "target_not_found",
              message: "The item is not identifiable in the latest tree",
            });
          // The item's value moved since the view rendered it (an external
          // update): applying would silently overwrite that change.
          case "value_conflict":
            return jsonError(409, {
              error: "value_conflict",
              message: "The item's current value does not match `expect`",
            });
          case "invalid_set":
            return jsonError(422, {
              error: "invalid_set",
              message: "The set does not satisfy the catalog schema",
            });
        }
      }
      return snapshotResponse(result.envelope);
    },

    async deleteSnapshot(req) {
      const deny = forbidden(req);
      if (deny) return deny;
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

    // Store mutations → open views/list. Same shape as the old files/watch: only "it
    // changed" is pushed; the client re-fetches content with GET. In-process only —
    // mutations by another server process don't reach subscribers (the focus-refetch
    // floor covers that edge).
    watchChanges() {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | undefined;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(": connected\n\n"));
          unsubscribe = store.subscribe((change) => {
            try {
              controller.enqueue(
                encoder.encode(
                  `event: change\ndata: ${JSON.stringify(change)}\n\n`,
                ),
              );
            } catch {
              // Client already disconnected (can't enqueue). cancel handles the teardown.
            }
          });
        },
        // On client disconnect Bun calls cancel → unsubscribe.
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

// The catalog's SSOT is src/catalogs; the envelope's SSOT is src/schema/snapshot.ts.
// Derive and return both from there every time.
export function getCatalog(): Response {
  return Response.json({
    items: catalogManifest(),
    envelope: catalogEnvelopeSchema(),
  });
}

const probeRunInputSchema = z.object({ check: probeCheckSchema }).strict();

const probeRefInputSchema = z
  .object({
    repo: z.string().min(1).refine(isAbsolute, "must be an absolute path"),
  })
  .strict();

export type ProbeApiHandlers = {
  runProbe: (req: Request) => Promise<Response>;
  resolveRef: (req: Request) => Promise<Response>;
};

// Probe runs are stateless on the server: results live in the client's device-local
// UI state, so a restart loses nothing (watcher-like runtime state doesn't even arise).
export function createProbeHandlers(): ProbeApiHandlers {
  return {
    async runProbe(req) {
      const deny = forbidden(req);
      if (deny) return deny;
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = probeRunInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the probe check schema",
          issues: formatValidationError(parsed.error),
        });
      }
      return Response.json(await runProbe(parsed.data.check));
    },

    // current HEAD of a repo — the client compares it with a result's ref for staleness
    async resolveRef(req) {
      const deny = forbidden(req);
      if (deny) return deny;
      const body = await readJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = probeRefInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body must be { repo: <absolute path> }",
          issues: formatValidationError(parsed.error),
        });
      }
      const resolved = await resolveRepoHead(parsed.data.repo);
      if (!resolved.ok) {
        return jsonError(422, {
          error: "ref_unresolved",
          message: resolved.message,
        });
      }
      return Response.json({ commit: resolved.commit });
    },
  };
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
      const deny = forbidden(req);
      if (deny) return deny;
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
      const deny = forbidden(req);
      if (deny) return deny;
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
      const deny = forbidden(req);
      if (deny) return deny;
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

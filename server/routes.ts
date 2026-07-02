import type { BunRequest } from "bun";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { itemSchema } from "@/catalogs";
import { catalogManifest } from "@/catalogs/manifest";
import { isFontValue } from "@/lib/fonts";
import {
  CURRENT_SCHEMA_VERSION,
  formatValidationError,
  settingPatchSchema,
  snapshotMetadataSchema,
} from "@/schema";
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

// 失敗理由を HTTP ステータスに対応づける。client はステータスで状態を分岐する (FR-9〜12)。
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

// ファイル参照ノード (FileDoc) の読み出し + 変更監視。読み出しは GET で本文/エラーを返し、
// 監視は SSE で「変わった」だけ通知する (内容は client が GET で取り直す)。watcher は
// server プロセス寿命の runtime state で永続化しない。
// path query param を取り出して検証する。相対パスは server CWD 依存になり意図しない
// ファイルを指すため、絶対パスのみ受け付ける (CLI は常に絶対パスを渡す)。
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
              // client が既に切断 (enqueue 不可)。cancel が解除を担う。
            }
          });
        },
        // client 切断時に Bun が cancel を呼ぶ → 購読解除 (= watcher の refcount--)。
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
      // schema は font を識別子の形だけで通すので、preset 表 (SSOT) の存在確認は
      // ここで行う。theme(enum) と対称に、未知 font は永続させず 400 を返す。
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

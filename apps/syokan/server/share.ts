import type { BunRequest } from "bun";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { hc } from "hono/client";
import { z } from "zod";
import { authFile } from "@/lib/paths";
import { formatValidationError } from "@/schema";
// AppType は apps/share/worker.ts (Hono app) が export する。API の形の SSOT は
// .agent/prd/public-share/contract.md と apps/share/types.ts。
import type { AppType } from "../../share/worker";
import { SHARE_API_DEFAULT_ORIGIN } from "../../share/types";
import { materializeTree } from "./materialize";
import type { SnapshotStore } from "./store";

export type AuthData = { token: string; login: string };

/** local server が Worker を呼ぶ origin。deploy 先切替は env 一本で行う。 */
export function shareApiOrigin(): string {
  return process.env.SYOKAN_SHARE_API ?? SHARE_API_DEFAULT_ORIGIN;
}

/** auth.json を読む。未 login (未存在 / 壊れている) は undefined。 */
export async function readAuth(
  path: string = authFile(),
): Promise<AuthData | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthData>;
    if (typeof parsed.token === "string" && typeof parsed.login === "string") {
      return { token: parsed.token, login: parsed.login };
    }
  } catch {
    // 壊れた auth.json は未 login 扱い (login し直しで復旧する)
  }
  return undefined;
}

// token は secret なので所有者のみ読めるようにする。writeFile の mode は
// 既存ファイルに効かないため chmod で常に 0600 へ揃える。
async function writeAuth(path: string, data: AuthData): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), { mode: 0o600 });
  await chmod(path, 0o600);
}

function jsonError(
  status: number,
  payload: { error: string; [key: string]: unknown },
) {
  return Response.json(payload, { status });
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const loginInputSchema = z
  .object({ githubAccessToken: z.string().min(1) })
  .strict();

const publishInputSchema = z
  .object({ expiresIn: z.number().int().positive().optional() })
  .strict();

// body なし / 空 body を {} として受ける (publish は expiresIn 省略が普通の経路)。
async function parseOptionalJsonBody(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const text = await req.text();
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
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

export type ShareApiHandlers = {
  loginStatus: () => Promise<Response>;
  login: (req: Request) => Promise<Response>;
  logout: () => Promise<Response>;
  publishSnapshot: (
    req: BunRequest<"/api/snapshots/:id/publish">,
  ) => Promise<Response>;
  listShares: (req: Request) => Promise<Response>;
  deleteShare: (req: BunRequest<"/api/shares/:id">) => Promise<Response>;
};

export type ShareHandlerDeps = {
  store: SnapshotStore;
  fetch: typeof fetch;
  origin: string;
  authFilePath: string;
};

export function createShareHandlers(deps: ShareHandlerDeps): ShareApiHandlers {
  const client = hc<AppType>(deps.origin, { fetch: deps.fetch });
  const bearer = (token: string) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  return {
    async loginStatus() {
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return jsonError(401, { error: "not_logged_in" });
      return Response.json({ login: auth.login });
    },

    async login(req) {
      const body = await parseOptionalJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = loginInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the login schema",
          issues: formatValidationError(parsed.error),
        });
      }
      let res: Response;
      try {
        res = await client.api.v1.auth.token.$post({
          json: { githubAccessToken: parsed.data.githubAccessToken },
        });
      } catch {
        return jsonError(502, { error: "share_api_unreachable" });
      }
      const data = await readJsonSafe(res);
      if (!res.ok) {
        // Worker 側エラー (GitHub 検証失敗等) は status と body を透過する。
        return Response.json(
          data ?? { error: "share_api_error", status: res.status },
          { status: res.status },
        );
      }
      const { token, login } = data as { token: string; login: string };
      await writeAuth(deps.authFilePath, { token, login });
      return Response.json({ login });
    },

    async logout() {
      await rm(deps.authFilePath, { force: true });
      return Response.json({ ok: true });
    },

    async publishSnapshot(req) {
      const body = await parseOptionalJsonBody(req);
      if (!body.ok) return body.response;
      const parsed = publishInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(400, {
          error: "validation_failed",
          message: "Request body does not satisfy the publish schema",
          issues: formatValidationError(parsed.error),
        });
      }
      const id = req.params.id;
      const envelope = await deps.store.get(id);
      if (!envelope) {
        return jsonError(404, {
          error: "not_found",
          message: `Snapshot ${id} not found`,
        });
      }
      const materialized = await materializeTree(envelope.root);
      if (!materialized.ok) {
        // 読めないノードを欠いたまま公開しない: 1 件でも失敗なら publish 全体を失敗させる。
        return jsonError(422, {
          error: "materialize_failed",
          path: materialized.path,
          reason: materialized.reason,
        });
      }
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return jsonError(401, { error: "not_logged_in" });
      let res: Response;
      try {
        res = await client.api.v1.shares.$post(
          {
            json: {
              envelope: { ...envelope, root: materialized.root },
              sourceSnapshotId: envelope.id,
              ...(parsed.data.expiresIn !== undefined
                ? { expiresIn: parsed.data.expiresIn }
                : {}),
            },
          },
          bearer(auth.token),
        );
      } catch {
        return jsonError(502, { error: "share_api_unreachable" });
      }
      const data = await readJsonSafe(res);
      // Worker の 401 = 保存済み token の失効。client には「login し直し」として見せる。
      if (res.status === 401) return jsonError(401, { error: "not_logged_in" });
      if (!res.ok) {
        return Response.json(
          data ?? { error: "share_api_error", status: res.status },
          { status: res.status },
        );
      }
      return Response.json(data, { status: 201 });
    },

    async listShares(req) {
      const auth = await readAuth(deps.authFilePath);
      // 未 login は空一覧で 200 (UI の「公開中」chip が静かに劣化する)。
      if (!auth) return Response.json({ shares: [] });
      const snapshot = new URL(req.url).searchParams.get("snapshot");
      let res: Response;
      try {
        res = await client.api.v1.shares.$get(
          { query: snapshot ? { snapshot } : {} },
          bearer(auth.token),
        );
      } catch {
        return jsonError(502, { error: "share_api_unreachable" });
      }
      const data = await readJsonSafe(res);
      if (res.status === 401) return jsonError(401, { error: "not_logged_in" });
      return Response.json(
        data ?? { error: "share_api_error", status: res.status },
        { status: res.status },
      );
    },

    async deleteShare(req) {
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return jsonError(401, { error: "not_logged_in" });
      let res: Response;
      try {
        res = await client.api.v1.shares[":id"].$delete(
          { param: { id: req.params.id } },
          bearer(auth.token),
        );
      } catch {
        return jsonError(502, { error: "share_api_unreachable" });
      }
      const data = await readJsonSafe(res);
      if (res.status === 401) return jsonError(401, { error: "not_logged_in" });
      return Response.json(
        data ?? { error: "share_api_error", status: res.status },
        { status: res.status },
      );
    },
  };
}

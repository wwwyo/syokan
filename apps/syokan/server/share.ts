import type { BunRequest } from "bun";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { hc } from "hono/client";
import { z } from "zod";
import { authFile } from "../src/lib/paths";
import { formatValidationError } from "../src/schema";
// AppType is exported by apps/share/worker.ts (the Hono app). The SSOT for the API shape is
// .agent/prd/public-share/contract.md and apps/share/types.ts.
import type { AppType } from "../../share/worker";
import { SHARE_API_DEFAULT_ORIGIN } from "../../share/types";
import { materializeTree } from "./materialize";
import type { SnapshotStore } from "./store";

export type AuthData = { token: string; login: string };

/** The origin the local server calls the Worker at. Switch deploy targets with a single env var. */
export function shareApiOrigin(): string {
  return process.env.SYOKAN_SHARE_API ?? SHARE_API_DEFAULT_ORIGIN;
}

/** Read auth.json. Not logged in (missing / corrupt) yields undefined. */
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
    // Treat a corrupt auth.json as not logged in (logging in again recovers it)
  }
  return undefined;
}

// The token is a secret, so make it readable only by the owner. writeFile's mode doesn't
// apply to an existing file, so chmod always to 0600.
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

// Keep min(60) in sync with the Worker's createShareSchema. Returning 400 up front
// avoids leaking the Worker's validation_failed after a materialize + round-trip.
const publishInputSchema = z
  .object({ expiresIn: z.number().int().min(60).optional() })
  .strict();

const authResponseSchema = z
  .object({ token: z.string().min(1), login: z.string().min(1) })
  .loose();

// The localhost server is only hit by the same-origin app and the Origin-less CLI. Reject any
// cross-origin request that carries an Origin (a malicious web page CSRFing publish to leak local
// file contents to a public URL). CLI/curl send no Origin, so they pass.
function crossOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
  } catch {
    return true;
  }
}

// Accept no body / empty body as {} (omitting expiresIn is the normal path for publish).
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
      if (crossOrigin(req)) return jsonError(403, { error: "forbidden" });
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
        // Pass Worker-side errors (e.g. GitHub verification failure) through by status and body.
        return Response.json(
          data ?? { error: "share_api_error", status: res.status },
          { status: res.status },
        );
      }
      // A 200 doesn't guarantee the body shape (e.g. a proxy's non-JSON response). Writing auth
      // without validating would persist a broken auth.json — "logged in yet not_logged_in".
      const auth = authResponseSchema.safeParse(data);
      if (!auth.success) return jsonError(502, { error: "share_api_error" });
      await writeAuth(deps.authFilePath, {
        token: auth.data.token,
        login: auth.data.login,
      });
      return Response.json({ login: auth.data.login });
    },

    async logout() {
      // Revoke the Worker-side token too; otherwise a leaked token can publish/delete until its TTL.
      // Still succeed the logout even if the Worker is unreachable (always clear the local copy).
      const auth = await readAuth(deps.authFilePath);
      if (auth) {
        try {
          await client.api.v1.auth.token.$delete({}, bearer(auth.token));
        } catch {
          // best-effort: the token expires on its own at TTL
        }
      }
      await rm(deps.authFilePath, { force: true });
      return Response.json({ ok: true });
    },

    async publishSnapshot(req) {
      if (crossOrigin(req)) return jsonError(403, { error: "forbidden" });
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
      // Check auth before materializing; reading every FileDoc file is wasted work when not logged in.
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return jsonError(401, { error: "not_logged_in" });
      const materialized = await materializeTree(envelope.root);
      if (!materialized.ok) {
        // Don't publish with an unreadable node missing: a single failure fails the whole publish.
        return jsonError(422, {
          error: "materialize_failed",
          path: materialized.path,
          reason: materialized.reason,
        });
      }
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
      // A Worker 401 = stored token expired. Surface it to the client as "log in again".
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
      // Not logged in returns an empty list with 200 (the UI's "published" chip degrades quietly).
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
      if (crossOrigin(req)) return jsonError(403, { error: "forbidden" });
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

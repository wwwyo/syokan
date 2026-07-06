import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { hc } from "hono/client";
import { z } from "zod";
import { authFile } from "../src/lib/paths";
// AppType is exported by apps/share/worker.ts (the Hono app). The SSOT for the API shape is
// .agent/prd/public-share/contract.md and apps/share/types.ts.
import type { AppType } from "../../share/worker";
import {
  type CreateShareResponse,
  type ListSharesResponse,
  SHARE_API_DEFAULT_ORIGIN,
  type ShareErrorResponse,
} from "../../share/types";
import { materializeTree } from "./materialize";
import type { SnapshotStore } from "./store";

type AuthData = { token: string; login: string };

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

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const authResponseSchema = z
  .object({ token: z.string().min(1), login: z.string().min(1) })
  .loose();

// Worker error bodies pass through only on this status set so the hc-visible response types
// stay literal (422 is deliberately absent: it is reserved for the local materialize_failed).
// Anything else — unknown status or a body without an `error` string — folds into 502.
const PASS_THROUGH_STATUSES = [400, 401, 403, 404, 413, 429] as const;

const workerErrorBodySchema = z.object({ error: z.string() }).loose();

type WorkerFailure = {
  body: z.infer<typeof workerErrorBodySchema> | ShareErrorResponse;
  status: (typeof PASS_THROUGH_STATUSES)[number] | 502;
};

async function workerFailure(res: Response): Promise<WorkerFailure> {
  const parsed = workerErrorBodySchema.safeParse(await readJsonSafe(res));
  return {
    body: parsed.success
      ? parsed.data
      : ({ error: "share_api_error" } satisfies ShareErrorResponse),
    status: PASS_THROUGH_STATUSES.find((s) => s === res.status) ?? 502,
  };
}

/**
 * A failed operation, expressed in domain terms the entrypoint maps to HTTP.
 * `worker_error` carries the Worker's own status+body, forwarded verbatim.
 */
export type ServiceFailure =
  | { ok: false; kind: "unreachable" }
  | { ok: false; kind: "bad_response" }
  | { ok: false; kind: "not_logged_in" }
  | { ok: false; kind: "not_found"; id: string }
  | { ok: false; kind: "materialize_failed"; path: string; reason: string }
  | { ok: false; kind: "worker_error"; status: WorkerFailure["status"]; body: WorkerFailure["body"] };

// Parse a Worker success body; a broken proxy that returns non-JSON folds into bad_response.
async function parseJson<T>(
  res: Response,
): Promise<{ ok: true; value: T } | ServiceFailure> {
  try {
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, kind: "bad_response" };
  }
}

// A Worker 401 on an authenticated call = the stored token expired, so tell the client to log in
// again; any other failure forwards verbatim. (login is exempt: its 401 is a GitHub-verification
// failure and must pass through as worker_error.)
async function workerFailureAsService(res: Response): Promise<ServiceFailure> {
  const failure = await workerFailure(res);
  if (failure.status === 401) return { ok: false, kind: "not_logged_in" };
  return { ok: false, kind: "worker_error", ...failure };
}

export type CurrentLoginResult = { login: string } | undefined;
export type LoginResult = { ok: true; login: string } | ServiceFailure;
export type PublishResult = { ok: true; share: CreateShareResponse } | ServiceFailure;
export type ListResult =
  | { ok: true; shares: ListSharesResponse["shares"] }
  | ServiceFailure;
export type DeleteResult = { ok: true } | ServiceFailure;

export type ShareServiceDeps = {
  store: SnapshotStore;
  fetch: typeof fetch;
  origin: string;
  authFilePath: string;
};

/**
 * The share operations: exchange/hold the Worker token, freeze a snapshot's TreeDoc nodes and
 * publish it, and proxy authenticated list/delete to the Worker. HTTP concerns (request parsing,
 * CSRF, response shaping) belong to the entrypoint (share.ts); this layer returns domain results.
 * A stored-token 401 from the Worker means "log in again", so publish/list/delete fold it into
 * not_logged_in, whereas login forwards its 401 (GitHub verification failure) as worker_error.
 */
export type ShareService = {
  currentLogin(): Promise<CurrentLoginResult>;
  login(githubAccessToken: string): Promise<LoginResult>;
  logout(): Promise<void>;
  publish(id: string, expiresIn?: number): Promise<PublishResult>;
  listShares(snapshot?: string): Promise<ListResult>;
  deleteShare(id: string): Promise<DeleteResult>;
};

export function createShareService(deps: ShareServiceDeps): ShareService {
  const client = hc<AppType>(deps.origin, { fetch: deps.fetch });
  const bearer = (token: string) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  return {
    async currentLogin() {
      const auth = await readAuth(deps.authFilePath);
      return auth ? { login: auth.login } : undefined;
    },

    async login(githubAccessToken) {
      let res: Response;
      try {
        res = await client.api.v1.auth.token.$post({
          json: { githubAccessToken },
        });
      } catch {
        return { ok: false, kind: "unreachable" };
      }
      if (!res.ok) {
        // Forward Worker-side errors verbatim (e.g. GitHub verification failure surfaces as 401).
        return { ok: false, kind: "worker_error", ...(await workerFailure(res)) };
      }
      // A 200 doesn't guarantee the body shape (e.g. a proxy's non-JSON response). Writing auth
      // without validating would persist a broken auth.json — "logged in yet not_logged_in".
      const auth = authResponseSchema.safeParse(await readJsonSafe(res));
      if (!auth.success) return { ok: false, kind: "bad_response" };
      await writeAuth(deps.authFilePath, {
        token: auth.data.token,
        login: auth.data.login,
      });
      return { ok: true, login: auth.data.login };
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
    },

    async publish(id, expiresIn) {
      const envelope = await deps.store.get(id);
      if (!envelope) return { ok: false, kind: "not_found", id };
      // Check auth before materializing; reading every TreeDoc file is wasted work when not logged in.
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return { ok: false, kind: "not_logged_in" };
      const materialized = await materializeTree(envelope.root);
      if (!materialized.ok) {
        // Don't publish with an unreadable node missing: a single failure fails the whole publish.
        return {
          ok: false,
          kind: "materialize_failed",
          path: materialized.path,
          reason: materialized.reason,
        };
      }
      let res: Awaited<ReturnType<typeof client.api.v1.shares.$post>>;
      try {
        res = await client.api.v1.shares.$post(
          {
            json: {
              envelope: { ...envelope, root: materialized.root },
              sourceSnapshotId: envelope.id,
              ...(expiresIn !== undefined ? { expiresIn } : {}),
            },
          },
          bearer(auth.token),
        );
      } catch {
        return { ok: false, kind: "unreachable" };
      }
      if (res.status === 201) {
        const parsed = await parseJson<CreateShareResponse>(res);
        return parsed.ok ? { ok: true, share: parsed.value } : parsed;
      }
      return workerFailureAsService(res);
    },

    async listShares(snapshot) {
      const auth = await readAuth(deps.authFilePath);
      // Not logged in returns an empty list (the UI's "published" chip degrades quietly).
      if (!auth) return { ok: true, shares: [] };
      let res: Awaited<ReturnType<typeof client.api.v1.shares.$get>>;
      try {
        res = await client.api.v1.shares.$get(
          { query: snapshot !== undefined ? { snapshot } : {} },
          bearer(auth.token),
        );
      } catch {
        return { ok: false, kind: "unreachable" };
      }
      if (res.status === 200) {
        const parsed = await parseJson<ListSharesResponse>(res);
        return parsed.ok ? { ok: true, shares: parsed.value.shares } : parsed;
      }
      return workerFailureAsService(res);
    },

    async deleteShare(id) {
      const auth = await readAuth(deps.authFilePath);
      if (!auth) return { ok: false, kind: "not_logged_in" };
      let res: Awaited<
        ReturnType<(typeof client.api.v1.shares)[":id"]["$delete"]>
      >;
      try {
        res = await client.api.v1.shares[":id"].$delete(
          { param: { id } },
          bearer(auth.token),
        );
      } catch {
        return { ok: false, kind: "unreachable" };
      }
      if (res.status === 200) {
        const parsed = await parseJson<unknown>(res);
        return parsed.ok ? { ok: true } : parsed;
      }
      return workerFailureAsService(res);
    },
  };
}

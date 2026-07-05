import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Hono } from "hono";
import { hc } from "hono/client";
import { validator } from "hono/validator";
import { z } from "zod";
import { authFile } from "../src/lib/paths";
import { formatValidationError } from "../src/schema";
// AppType is exported by apps/share/worker.ts (the Hono app). The SSOT for the API shape is
// .agent/prd/public-share/contract.md and apps/share/types.ts.
import type { AppType } from "../../share/worker";
import {
  type ListSharesResponse,
  SHARE_API_DEFAULT_ORIGIN,
  type ShareErrorResponse,
} from "../../share/types";
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
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await req.text();
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export type ShareAppDeps = {
  store: SnapshotStore;
  fetch: typeof fetch;
  origin: string;
  authFilePath: string;
};

/**
 * The share API as a Hono sub-app so the response types reach the frontend via hc
 * (the FE imports ShareAppType only; the Worker's shape reaches it solely through this proxy).
 */
export function createShareApp(deps: ShareAppDeps) {
  const client = hc<AppType>(deps.origin, { fetch: deps.fetch });
  const bearer = (token: string) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  return new Hono()
    .get("/api/auth/login", async (c) => {
      const auth = await readAuth(deps.authFilePath);
      if (!auth) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      return c.json({ login: auth.login });
    })
    .post("/api/auth/login", async (c) => {
      if (crossOrigin(c.req.raw)) {
        return c.json({ error: "forbidden" } satisfies ShareErrorResponse, 403);
      }
      const body = await parseOptionalJsonBody(c.req.raw);
      if (!body.ok) {
        return c.json(
          { error: "invalid_json", message: "Request body is not valid JSON" },
          400,
        );
      }
      const parsed = loginInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json(
          {
            error: "validation_failed",
            message: "Request body does not satisfy the login schema",
            issues: formatValidationError(parsed.error),
          },
          400,
        );
      }
      let res: Response;
      try {
        res = await client.api.v1.auth.token.$post({
          json: { githubAccessToken: parsed.data.githubAccessToken },
        });
      } catch {
        return c.json(
          { error: "share_api_unreachable" } satisfies ShareErrorResponse,
          502,
        );
      }
      if (!res.ok) {
        // Pass Worker-side errors (e.g. GitHub verification failure) through by status and body.
        const failure = await workerFailure(res);
        return c.json(failure.body, failure.status);
      }
      // A 200 doesn't guarantee the body shape (e.g. a proxy's non-JSON response). Writing auth
      // without validating would persist a broken auth.json — "logged in yet not_logged_in".
      const auth = authResponseSchema.safeParse(await readJsonSafe(res));
      if (!auth.success) {
        return c.json(
          { error: "share_api_error" } satisfies ShareErrorResponse,
          502,
        );
      }
      await writeAuth(deps.authFilePath, {
        token: auth.data.token,
        login: auth.data.login,
      });
      return c.json({ login: auth.data.login });
    })
    .delete("/api/auth/login", async (c) => {
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
      return c.json({ ok: true });
    })
    .post("/api/snapshots/:id/publish", async (c) => {
      if (crossOrigin(c.req.raw)) {
        return c.json({ error: "forbidden" } satisfies ShareErrorResponse, 403);
      }
      const body = await parseOptionalJsonBody(c.req.raw);
      if (!body.ok) {
        return c.json(
          { error: "invalid_json", message: "Request body is not valid JSON" },
          400,
        );
      }
      const parsed = publishInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json(
          {
            error: "validation_failed",
            message: "Request body does not satisfy the publish schema",
            issues: formatValidationError(parsed.error),
          },
          400,
        );
      }
      const id = c.req.param("id");
      const envelope = await deps.store.get(id);
      if (!envelope) {
        return c.json(
          { error: "not_found", message: `Snapshot ${id} not found` },
          404,
        );
      }
      // Check auth before materializing; reading every FileDoc file is wasted work when not logged in.
      const auth = await readAuth(deps.authFilePath);
      if (!auth) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      const materialized = await materializeTree(envelope.root);
      if (!materialized.ok) {
        // Don't publish with an unreadable node missing: a single failure fails the whole publish.
        return c.json(
          {
            error: "materialize_failed",
            path: materialized.path,
            reason: materialized.reason,
          } satisfies ShareErrorResponse,
          422,
        );
      }
      let res: Awaited<ReturnType<typeof client.api.v1.shares.$post>>;
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
        return c.json(
          { error: "share_api_unreachable" } satisfies ShareErrorResponse,
          502,
        );
      }
      if (res.status === 201) {
        try {
          return c.json(await res.json(), 201);
        } catch {
          // A 201 with a non-JSON body means a broken proxy between us and the Worker.
          return c.json(
            { error: "share_api_error" } satisfies ShareErrorResponse,
            502,
          );
        }
      }
      const failure = await workerFailure(res);
      // A Worker 401 = stored token expired. Surface it to the client as "log in again".
      if (failure.status === 401) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      return c.json(failure.body, failure.status);
    })
    .get(
      "/api/shares",
      validator("query", (value) => ({
        snapshot:
          typeof value.snapshot === "string" ? value.snapshot : undefined,
      })),
      async (c) => {
        const auth = await readAuth(deps.authFilePath);
        // Not logged in returns an empty list with 200 (the UI's "published" chip degrades quietly).
        if (!auth) return c.json({ shares: [] } satisfies ListSharesResponse);
        const { snapshot } = c.req.valid("query");
        let res: Awaited<ReturnType<typeof client.api.v1.shares.$get>>;
        try {
          res = await client.api.v1.shares.$get(
            { query: snapshot !== undefined ? { snapshot } : {} },
            bearer(auth.token),
          );
        } catch {
          return c.json(
            { error: "share_api_unreachable" } satisfies ShareErrorResponse,
            502,
          );
        }
        if (res.status === 200) {
          try {
            return c.json(await res.json(), 200);
          } catch {
            return c.json(
              { error: "share_api_error" } satisfies ShareErrorResponse,
              502,
            );
          }
        }
        const failure = await workerFailure(res);
        if (failure.status === 401) {
          return c.json(
            { error: "not_logged_in" } satisfies ShareErrorResponse,
            401,
          );
        }
        return c.json(failure.body, failure.status);
      },
    )
    .delete("/api/shares/:id", async (c) => {
      if (crossOrigin(c.req.raw)) {
        return c.json({ error: "forbidden" } satisfies ShareErrorResponse, 403);
      }
      const auth = await readAuth(deps.authFilePath);
      if (!auth) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      let res: Awaited<
        ReturnType<(typeof client.api.v1.shares)[":id"]["$delete"]>
      >;
      try {
        res = await client.api.v1.shares[":id"].$delete(
          { param: { id: c.req.param("id") } },
          bearer(auth.token),
        );
      } catch {
        return c.json(
          { error: "share_api_unreachable" } satisfies ShareErrorResponse,
          502,
        );
      }
      if (res.status === 200) {
        try {
          return c.json(await res.json(), 200);
        } catch {
          return c.json(
            { error: "share_api_error" } satisfies ShareErrorResponse,
            502,
          );
        }
      }
      const failure = await workerFailure(res);
      if (failure.status === 401) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      return c.json(failure.body, failure.status);
    });
}

/** The FE's API contract. Imported type-only, so no server code reaches the browser bundle. */
export type ShareAppType = ReturnType<typeof createShareApp>;

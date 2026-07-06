import type { Context } from "hono";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { formatValidationError } from "../src/schema";
import type { ShareErrorResponse } from "../../share/types";
import {
  createShareService,
  type ServiceFailure,
  type ShareServiceDeps,
} from "./shareService";

export type ShareAppDeps = ShareServiceDeps;

const loginInputSchema = z
  .object({ githubAccessToken: z.string().min(1) })
  .strict();

// Keep min(60) in sync with the Worker's createShareSchema. Returning 400 up front
// avoids leaking the Worker's validation_failed after a materialize + round-trip.
const publishInputSchema = z
  .object({ expiresIn: z.number().int().min(60).optional() })
  .strict();

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

/** Map a service failure to its HTTP response. worker_error forwards the Worker's status+body. */
function emitFailure(c: Context, failure: ServiceFailure) {
  switch (failure.kind) {
    case "unreachable":
      return c.json(
        { error: "share_api_unreachable" } satisfies ShareErrorResponse,
        502,
      );
    case "bad_response":
      return c.json(
        { error: "share_api_error" } satisfies ShareErrorResponse,
        502,
      );
    case "not_logged_in":
      return c.json(
        { error: "not_logged_in" } satisfies ShareErrorResponse,
        401,
      );
    case "not_found":
      return c.json(
        { error: "not_found", message: `Snapshot ${failure.id} not found` },
        404,
      );
    case "materialize_failed":
      return c.json(
        {
          error: "materialize_failed",
          path: failure.path,
          reason: failure.reason,
        } satisfies ShareErrorResponse,
        422,
      );
    case "worker_error":
      return c.json(failure.body, failure.status);
  }
}

/**
 * The share API as a Hono sub-app so the response types reach the frontend via hc (the FE imports
 * ShareAppType only; the Worker's shape reaches it solely through this proxy). This entrypoint owns
 * routing, the cross-origin (CSRF) guard, and request/response shaping; the Worker calls, auth-file
 * handling, and TreeDoc freezing live in the service layer (shareService.ts).
 */
export function createShareApp(deps: ShareAppDeps) {
  const service = createShareService(deps);

  return new Hono()
    .get("/api/auth/login", async (c) => {
      const login = await service.currentLogin();
      if (!login) {
        return c.json(
          { error: "not_logged_in" } satisfies ShareErrorResponse,
          401,
        );
      }
      return c.json(login);
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
      const result = await service.login(parsed.data.githubAccessToken);
      if (!result.ok) return emitFailure(c, result);
      return c.json({ login: result.login });
    })
    .delete("/api/auth/login", async (c) => {
      await service.logout();
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
      const result = await service.publish(
        c.req.param("id"),
        parsed.data.expiresIn,
      );
      if (!result.ok) return emitFailure(c, result);
      return c.json(result.share, 201);
    })
    .get(
      "/api/shares",
      validator("query", (value) => ({
        snapshot:
          typeof value.snapshot === "string" ? value.snapshot : undefined,
      })),
      async (c) => {
        const { snapshot } = c.req.valid("query");
        const result = await service.listShares(snapshot);
        if (!result.ok) return emitFailure(c, result);
        return c.json({ shares: result.shares });
      },
    )
    .delete("/api/shares/:id", async (c) => {
      if (crossOrigin(c.req.raw)) {
        return c.json({ error: "forbidden" } satisfies ShareErrorResponse, 403);
      }
      const result = await service.deleteShare(c.req.param("id"));
      if (!result.ok) return emitFailure(c, result);
      return c.json({ ok: true });
    });
}

/** The FE's API contract. Imported type-only, so no server code reaches the browser bundle. */
export type ShareAppType = ReturnType<typeof createShareApp>;

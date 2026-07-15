import type { Fetcher, KVNamespace, RateLimit } from "@cloudflare/workers-types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { VIEWER_INLINE_SCRIPT_HASHES } from "./csp.generated";
import {
	type AuthTokenResponse,
	type ListSharesResponse,
	type PublicShareResponse,
	SHARE_DEFAULT_TTL_SECONDS,
	SHARE_MAX_BYTES,
	SHARE_MAX_TTL_SECONDS,
	SHARE_QUOTA_PER_USER,
	type ShareErrorResponse,
	type ShareRecord,
	type ShareSummary,
	SHARE_TOKEN_TTL_SECONDS,
} from "./types";

type Bindings = {
	SHARES: KVNamespace;
	GITHUB_API_BASE?: string;
	ASSETS: Fetcher;
	AUTH_RATE_LIMIT: RateLimit;
	WRITE_RATE_LIMIT: RateLimit;
};

/** Value for KV `token:<sha256hex>`. The GitHub token itself is not stored */
type TokenRecord = {
	owner: string;
	ownerId: number;
	createdAt: string;
};

type Env = { Bindings: Bindings; Variables: { auth: TokenRecord } };

// Don't import the props union from catalogs/index.ts (it would pull React into the worker bundle).
// Unknown types degrade gracefully via the viewer's UnknownComponent, so structural validation suffices.
type StructuralItem = {
	type: string;
	props: Record<string, unknown>;
	children?: StructuralItem[];
	key?: string;
	// cross-cutting node fields: without them a plain z.object strips id/tags on parse,
	// silently killing anchor nav / TagFilter / UI-state persistence on shared views.
	id?: string;
	tags?: string[];
};

const structuralItemSchema: z.ZodType<StructuralItem> = z.lazy(() =>
	z.object({
		type: z.string().min(1),
		props: z.record(z.string(), z.unknown()),
		children: z.array(structuralItemSchema).optional(),
		key: z.string().min(1).optional(),
		id: z.string().min(1).optional(),
		tags: z.array(z.string().min(1)).min(1).optional(),
	}),
);

const envelopeSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	title: z.string().min(1).optional(),
	root: structuralItemSchema,
	createdAt: z.iso.datetime(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const createShareSchema = z.object({
	envelope: envelopeSchema,
	sourceSnapshotId: z.string().min(1),
	expiresIn: z.number().int().min(60).optional(),
});

const authTokenSchema = z.object({
	githubAccessToken: z.string().min(1),
});

function containsType(item: StructuralItem, type: string): boolean {
	if (item.type === type) return true;
	return item.children?.some((child) => containsType(child, type)) ?? false;
}

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Derive the URL from the request origin. run_worker_first routes every request through the worker,
// so custom domain / preview / dev all yield the correct share URL with zero config (no env placeholder needed).
function shareUrl(reqUrl: string, id: string): string {
	return `${new URL(reqUrl).origin}/shares/${id}`;
}

async function rateLimited(limiter: RateLimit, key: string): Promise<boolean> {
	const { success } = await limiter.limit({ key });
	return !success;
}

const requireAuth = createMiddleware<Env>(async (c, next) => {
	const header = c.req.header("authorization");
	const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
	if (!token) {
		return c.json({ error: "unauthorized" } satisfies ShareErrorResponse, 401);
	}
	const record = await c.env.SHARES.get<TokenRecord>(
		`token:${await sha256Hex(token)}`,
		"json",
	);
	if (!record) {
		return c.json({ error: "unauthorized" } satisfies ShareErrorResponse, 401);
	}
	c.set("auth", record);
	await next();
});

const CSP = `default-src 'self'; script-src 'self' ${VIEWER_INLINE_SCRIPT_HASHES.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`;

const app = new Hono<Env>()
	.post(
		"/api/v1/auth/token",
		zValidator("json", authTokenSchema, (result, c) => {
			if (!result.success) {
				return c.json(
					{ error: "validation_failed" } satisfies ShareErrorResponse,
					400,
				);
			}
		}),
		async (c) => {
			// IP-keyed: damps token-minting spam and brute-forcing stolen GitHub tokens through us
			const ip = c.req.header("cf-connecting-ip") ?? "";
			if (await rateLimited(c.env.AUTH_RATE_LIMIT, ip)) {
				return c.json(
					{ error: "rate_limited" } satisfies ShareErrorResponse,
					429,
				);
			}
			const { githubAccessToken } = c.req.valid("json");
			const base = c.env.GITHUB_API_BASE ?? "https://api.github.com";
			const res = await fetch(`${base}/user`, {
				headers: {
					authorization: `Bearer ${githubAccessToken}`,
					accept: "application/vnd.github+json",
					// The GitHub API requires a User-Agent
					"user-agent": "syokan-share",
				},
			});
			if (!res.ok) {
				return c.json(
					{ error: "github_verification_failed" } satisfies ShareErrorResponse,
					401,
				);
			}
			const user = (await res.json()) as { login: string; id: number };
			const bytes = new Uint8Array(32);
			crypto.getRandomValues(bytes);
			const token = toHex(bytes);
			const record: TokenRecord = {
				owner: user.login,
				ownerId: user.id,
				createdAt: new Date().toISOString(),
			};
			await c.env.SHARES.put(
				`token:${await sha256Hex(token)}`,
				JSON.stringify(record),
				{ expirationTtl: SHARE_TOKEN_TTL_SECONDS },
			);
			return c.json({ token, login: user.login } satisfies AuthTokenResponse);
		},
	)
	.delete("/api/v1/auth/token", requireAuth, async (c) => {
		const header = c.req.header("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
		await c.env.SHARES.delete(`token:${await sha256Hex(token)}`);
		return c.json({ ok: true });
	})
	.post(
		"/api/v1/shares",
		requireAuth,
		zValidator("json", createShareSchema, (result, c) => {
			if (!result.success) {
				return c.json(
					{
						error: "validation_failed",
						issues: result.error.issues.map(
							(i) => `${i.path.join(".")}: ${i.message}`,
						),
					} satisfies ShareErrorResponse,
					400,
				);
			}
		}),
		async (c) => {
			const auth = c.get("auth");
			// ownerId-keyed: caps write bursts even for valid users (quota caps the total)
			if (await rateLimited(c.env.WRITE_RATE_LIMIT, String(auth.ownerId))) {
				return c.json(
					{ error: "rate_limited" } satisfies ShareErrorResponse,
					429,
				);
			}
			const { envelope, sourceSnapshotId, expiresIn } = c.req.valid("json");
			// The local server freezes TreeDoc at publish time (the primary defense); this is the last
			// line of defense so a file-referencing node can never land in a public payload.
			if (containsType(envelope.root, "TreeDoc")) {
				return c.json(
					{ error: "treedoc_not_allowed" } satisfies ShareErrorResponse,
					400,
				);
			}
			// SHARE_MAX_BYTES is a byte count. JSON.stringify(...).length counts UTF-16 code units,
			// which underestimates multi-byte characters, so measure the real byte length with TextEncoder.
			if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > SHARE_MAX_BYTES) {
				return c.json(
					{
						error: "payload_too_large",
						limit: SHARE_MAX_BYTES,
					} satisfies ShareErrorResponse,
					413,
				);
			}
			// Quota is judged by the user index count (100 << list's 1000-per-page cap)
			const existing = await c.env.SHARES.list({
				prefix: `user:${auth.ownerId}:`,
			});
			if (existing.keys.length >= SHARE_QUOTA_PER_USER) {
				return c.json(
					{
						error: "quota_exceeded",
						limit: SHARE_QUOTA_PER_USER,
					} satisfies ShareErrorResponse,
					429,
				);
			}
			const ttl = Math.min(
				expiresIn ?? SHARE_DEFAULT_TTL_SECONDS,
				SHARE_MAX_TTL_SECONDS,
			);
			// Widen away randomUUID's template-literal type: the contract says id is a plain string,
			// and the UUID shape would otherwise leak into every hc consumer.
			const id: string = crypto.randomUUID();
			const now = Date.now();
			const expiresAt = new Date(now + ttl * 1000).toISOString();
			const record: ShareRecord = {
				envelope,
				owner: auth.owner,
				ownerId: auth.ownerId,
				sourceSnapshotId,
				createdAt: new Date(now).toISOString(),
				expiresAt,
			};
			// Key the index on the immutable ownerId; a GitHub login can be renamed/reused, so it's unsafe for ownership.
			await Promise.all([
				c.env.SHARES.put(`share:${id}`, JSON.stringify(record), {
					expirationTtl: ttl,
				}),
				c.env.SHARES.put(`user:${auth.ownerId}:${id}`, "", {
					expirationTtl: ttl,
				}),
			]);
			return c.json({ id, url: shareUrl(c.req.url, id), expiresAt }, 201);
		},
	)
	.get("/api/v1/shares/:id", async (c) => {
		c.header("Cache-Control", "no-store");
		c.header("X-Robots-Tag", "noindex");
		const record = await c.env.SHARES.get<ShareRecord>(
			`share:${c.req.param("id")}`,
			"json",
		);
		if (!record) {
			return c.json({ error: "not_found" } satisfies ShareErrorResponse, 404);
		}
		// sourceSnapshotId is returned only in the owner's listing (no reason to expose it publicly)
		return c.json({
			envelope: record.envelope,
			publishedBy: record.owner,
			createdAt: record.createdAt,
			expiresAt: record.expiresAt,
		} satisfies PublicShareResponse);
	})
	.get("/api/v1/shares", requireAuth, async (c) => {
		const auth = c.get("auth");
		const snapshot = c.req.query("snapshot");
		const prefix = `user:${auth.ownerId}:`;
		const listed = await c.env.SHARES.list({ prefix });
		const records = await Promise.all(
			listed.keys.map(async (key) => {
				const id = key.name.slice(prefix.length);
				const record = await c.env.SHARES.get<ShareRecord>(
					`share:${id}`,
					"json",
				);
				return { id, record };
			}),
		);
		const shares: ShareSummary[] = [];
		for (const { id, record } of records) {
			// Skip a share that expired between list and get
			if (!record) continue;
			if (snapshot !== undefined && record.sourceSnapshotId !== snapshot) {
				continue;
			}
			shares.push({
				id,
				url: shareUrl(c.req.url, id),
				sourceSnapshotId: record.sourceSnapshotId,
				createdAt: record.createdAt,
				expiresAt: record.expiresAt,
			});
		}
		return c.json({ shares } satisfies ListSharesResponse);
	})
	.delete("/api/v1/shares/:id", requireAuth, async (c) => {
		const auth = c.get("auth");
		if (await rateLimited(c.env.WRITE_RATE_LIMIT, String(auth.ownerId))) {
			return c.json({ error: "rate_limited" } satisfies ShareErrorResponse, 429);
		}
		const id = c.req.param("id");
		const record = await c.env.SHARES.get<ShareRecord>(`share:${id}`, "json");
		// Don't leak the existence of someone else's share (owner mismatch also returns 404)
		if (!record || record.ownerId !== auth.ownerId) {
			return c.json({ error: "not_found" } satisfies ShareErrorResponse, 404);
		}
		await Promise.all([
			c.env.SHARES.delete(`share:${id}`),
			c.env.SHARES.delete(`user:${auth.ownerId}:${id}`),
		]);
		return c.json({ ok: true });
	})
	.all("*", async (c) => {
		const url = new URL(c.req.url);
		// /shares/* is the SPA fallback (the viewer resolves :id client-side)
		const isSharePage =
			url.pathname === "/shares" || url.pathname.startsWith("/shares/");
		// /terms is a static SPA route with no matching asset, so it also falls back.
		// Rewrite to "/" (not "/index.html"): the assets layer's auto-trailing-slash
		// handling 307s /index.html back to /, which would swallow the fallback.
		const assetRequest =
			isSharePage || url.pathname === "/terms"
				? new Request(new URL("/", url.origin), c.req.raw)
				: c.req.raw;
		// workers-types' Request/Response differ slightly in shape from lib.dom, so cast at the boundary
		const res = (await c.env.ASSETS.fetch(
			assetRequest as unknown as Parameters<Fetcher["fetch"]>[0],
		)) as unknown as Response;
		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.includes("text/html")) return res;
		const headers = new Headers(res.headers);
		// Only share pages are noindex; the landing and /terms are the distribution surface
		// and should be indexable
		if (isSharePage) headers.set("X-Robots-Tag", "noindex");
		headers.set("Content-Security-Policy", CSP);
		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	});

export default app;

export type AppType = typeof app;

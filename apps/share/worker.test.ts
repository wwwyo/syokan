import { afterAll, describe, expect, test } from "bun:test";
import type { Fetcher, KVNamespace, RateLimit } from "@cloudflare/workers-types";
import {
	SHARE_DEFAULT_TTL_SECONDS,
	SHARE_MAX_BYTES,
	SHARE_MAX_TTL_SECONDS,
	SHARE_QUOTA_PER_USER,
	type ShareRecord,
	SHARE_TOKEN_TTL_SECONDS,
} from "./types";
import app from "./worker";

// ---- GitHub API stub (identity verification target for POST /api/v1/auth/token) ----

const GITHUB_USERS: Record<string, { login: string; id: number }> = {
	"gh-token-octocat": { login: "octocat", id: 1 },
	"gh-token-other": { login: "other", id: 2 },
};

const github = Bun.serve({
	port: 0,
	fetch(req) {
		const auth = req.headers.get("authorization") ?? "";
		const user = GITHUB_USERS[auth.replace(/^Bearer /, "")];
		if (!user) return new Response("Unauthorized", { status: 401 });
		return Response.json(user);
	},
});

afterAll(() => {
	github.stop(true);
});

// ---- in-memory stubs ----

class MemoryKV {
	store = new Map<string, string>();
	ttl = new Map<string, number | undefined>();

	async get(key: string, type?: "json" | "text") {
		const value = this.store.get(key);
		if (value === undefined) return null;
		return type === "json" ? JSON.parse(value) : value;
	}

	async put(key: string, value: string, opts?: { expirationTtl?: number }) {
		this.store.set(key, value);
		this.ttl.set(key, opts?.expirationTtl);
	}

	async delete(key: string) {
		this.store.delete(key);
	}

	async list({ prefix = "" }: { prefix?: string } = {}) {
		const keys = [...this.store.keys()]
			.filter((name) => name.startsWith(prefix))
			.map((name) => ({ name }));
		return { keys, list_complete: true as const, cacheStatus: null };
	}
}

class StubRateLimit {
	keys: string[] = [];
	success = true;

	async limit({ key }: { key: string }) {
		this.keys.push(key);
		return { success: this.success };
	}
}

function createEnv() {
	const kv = new MemoryKV();
	const assetUrls: string[] = [];
	const assets = {
		async fetch(input: Request | string) {
			assetUrls.push(typeof input === "string" ? input : input.url);
			return new Response("<html>viewer</html>", {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		},
	};
	const authRateLimit = new StubRateLimit();
	const writeRateLimit = new StubRateLimit();
	const env = {
		SHARES: kv as unknown as KVNamespace,
		GITHUB_API_BASE: `http://127.0.0.1:${github.port}`,
		ASSETS: assets as unknown as Fetcher,
		AUTH_RATE_LIMIT: authRateLimit as unknown as RateLimit,
		WRITE_RATE_LIMIT: writeRateLimit as unknown as RateLimit,
	};
	return { env, kv, assetUrls, authRateLimit, writeRateLimit };
}

// ---- helpers ----

type Env = ReturnType<typeof createEnv>["env"];

function jsonInit(body: unknown, token?: string): RequestInit {
	return {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	};
}

async function login(env: Env, githubAccessToken = "gh-token-octocat") {
	const res = await app.request(
		"/api/v1/auth/token",
		jsonInit({ githubAccessToken }),
		env,
	);
	expect(res.status).toBe(200);
	return (await res.json()) as { token: string; login: string };
}

function makeEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		id: "snap-1",
		title: "hello",
		root: {
			type: "Stack",
			props: {},
			children: [{ type: "Text", props: { text: "hi" } }],
		},
		createdAt: "2026-07-04T00:00:00Z",
		...overrides,
	};
}

async function publish(
	env: Env,
	token: string,
	body: Record<string, unknown> = {},
) {
	return app.request(
		"/api/v1/shares",
		jsonInit(
			{
				envelope: makeEnvelope(),
				sourceSnapshotId: "snap-1",
				...body,
			},
			token,
		),
		env,
	);
}

describe("POST /api/v1/auth/token", () => {
	test("on successful GitHub verification, issues a hex token and stores only the hash in KV", async () => {
		const { env, kv } = createEnv();
		const { token, login: ghLogin } = await login(env);
		expect(ghLogin).toBe("octocat");
		expect(token).toMatch(/^[0-9a-f]{64}$/);

		const tokenKeys = [...kv.store.keys()].filter((k) => k.startsWith("token:"));
		expect(tokenKeys).toHaveLength(1);
		const record = JSON.parse(kv.store.get(tokenKeys[0] as string) as string);
		expect(record.owner).toBe("octocat");
		expect(record.ownerId).toBe(1);
		// Neither the raw token nor the GitHub token appears in KV
		expect(tokenKeys[0]).not.toContain(token);
		for (const value of kv.store.values()) {
			expect(value).not.toContain("gh-token-octocat");
			expect(value).not.toContain(token);
		}
	});

	test("failed GitHub verification is 401", async () => {
		const { env } = createEnv();
		const res = await app.request(
			"/api/v1/auth/token",
			jsonInit({ githubAccessToken: "bogus" }),
			env,
		);
		expect(res.status).toBe(401);
		expect(((await res.json()) as { error: string }).error).toBe(
			"github_verification_failed",
		);
	});

	test("the issued token gets a TTL", async () => {
		const { env, kv } = createEnv();
		await login(env);
		const key = [...kv.store.keys()].find((k) => k.startsWith("token:"));
		expect(kv.ttl.get(key as string)).toBe(SHARE_TOKEN_TTL_SECONDS);
	});

	test("over the rate limit is 429 rate_limited, keyed by client IP", async () => {
		const { env, authRateLimit } = createEnv();
		authRateLimit.success = false;
		const init = jsonInit({ githubAccessToken: "gh-token-octocat" });
		const res = await app.request(
			"/api/v1/auth/token",
			{
				...init,
				headers: { ...(init.headers as Record<string, string>), "cf-connecting-ip": "203.0.113.9" },
			},
			env,
		);
		expect(res.status).toBe(429);
		expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
		expect(authRateLimit.keys).toEqual(["203.0.113.9"]);
	});

	test("DELETE /api/v1/auth/token revokes your own token", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const key = [...kv.store.keys()].find((k) => k.startsWith("token:"));
		expect(kv.store.has(key as string)).toBe(true);
		const res = await app.request(
			"/api/v1/auth/token",
			{ method: "DELETE", headers: { authorization: `Bearer ${token}` } },
			env,
		);
		expect(res.status).toBe(200);
		expect(kv.store.has(key as string)).toBe(false);
	});
});

describe("Bearer auth", () => {
	test("no token is 401", async () => {
		const { env } = createEnv();
		const res = await publish(env, "");
		expect(res.status).toBe(401);
		expect(((await res.json()) as { error: string }).error).toBe("unauthorized");
	});

	test("an invalid token is 401", async () => {
		const { env } = createEnv();
		const res = await publish(env, "f".repeat(64));
		expect(res.status).toBe(401);
	});
});

describe("POST /api/v1/shares", () => {
	test("returns 201 with url and expiresAt and stores the share and user index in KV", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const before = Date.now();
		const res = await publish(env, token);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			id: string;
			url: string;
			expiresAt: string;
		};
		expect(body.url).toBe(`http://localhost/shares/${body.id}`);
		const expiresAt = Date.parse(body.expiresAt);
		expect(expiresAt).toBeGreaterThanOrEqual(
			before + SHARE_DEFAULT_TTL_SECONDS * 1000,
		);
		expect(expiresAt).toBeLessThanOrEqual(
			Date.now() + SHARE_DEFAULT_TTL_SECONDS * 1000,
		);

		const record = JSON.parse(
			kv.store.get(`share:${body.id}`) as string,
		) as ShareRecord;
		expect(record.owner).toBe("octocat");
		expect(record.ownerId).toBe(1);
		expect(record.sourceSnapshotId).toBe("snap-1");
		expect(record.envelope).toEqual(makeEnvelope());
		expect(kv.store.has(`user:1:${body.id}`)).toBe(true);
	});

	test("expiresIn is clamped to SHARE_MAX_TTL_SECONDS", async () => {
		const { env } = createEnv();
		const { token } = await login(env);
		const before = Date.now();
		const res = await publish(env, token, {
			expiresIn: SHARE_MAX_TTL_SECONDS * 10,
		});
		expect(res.status).toBe(201);
		const { expiresAt } = (await res.json()) as { expiresAt: string };
		expect(Date.parse(expiresAt)).toBeLessThanOrEqual(
			Date.now() + SHARE_MAX_TTL_SECONDS * 1000,
		);
		expect(Date.parse(expiresAt)).toBeGreaterThanOrEqual(
			before + SHARE_MAX_TTL_SECONDS * 1000,
		);
	});

	test("expiresIn under 60 is 400", async () => {
		const { env } = createEnv();
		const { token } = await login(env);
		const res = await publish(env, token, { expiresIn: 30 });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toBe(
			"validation_failed",
		);
	});

	test("preserves cross-cutting id and tags through validation into KV", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const res = await publish(env, token, {
			envelope: makeEnvelope({
				root: {
					type: "Stack",
					props: {},
					id: "root",
					children: [
						{
							type: "Text",
							props: { body: "high" },
							id: "risk-1",
							tags: ["High"],
						},
					],
				},
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const record = JSON.parse(
			kv.store.get(`share:${id}`) as string,
		) as ShareRecord;
		const root = (record.envelope as { root: unknown }).root as {
			id?: string;
			children?: { id?: string; tags?: string[] }[];
		};
		// a plain z.object would strip these, breaking anchors / TagFilter on shared views
		expect(root.id).toBe("root");
		expect(root.children?.[0]?.id).toBe("risk-1");
		expect(root.children?.[0]?.tags).toEqual(["High"]);
	});

	test("a TreeDoc anywhere in the tree is 400", async () => {
		const { env } = createEnv();
		const { token } = await login(env);
		const res = await publish(env, token, {
			envelope: makeEnvelope({
				root: {
					type: "Stack",
					props: {},
					children: [{ type: "TreeDoc", props: { path: "/tmp/a.json" } }],
				},
			}),
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toBe(
			"treedoc_not_allowed",
		);
	});

	test("an envelope over SHARE_MAX_BYTES is 413", async () => {
		const { env } = createEnv();
		const { token } = await login(env);
		const res = await publish(env, token, {
			envelope: makeEnvelope({
				root: { type: "Text", props: { text: "x".repeat(SHARE_MAX_BYTES) } },
			}),
		});
		expect(res.status).toBe(413);
		expect(((await res.json()) as { error: string }).error).toBe(
			"payload_too_large",
		);
	});

	test("over the write rate limit is 429 rate_limited, keyed by ownerId", async () => {
		const { env, kv, writeRateLimit } = createEnv();
		const { token } = await login(env);
		writeRateLimit.success = false;
		const res = await publish(env, token);
		expect(res.status).toBe(429);
		expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
		// octocat's ownerId is 1; nothing is stored when limited
		expect(writeRateLimit.keys).toEqual(["1"]);
		expect([...kv.store.keys()].some((k) => k.startsWith("share:"))).toBe(false);
	});

	test("429 when the owner's share count has reached the quota", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		for (let i = 0; i < SHARE_QUOTA_PER_USER; i++) {
			kv.store.set(`user:1:existing-${i}`, "");
		}
		const res = await publish(env, token);
		expect(res.status).toBe(429);
		expect(((await res.json()) as { error: string }).error).toBe(
			"quota_exceeded",
		);
	});
});

describe("GET /api/v1/shares/:id (public)", () => {
	test("returns 200 with envelope and publishedBy but not sourceSnapshotId", async () => {
		const { env } = createEnv();
		const { token } = await login(env);
		const created = (await (await publish(env, token)).json()) as {
			id: string;
		};

		const res = await app.request(`/api/v1/shares/${created.id}`, {}, env);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(res.headers.get("x-robots-tag")).toBe("noindex");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.envelope).toEqual(makeEnvelope());
		expect(body.publishedBy).toBe("octocat");
		expect(body.expiresAt).toBeString();
		expect(body).not.toContainKey("sourceSnapshotId");
	});

	test("a miss is 404", async () => {
		const { env } = createEnv();
		const res = await app.request("/api/v1/shares/nope", {}, env);
		expect(res.status).toBe(404);
		expect(((await res.json()) as { error: string }).error).toBe("not_found");
	});
});

describe("GET /api/v1/shares", () => {
	test("returns your own list and can filter with ?snapshot=", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const a = (await (
			await publish(env, token, { sourceSnapshotId: "snap-a" })
		).json()) as { id: string };
		const b = (await (
			await publish(env, token, { sourceSnapshotId: "snap-b" })
		).json()) as { id: string };
		// A share that expired between list and get (only the index remains) is skipped
		kv.store.set("user:1:expired-id", "");

		const listRes = await app.request(
			"/api/v1/shares",
			{ headers: { authorization: `Bearer ${token}` } },
			env,
		);
		expect(listRes.status).toBe(200);
		const { shares } = (await listRes.json()) as {
			shares: Record<string, unknown>[];
		};
		expect(shares.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
		for (const share of shares) {
			expect(share).not.toContainKey("envelope");
			expect(share.url).toBe(`http://localhost/shares/${share.id}`);
		}

		const filteredRes = await app.request(
			"/api/v1/shares?snapshot=snap-b",
			{ headers: { authorization: `Bearer ${token}` } },
			env,
		);
		const filtered = (await filteredRes.json()) as {
			shares: { id: string; sourceSnapshotId: string }[];
		};
		expect(filtered.shares).toHaveLength(1);
		expect(filtered.shares[0]?.id).toBe(b.id);
		expect(filtered.shares[0]?.sourceSnapshotId).toBe("snap-b");
	});
});

describe("DELETE /api/v1/shares/:id", () => {
	test("your own can be deleted and both KV entries disappear", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const { id } = (await (await publish(env, token)).json()) as {
			id: string;
		};

		const res = await app.request(
			`/api/v1/shares/${id}`,
			{ method: "DELETE", headers: { authorization: `Bearer ${token}` } },
			env,
		);
		expect(res.status).toBe(200);
		expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
		expect(kv.store.has(`share:${id}`)).toBe(false);
		expect(kv.store.has(`user:1:${id}`)).toBe(false);

		const getRes = await app.request(`/api/v1/shares/${id}`, {}, env);
		expect(getRes.status).toBe(404);
	});

	test("over the write rate limit is 429 and the share survives", async () => {
		const { env, kv, writeRateLimit } = createEnv();
		const { token } = await login(env);
		const { id } = (await (await publish(env, token)).json()) as {
			id: string;
		};
		writeRateLimit.success = false;

		const res = await app.request(
			`/api/v1/shares/${id}`,
			{ method: "DELETE", headers: { authorization: `Bearer ${token}` } },
			env,
		);
		expect(res.status).toBe(429);
		expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
		expect(kv.store.has(`share:${id}`)).toBe(true);
	});

	test("someone else's share is 404 and isn't deleted", async () => {
		const { env, kv } = createEnv();
		const { token } = await login(env);
		const { id } = (await (await publish(env, token)).json()) as {
			id: string;
		};
		const other = await login(env, "gh-token-other");

		const res = await app.request(
			`/api/v1/shares/${id}`,
			{
				method: "DELETE",
				headers: { authorization: `Bearer ${other.token}` },
			},
			env,
		);
		expect(res.status).toBe(404);
		expect(kv.store.has(`share:${id}`)).toBe(true);
	});
});

describe("asset fallback", () => {
	test("/shares/* is rewritten to / (index.html) with noindex and CSP", async () => {
		const { env, assetUrls } = createEnv();
		const res = await app.request("/shares/some-id", {}, env);
		expect(res.status).toBe(200);
		// Rewritten to "/" not "/index.html": the assets layer 307s /index.html → /.
		// app.request's default origin is http://localhost
		expect(assetUrls).toEqual(["http://localhost/"]);
		expect(res.headers.get("x-robots-tag")).toBe("noindex");
		const csp = res.headers.get("content-security-policy") ?? "";
		expect(csp).toContain("script-src 'self'");
		// The inline theme script is allowed via a CSP hash (through csp.generated.ts)
		expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/]+=*'/);
	});

	test("/ is not rewritten and is indexable", async () => {
		const { env, assetUrls } = createEnv();
		const res = await app.request("/", {}, env);
		expect(assetUrls).toEqual(["http://localhost/"]);
		expect(res.headers.get("x-robots-tag")).toBeNull();
	});

	test("/terms is rewritten to / (index.html) and is indexable", async () => {
		const { env, assetUrls } = createEnv();
		const res = await app.request("/terms", {}, env);
		expect(assetUrls).toEqual(["http://localhost/"]);
		expect(res.headers.get("x-robots-tag")).toBeNull();
	});
});

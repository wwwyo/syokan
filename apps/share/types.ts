/**
 * The public share API contract. Imported by both the worker (Cloudflare) and the local server (Bun).
 * Changes can be breaking (distributed binaries and deployed Workers version independently).
 */

export type ShareRecord = {
	envelope: unknown;
	owner: string;
	ownerId: number;
	sourceSnapshotId: string;
	createdAt: string;
	expiresAt: string;
};

export type AuthTokenRequest = { githubAccessToken: string };
export type AuthTokenResponse = { token: string; login: string };

export type CreateShareRequest = {
	envelope: unknown;
	sourceSnapshotId: string;
	/** Seconds. Defaults to SHARE_DEFAULT_TTL_SECONDS, capped at SHARE_MAX_TTL_SECONDS */
	expiresIn?: number;
};
export type CreateShareResponse = { id: string; url: string; expiresAt: string };

export type PublicShareResponse = {
	envelope: unknown;
	publishedBy: string;
	createdAt: string;
	expiresAt: string;
};

export type ShareSummary = {
	id: string;
	url: string;
	sourceSnapshotId: string;
	createdAt: string;
	expiresAt: string;
};
export type ListSharesResponse = { shares: ShareSummary[] };

/** Producers reference it via satisfies, consumers via narrowing, so a rename surfaces as a type error. */
export type ShareErrorCode =
	| "unauthorized"
	| "not_logged_in"
	| "github_verification_failed"
	| "validation_failed"
	| "filedoc_not_allowed"
	| "payload_too_large"
	| "quota_exceeded"
	| "not_found"
	| "materialize_failed"
	| "share_api_unreachable"
	| "share_api_error"
	| "invalid_json"
	// local server only: the localhost proxy's cross-origin (CSRF) rejection
	| "forbidden";

export type ShareErrorResponse = {
	error: ShareErrorCode;
	[key: string]: unknown;
};

export const SHARE_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SHARE_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
/** KV TTL for the token. Even if a logout revoke is missed, a leaked token expires on its own. */
export const SHARE_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
export const SHARE_MAX_BYTES = 1024 * 1024;
export const SHARE_QUOTA_PER_USER = 100;

/** 本番 Worker の origin (local server が Worker を叩く先)。env SYOKAN_SHARE_API で上書き可 */
export const SHARE_API_DEFAULT_ORIGIN = "https://syokan.dev";

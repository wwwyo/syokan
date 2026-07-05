/**
 * public share の API 契約。worker (Cloudflare) と local server (Bun) の双方が import する。
 * 変更は breaking になりうる (配布済み binary と deploy 済み Worker はバージョンが独立に進む)。
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
	/** 秒。省略時 SHARE_DEFAULT_TTL_SECONDS、上限 SHARE_MAX_TTL_SECONDS */
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

export type ShareErrorResponse = { error: string; [key: string]: unknown };

export const SHARE_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SHARE_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SHARE_MAX_BYTES = 1024 * 1024;
export const SHARE_QUOTA_PER_USER = 100;

/** deploy 先が決まるまでの placeholder。local server は env SYOKAN_SHARE_API で上書き可能 */
export const SHARE_API_DEFAULT_ORIGIN = "https://syokan.dev";

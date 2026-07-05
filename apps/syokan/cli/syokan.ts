#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeDir } from "@/lib/paths";
// At compile time the whole JSON is embedded into the binary (= that binary's version)
import pkg from "../package.json";
import { type Command, createRouter } from "./router";

export type SpawnResult = { pid: number };
export type StopResult = { stopped: boolean; pid?: number };

export type CliDeps = {
  fetch: typeof fetch;
  readFile: (path: string) => Promise<string>;
  // Absolute-path resolution (canonicalization) when wrapping in a FileDoc. Used as the dedup identifier.
  resolvePath: (path: string) => string;
  // File size (bytes). -1 when stat fails (missing, etc.). Used to reject huge files without reading them.
  fileSize: (path: string) => number;
  // Post input on bare invocation (`... | syokan`)
  readStdin: () => Promise<string>;
  // On bare invocation, whether stdin is a pipe / redirect (i.e. not a terminal)
  stdinIsPipe: () => boolean;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  baseUrl: string;
  // For lazy-spawn: start the server detached
  spawnServer: () => SpawnResult;
  // For `syokan stop`: stop the lazy-spawned server
  stopServer: () => StopResult | Promise<StopResult>;
  // Wait for the readiness poll (tests inject an immediate resolve)
  sleep: (ms: number) => Promise<void>;
  // Hand the view URL to the OS's default browser
  openUrl: (url: string) => void;
};

export type CliResult = { exitCode: number };

type PostResult = { ok: boolean; status: number; data: unknown };

// Cold start includes the import + bind of shiki / react-markdown, so leave headroom
// (15s). Too short returns server_unavailable just before ready and orphans the server.
const READY_RETRIES = 150;
const READY_INTERVAL_MS = 100;

// absent=none / compatible=same lineage as this build / incompatible=an old build is running.
// An old build doesn't return a version in health. If a new CLI silently reuses it,
// catalog/templates 404 and stop can't kill it (it looks at a different pidfile), so distinguish them.
type ServerProbe = "absent" | "compatible" | "incompatible";

async function probeServer(deps: CliDeps): Promise<ServerProbe> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.baseUrl}/api/health`);
  } catch {
    return "absent";
  }
  if (!res.ok) return "absent";
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const version = (body as { version?: unknown } | null)?.version;
  return typeof version === "string" ? "compatible" : "incompatible";
}

// lazy-spawn: use the server if it's already running; otherwise start it and wait until ready.
// If an old build occupies the same port, don't silently reuse it — return an error prompting a stop.
export async function ensureServerRunning(
  deps: CliDeps,
): Promise<{ ok: true; spawned: boolean } | { ok: false; error: string }> {
  const probe = await probeServer(deps);
  if (probe === "compatible") return { ok: true, spawned: false };
  if (probe === "incompatible") {
    return {
      ok: false,
      error: `an older syokan server is already running at ${deps.baseUrl}; stop it first (kill the process on its port, or run the previous build's 'syokan stop')`,
    };
  }
  deps.spawnServer();
  for (let i = 0; i < READY_RETRIES; i++) {
    await deps.sleep(READY_INTERVAL_MS);
    if ((await probeServer(deps)) === "compatible") {
      return { ok: true, spawned: true };
    }
  }
  return {
    ok: false,
    error: `server did not become ready within ${
      (READY_RETRIES * READY_INTERVAL_MS) / 1000
    }s`,
  };
}

// Shared helper: hit the API and read the body as JSON. data=null if the body isn't JSON.
async function apiCall(
  deps: CliDeps,
  path: string,
  init?: RequestInit,
): Promise<PostResult> {
  const res = await deps.fetch(`${deps.baseUrl}${path}`, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function hasIdempotencyKey(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { idempotencyKey?: unknown }).idempotencyKey === "string"
  );
}

function postSnapshot(
  deps: CliDeps,
  method: "POST" | "PUT",
  body: string,
): Promise<PostResult> {
  return apiCall(deps, "/api/snapshots", {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

// The server's PUT assumes "already exists" (404 if not), so fall back to POST here only on 404,
// sparing the caller from having to decide whether it's the first post.
async function postItems(deps: CliDeps, payload: unknown): Promise<PostResult> {
  const body = JSON.stringify(payload);
  if (!hasIdempotencyKey(payload)) {
    return postSnapshot(deps, "POST", body);
  }
  const updated = await postSnapshot(deps, "PUT", body);
  const isNotFound =
    updated.status === 404 &&
    (updated.data as { error?: string } | null)?.error === "not_found";
  if (!isNotFound) return updated;
  return postSnapshot(deps, "POST", body);
}

function reportSuccess(deps: CliDeps, data: unknown): CliResult {
  const url = (data as { url?: string } | null)?.url;
  if (url) {
    deps.stdout(url.startsWith("http") ? url : `${deps.baseUrl}${url}`);
  } else {
    deps.stdout(JSON.stringify(data));
  }
  return { exitCode: 0 };
}

function reportFailure(deps: CliDeps, result: PostResult): CliResult {
  const payload = result.data ?? {
    error: "request_failed",
    status: result.status,
  };
  deps.stderr(JSON.stringify(payload));
  return { exitCode: 1 };
}

// Shared across post commands: ensure the server (lazy-spawn), then send the payload
async function postWithServer(
  deps: CliDeps,
  payload: unknown,
): Promise<CliResult> {
  const ensured = await ensureServerRunning(deps);
  if (!ensured.ok) {
    deps.stderr(
      JSON.stringify({ error: "server_unavailable", message: ensured.error }),
    );
    return { exitCode: 1 };
  }
  if (ensured.spawned) {
    deps.stderr(`syokan: started server at ${deps.baseUrl}`);
  }
  const result = await postItems(deps, payload);
  return result.ok
    ? reportSuccess(deps, result.data)
    : reportFailure(deps, result);
}

// Input is JSON envelope only. To display markdown / plain text too, express it inside the envelope
// via the MarkdownDoc / PlainText catalog. Metadata such as source.label also goes in the
// envelope (the CLI never adds any).
async function postText(text: string, deps: CliDeps): Promise<CliResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    deps.stderr(
      JSON.stringify({ error: "invalid_json", message: String(err) }),
    );
    return { exitCode: 1 };
  }
  return postWithServer(deps, payload);
}

// Lightweight check for whether it's an envelope. Importing the catalog's full schema would pull the
// React components into the CLI bundle, so don't; just check whether `root` is Item-shaped (`{ type: string, ... }`).
// A broken envelope passes here and lets the server's strict validation return validation_failed.
function looksLikeEnvelope(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const root = (value as { root?: unknown }).root;
  return (
    typeof root === "object" &&
    root !== null &&
    typeof (root as { type?: unknown }).type === "string"
  );
}

// Wrap a file into an envelope of a single FileDoc node. title / source.label are the basename;
// so a re-post of the same file points at the same id/url, the dedup identifier (idempotencyKey)
// is the absolute path (FR-15..17).
function wrapFileDoc(absPath: string): unknown {
  const name = basename(absPath);
  return {
    title: name,
    root: { type: "FileDoc", props: { path: absPath } },
    metadata: { source: { label: name } },
    idempotencyKey: `filedoc:${absPath}`,
  };
}

// Match FileDoc's display limit. A file over this can't be an envelope and can't be displayed
// anyway, so the CLI wraps it as a FileDoc without reading its contents (avoids OOM from reading a
// huge log whole; the server displays too_large).
const SNIFF_SIZE_LIMIT = 2 * 1024 * 1024;

// `syokan <path>`: if the contents satisfy the envelope schema, post as before; otherwise
// resolve to the absolute path, wrap in a FileDoc, and post (FR-13/14). markdown/log/txt fail
// JSON.parse and so automatically take the wrap path.
export async function runPost(file: string, deps: CliDeps): Promise<CliResult> {
  // A file over the display limit is wrapped immediately without sniffing (its contents aren't read).
  if (deps.fileSize(file) > SNIFF_SIZE_LIMIT) {
    return postWithServer(deps, wrapFileDoc(deps.resolvePath(file)));
  }
  let text: string;
  try {
    text = await deps.readFile(file);
  } catch (err) {
    deps.stderr(JSON.stringify({ error: "read_failed", message: String(err) }));
    return { exitCode: 1 };
  }
  let parsed: unknown;
  let parsedOk = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsedOk = false;
  }
  if (parsedOk && looksLikeEnvelope(parsed)) {
    return postWithServer(deps, parsed);
  }
  return postWithServer(deps, wrapFileDoc(deps.resolvePath(file)));
}

// Normalize the arg passed to open into a view URL. Whether it's post's output (full URL /
// `/snapshots/:id`) or a bare id, it should just open.
export function resolveViewUrl(idOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//.test(idOrUrl)) return idOrUrl;
  const path = idOrUrl.startsWith("/")
    ? idOrUrl
    : `/snapshots/${encodeURIComponent(idOrUrl)}`;
  return `${baseUrl}${path}`;
}

// Open in the browser. Viewing needs the server, so lazy-spawn like post.
// When id is omitted, open home (the snapshot list).
export async function runOpen(
  idOrUrl: string | undefined,
  deps: CliDeps,
): Promise<CliResult> {
  const ensured = await ensureServerRunning(deps);
  if (!ensured.ok) {
    deps.stderr(
      JSON.stringify({ error: "server_unavailable", message: ensured.error }),
    );
    return { exitCode: 1 };
  }
  if (ensured.spawned) {
    deps.stderr(`syokan: started server at ${deps.baseUrl}`);
  }
  const url = idOrUrl ? resolveViewUrl(idOrUrl, deps.baseUrl) : deps.baseUrl;
  deps.openUrl(url);
  deps.stdout(url);
  return { exitCode: 0 };
}

export async function runStop(deps: CliDeps): Promise<CliResult> {
  const { stopped, pid } = await deps.stopServer();
  if (stopped) {
    deps.stderr(`syokan: stopped server (pid ${pid})`);
  } else {
    deps.stderr("syokan: no syokan-managed server to stop");
  }
  return { exitCode: 0 };
}

// catalog / templates are APIs that need the server, so lazy-spawn like post.
// If it can't start, return server_unavailable and abort here.
async function ensureOrFail(deps: CliDeps): Promise<CliResult | null> {
  const ensured = await ensureServerRunning(deps);
  if (!ensured.ok) {
    deps.stderr(
      JSON.stringify({ error: "server_unavailable", message: ensured.error }),
    );
    return { exitCode: 1 };
  }
  if (ensured.spawned) {
    deps.stderr(`syokan: started server at ${deps.baseUrl}`);
  }
  return null;
}

// Return a missing argument as unified-format error JSON.
function argError(deps: CliDeps, error: string, message: string): CliResult {
  deps.stderr(JSON.stringify({ error, message }));
  return { exitCode: 1 };
}

// Shared helper: after ensuring the server, hit a GET API and print the body (JSON) to stdout.
async function getJson(deps: CliDeps, path: string): Promise<CliResult> {
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, path);
  if (!result.ok) return reportFailure(deps, result);
  deps.stdout(JSON.stringify(result.data));
  return { exitCode: 0 };
}

// catalog's SSOT is src/catalogs. The LLM reads this output to assemble props.
export async function runCatalog(deps: CliDeps): Promise<CliResult> {
  return getJson(deps, "/api/catalog");
}

async function runTemplateAdd(
  args: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  let title: string | undefined;
  let description: string | undefined;
  let source: string | undefined;
  // Don't swallow agent misinput (a missing option value, an unknown flag, a duplicate source)
  // as valid input — make it an explicit error. Prevents a value from swallowing the next flag.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--title" || a === "--description") {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return argError(deps, "missing_option_value", `${a} needs a value`);
      }
      if (a === "--title") title = v;
      else description = v;
      i++;
    } else if (a.startsWith("--")) {
      return argError(deps, "unknown_option", a);
    } else if (source !== undefined) {
      return argError(deps, "too_many_args", `unexpected argument: ${a}`);
    } else {
      source = a;
    }
  }
  if (!title) return argError(deps, "missing_title", "--title is required");
  // The template JSON comes from a file or stdin. `-` / omitted means stdin (so it can be piped in like post).
  let text: string;
  if (source === undefined || source === "-") {
    text = await deps.readStdin();
  } else {
    try {
      text = await deps.readFile(source);
    } catch (err) {
      deps.stderr(
        JSON.stringify({ error: "read_failed", message: String(err) }),
      );
      return { exitCode: 1 };
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    deps.stderr(
      JSON.stringify({ error: "invalid_json", message: String(err) }),
    );
    return { exitCode: 1 };
  }
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, "/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, json, ...(description ? { description } : {}) }),
  });
  if (!result.ok) return reportFailure(deps, result);
  const id = (result.data as { id?: string } | null)?.id;
  deps.stdout(id ?? JSON.stringify(result.data));
  return { exitCode: 0 };
}

async function runTemplateDelete(
  id: string | undefined,
  deps: CliDeps,
): Promise<CliResult> {
  if (!id) return argError(deps, "missing_id", "template id is required");
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(
    deps,
    `/api/templates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!result.ok) return reportFailure(deps, result);
  deps.stdout(JSON.stringify(result.data));
  return { exitCode: 0 };
}

// templates: list (omitted / list), add, get <id>, rm <id>. All via the API.
export async function runTemplates(
  args: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === "list") return getJson(deps, "/api/templates");
  if (sub === "add") return runTemplateAdd(rest, deps);
  if (sub === "get") {
    if (!rest[0]) return argError(deps, "missing_id", "template id is required");
    return getJson(deps, `/api/templates/${encodeURIComponent(rest[0])}`);
  }
  if (sub === "rm") return runTemplateDelete(rest[0], deps);
  deps.stderr(
    JSON.stringify({
      error: "unknown_subcommand",
      message: `templates ${sub}`,
    }),
  );
  return { exitCode: 1 };
}

// GitHub OAuth App (public client for the device flow). Swap in the real client_id after creating the OAuth App.
const GITHUB_OAUTH_CLIENT_ID = "PLACEHOLDER_CLIENT_ID";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_FLOW_DEFAULT_INTERVAL_S = 5;

// Hit a GitHub device flow endpoint form-encoded and return JSON. No exhaustive typing;
// the caller looks only at the fields it needs. null on network failure / non-JSON.
async function githubPost(
  deps: CliDeps,
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await deps.fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GitHub device flow → hand the obtained access token to the local server to exchange for a Worker token.
// Empty scope (fetching the public profile alone is enough).
export async function runLogin(deps: CliDeps): Promise<CliResult> {
  const device = await githubPost(deps, GITHUB_DEVICE_CODE_URL, {
    client_id: GITHUB_OAUTH_CLIENT_ID,
  });
  const deviceCode = device?.device_code;
  const userCode = device?.user_code;
  const verificationUri = device?.verification_uri;
  if (
    typeof deviceCode !== "string" ||
    typeof userCode !== "string" ||
    typeof verificationUri !== "string"
  ) {
    return argError(
      deps,
      "login_failed",
      "could not start the GitHub device flow",
    );
  }
  deps.stdout(`Open ${verificationUri} and enter code: ${userCode}`);

  let interval =
    typeof device?.interval === "number"
      ? device.interval
      : DEVICE_FLOW_DEFAULT_INTERVAL_S;
  let accessToken: string | undefined;
  for (;;) {
    await deps.sleep(interval * 1000);
    const poll = await githubPost(deps, GITHUB_ACCESS_TOKEN_URL, {
      client_id: GITHUB_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (typeof poll?.access_token === "string") {
      accessToken = poll.access_token;
      break;
    }
    const error = poll?.error;
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += 5;
      continue;
    }
    // Abort on expired_token / access_denied / unknown error / network failure
    // (continuing won't succeed, or would loop forever).
    return argError(
      deps,
      "login_failed",
      typeof error === "string" ? error : "GitHub device flow failed",
    );
  }

  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ githubAccessToken: accessToken }),
  });
  if (!result.ok) return reportFailure(deps, result);
  const login = (result.data as { login?: string } | null)?.login;
  deps.stdout(`Logged in as ${login}`);
  return { exitCode: 0 };
}

export async function runLogout(deps: CliDeps): Promise<CliResult> {
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, "/api/auth/login", { method: "DELETE" });
  if (!result.ok) return reportFailure(deps, result);
  deps.stdout("Logged out");
  return { exitCode: 0 };
}

// Convert `--expires 30d` / `12h` to seconds. undefined if invalid (the caller turns it into an arg error).
function parseExpires(value: string): number | undefined {
  const match = /^(\d+)([dh])$/.exec(value);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return match[2] === "d" ? n * 86_400 : n * 3_600;
}

// Shared formatting for share errors. Keeps the one-line-JSON contract like other commands while
// putting guidance in message. For statuses that don't match, print the raw body as-is.
function reportShareFailure(
  deps: CliDeps,
  result: PostResult,
  notFoundMessage: string,
): CliResult {
  const error = (result.data as { error?: string } | null)?.error;
  if (result.status === 401 && error === "not_logged_in") {
    return argError(deps, "not_logged_in", "Run `syokan login` first");
  }
  if (result.status === 404 && error === "not_found") {
    return argError(deps, "not_found", notFoundMessage);
  }
  if (error === "materialize_failed") {
    const d = result.data as { path?: string; reason?: string };
    return argError(
      deps,
      "materialize_failed",
      `could not read ${d.path} (${d.reason}); fix the file and retry`,
    );
  }
  if (error === "share_api_unreachable") {
    return argError(
      deps,
      "share_api_unreachable",
      "the share API did not respond; try again later",
    );
  }
  return reportFailure(deps, result);
}

export async function runPublish(
  args: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  let id: string | undefined;
  let expiresIn: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--expires") {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return argError(deps, "missing_option_value", "--expires needs a value");
      }
      const parsed = parseExpires(v);
      if (parsed === undefined) {
        return argError(
          deps,
          "invalid_expires",
          `--expires expects <Nd|Nh> (e.g. 30d, 12h), got: ${v}`,
        );
      }
      expiresIn = parsed;
      i++;
    } else if (a.startsWith("--")) {
      return argError(deps, "unknown_option", a);
    } else if (id !== undefined) {
      return argError(deps, "too_many_args", `unexpected argument: ${a}`);
    } else {
      id = a;
    }
  }
  if (!id) return argError(deps, "missing_id", "snapshot id is required");
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(
    deps,
    `/api/snapshots/${encodeURIComponent(id)}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expiresIn !== undefined ? { expiresIn } : {}),
    },
  );
  if (!result.ok) {
    return reportShareFailure(deps, result, `snapshot ${id} not found`);
  }
  const data = result.data as { url?: string; expiresAt?: string } | null;
  deps.stdout(data?.url ?? JSON.stringify(result.data));
  if (data?.expiresAt) deps.stdout(`Expires: ${data.expiresAt}`);
  return { exitCode: 0 };
}

export async function runShares(deps: CliDeps): Promise<CliResult> {
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, "/api/shares");
  if (!result.ok) {
    return reportShareFailure(deps, result, "share not found");
  }
  const shares =
    (result.data as {
      shares?: Array<{ id: string; url: string; expiresAt: string }>;
    } | null)?.shares ?? [];
  if (shares.length === 0) {
    deps.stdout("No active shares");
    return { exitCode: 0 };
  }
  for (const s of shares) {
    deps.stdout(`${s.id}  ${s.url}  expires ${s.expiresAt}`);
  }
  return { exitCode: 0 };
}

export async function runUnpublish(
  shareId: string | undefined,
  deps: CliDeps,
): Promise<CliResult> {
  if (!shareId) return argError(deps, "missing_id", "share id is required");
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(
    deps,
    `/api/shares/${encodeURIComponent(shareId)}`,
    { method: "DELETE" },
  );
  if (!result.ok) {
    return reportShareFailure(deps, result, `share ${shareId} not found`);
  }
  deps.stdout(`Unpublished ${shareId}`);
  return { exitCode: 0 };
}

// The single source for --help. Both text and --json derive from here, so they don't drift.
// An agent reading this learns the commands, env, exit codes, and output formats, with no dependence on static docs.
// A declaration that consolidates router registration and the help source in one place (help is generated by
// helpManifest below mapping over this). Carries the usage/details for help too.
const COMMANDS: Command<CliDeps, CliResult | Promise<CliResult>>[] = [
  {
    name: "help",
    aliases: ["--help", "-h"],
    usage: "syokan --help [--json]",
    summary: "Show this help (--json prints the manifest as JSON)",
    run: (rest, deps) => runHelp(rest, deps),
  },
  {
    name: "version",
    aliases: ["--version", "-v"],
    usage: "syokan --version",
    summary: "Print the version",
    run: (_rest, deps) => {
      deps.stdout(pkg.version);
      return { exitCode: 0 };
    },
  },
  {
    name: "open",
    usage: "syokan open [id]",
    summary: "Open a snapshot in the browser (home when id is omitted)",
    run: (rest, deps) => runOpen(rest[0], deps),
  },
  {
    name: "stop",
    usage: "syokan stop",
    summary: "Stop the lazy-spawned server",
    run: (_rest, deps) => runStop(deps),
  },
  {
    name: "catalog",
    usage: "syokan catalog",
    summary: "Print the catalog manifest (types + JSON Schema props) as JSON",
    run: (_rest, deps) => runCatalog(deps),
  },
  {
    name: "templates",
    usage: "syokan templates [list|add|get|rm]",
    summary: "Manage saved templates",
    subcommands: [
      {
        usage: "syokan templates",
        summary: "List templates (id/title/description) as JSON",
      },
      {
        usage: "syokan templates add --title <t> [--description <d>] <file|->",
        summary: "Save a template and print its id",
      },
      { usage: "syokan templates get <id>", summary: "Print one template as JSON" },
      { usage: "syokan templates rm <id>", summary: "Delete a template" },
    ],
    run: (rest, deps) => runTemplates(rest, deps),
  },
  {
    name: "login",
    usage: "syokan login",
    summary: "Log in with GitHub (device flow) to enable publishing",
    run: (_rest, deps) => runLogin(deps),
  },
  {
    name: "logout",
    usage: "syokan logout",
    summary: "Log out from the share API",
    run: (_rest, deps) => runLogout(deps),
  },
  {
    name: "publish",
    usage: "syokan publish <id> [--expires <Nd|Nh>]",
    summary:
      "Publish a snapshot to a public URL (frozen at publish time; default expiry 7d, max 30d)",
    run: (rest, deps) => runPublish(rest, deps),
  },
  {
    name: "shares",
    usage: "syokan shares",
    summary: "List your active shares (id, url, expiry)",
    run: (_rest, deps) => runShares(deps),
  },
  {
    name: "unpublish",
    usage: "syokan unpublish <shareId>",
    summary: "Delete a published share",
    run: (rest, deps) => runUnpublish(rest[0], deps),
  },
];

// Static meta for help. The default non-command usages (file/stdin/bare) are held separately in
// forms, distinct from commands.
export const helpManifest = {
  name: "syokan",
  version: pkg.version,
  summary:
    "syokan — LLMs summon rich UI. Post a JSON snapshot envelope; predefined catalog components render it.",
  usage: "syokan [command] [args]   |   <json> | syokan",
  forms: [
    {
      usage: "syokan <file>",
      summary:
        "Post a file: envelope JSON is posted as-is; any other file (md/txt/log/json) is wrapped as a live FileDoc that follows edits. Prints the view URL",
    },
    { usage: "<json> | syokan", summary: "Post a snapshot envelope from stdin" },
    {
      usage: "syokan",
      summary: "Open the home page (or post stdin when JSON is piped)",
    },
  ],
  commands: COMMANDS.map((c) => ({
    usage: c.usage ?? [c.name, ...(c.aliases ?? [])].join(", "),
    summary: c.summary ?? "",
    subcommands: c.subcommands ?? [],
  })),
  env: [
    {
      name: "SYOKAN_BASE_URL",
      summary: "Server base URL (default http://localhost:5173)",
    },
    {
      name: "SYOKAN_SHARE_API",
      summary:
        "Share API origin the server publishes to (default https://syokan.dev)",
    },
    {
      name: "XDG_CONFIG_HOME",
      summary:
        "Config root (default ~/.config); settings.json lives under <root>/syokan",
    },
    {
      name: "XDG_DATA_HOME",
      summary:
        "Data root (default ~/.local/share); templates live under <root>/syokan",
    },
    {
      name: "XDG_STATE_HOME",
      summary:
        "State root (default ~/.local/state); snapshots, pidfile, and log live under <root>/syokan",
    },
  ],
  output:
    "catalog/templates print JSON to stdout; post prints the view URL; every error prints a JSON object to stderr.",
  exitCodes: [
    { code: 0, summary: "success" },
    {
      code: 1,
      summary:
        "error: invalid_json | validation_failed | read_failed | server_unavailable | missing_title | missing_id | unknown_subcommand | unknown_option | not_logged_in | login_failed | invalid_expires | materialize_failed | share_api_unreachable",
    },
  ],
};

function renderHelpText(): string {
  const h = helpManifest;
  const lines = [
    `${h.name} ${h.version} — ${h.summary}`,
    "",
    `Usage: ${h.usage}`,
    "",
    "Forms:",
  ];
  for (const f of h.forms) lines.push(`  ${f.usage}`, `      ${f.summary}`);
  lines.push("", "Commands:");
  for (const c of h.commands) {
    lines.push(`  ${c.usage}`, `      ${c.summary}`);
    for (const s of c.subcommands) lines.push(`    ${s.usage}`, `        ${s.summary}`);
  }
  lines.push("", "Environment:");
  for (const e of h.env) lines.push(`  ${e.name}`, `      ${e.summary}`);
  lines.push("", `Output: ${h.output}`, "", "Exit codes:");
  for (const x of h.exitCodes) lines.push(`  ${x.code}  ${x.summary}`);
  lines.push("", "Machine-readable help: syokan --help --json");
  return lines.join("\n");
}

// help is purely local output. Return immediately without starting the server. --json prints the manifest as-is.
export function runHelp(argv: readonly string[], deps: CliDeps): CliResult {
  const asJson = argv.includes("--json");
  deps.stdout(asJson ? JSON.stringify(helpManifest) : renderHelpText());
  return { exitCode: 0 };
}

const cli = createRouter<CliDeps, CliResult | Promise<CliResult>>({
  commands: COMMANDS,
  // No args: post if content is streaming on stdin, otherwise open home
  // (isTTY is falsy for both a pipe and /dev/null, so empty input falls to home).
  noArgs: async (deps) => {
    const piped = deps.stdinIsPipe() ? await deps.readStdin() : "";
    return piped.trim() ? postText(piped, deps) : runOpen(undefined, deps);
  },
  // A first arg that's neither a reserved word nor a flag is posted as a file path.
  fallback: (first, _rest, deps) => runPost(first, deps),
  // An unknown `-`-prefixed token avoids being treated as a file (ENOENT) and returns the same JSON contract as other errors.
  onUnknownOption: (token, deps) => {
    deps.stderr(
      JSON.stringify({
        error: "unknown_option",
        message: `unknown option '${token}', see: syokan --help`,
      }),
    );
    return { exitCode: 1 };
  },
});

export async function main(
  argv: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  return cli(argv, deps);
}

// ---- real deps (only when executed directly) ----

function portFromBaseUrl(baseUrl: string): number {
  try {
    const p = new URL(baseUrl).port;
    return p ? Number(p) : 5173;
  } catch {
    return 5173;
  }
}

function pidFilePath(port: number): string {
  return join(runtimeDir(), `server-${port}.json`);
}

// In the single binary process.execPath points at our own binary; in dev it points at the bun runtime.
// Used to decide how to spawn (re-exec ourselves, or start the source via bun).
function isCompiledBinary(): boolean {
  return basename(process.execPath).replace(/\.exe$/i, "") !== "bun";
}

function realSpawnServer(baseUrl: string): SpawnResult {
  const port = portFromBaseUrl(baseUrl);
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  const logFd = openSync(join(dir, `server-${port}.log`), "a");
  // The single binary re-execs itself (process.execPath) in server mode; dev starts the source
  // via bun. entry branches on SYOKAN_SERVE.
  const cmd = isCompiledBinary()
    ? [process.execPath]
    : ["bun", fileURLToPath(new URL("../server/index.ts", import.meta.url))];
  const proc = Bun.spawn(cmd, {
    // Detach into a separate process group to survive the parent CLI's exit (unref alone can still
    // take a SIGHUP and die when the parent's session ends). Default to prod if NODE_ENV is unset.
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: process.env.NODE_ENV ?? "production",
      SYOKAN_SERVE: "1",
    },
    stdout: logFd,
    stderr: logFd,
    stdin: "ignore",
  });
  // Drop the reference from the parent's event loop so the CLI can exit immediately
  proc.unref();
  writeFileSync(
    pidFilePath(port),
    JSON.stringify({ pid: proc.pid, port, baseUrl }),
  );
  return { pid: proc.pid };
}

async function realStopServer(baseUrl: string): Promise<StopResult> {
  const port = portFromBaseUrl(baseUrl);
  const file = pidFilePath(port);
  if (!existsSync(file)) return { stopped: false };
  let pid: number | undefined;
  try {
    pid = (JSON.parse(readFileSync(file, "utf8")) as { pid?: number }).pid;
  } catch {
    // A pidfile corrupted by a broken / interrupted write. Clean it up and treat as nothing-to-stop
    rmSync(file, { force: true });
    return { stopped: false };
  }
  if (typeof pid !== "number") {
    rmSync(file, { force: true });
    return { stopped: false };
  }
  // To avoid killing an unrelated process due to PID reuse, kill only when a syokan server
  // actually responds at the recorded baseUrl. If it's down, just clean up the
  // pidfile (= nothing-to-stop) to avoid a mistaken kill.
  let healthy = false;
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  if (!healthy) {
    rmSync(file, { force: true });
    return { stopped: false };
  }
  try {
    process.kill(pid);
  } catch {
    // Clean up the pidfile even if it's already dead
  }
  rmSync(file, { force: true });
  return { stopped: true, pid };
}

// Assemble the runtime deps and run the CLI. Called from both entry.ts (the single binary's
// dual-mode) and direct execution (`bun cli/syokan.ts`).
export async function runCli(): Promise<void> {
  const baseUrl = process.env.SYOKAN_BASE_URL ?? "http://localhost:5173";
  const deps: CliDeps = {
    fetch: globalThis.fetch,
    readFile: (path) => readFile(path, "utf8"),
    // Canonicalize (resolve symlink/`..`/relative). If missing (realpath ENOENT), fall back to
    // resolve so the post still goes through and the view shows not_found.
    resolvePath: (path) => {
      try {
        return realpathSync(path);
      } catch {
        return resolve(path);
      }
    },
    fileSize: (path) => {
      try {
        return statSync(path).size;
      } catch {
        return -1;
      }
    },
    readStdin: () => Bun.stdin.text(),
    stdinIsPipe: () => !process.stdin.isTTY,
    stdout: (line) => {
      process.stdout.write(`${line}\n`);
    },
    stderr: (line) => {
      process.stderr.write(`${line}\n`);
    },
    baseUrl,
    spawnServer: () => realSpawnServer(baseUrl),
    stopServer: () => realStopServer(baseUrl),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    openUrl: (url) => {
      // Hand to the default browser via the per-OS opener. unref so it isn't cut off when the CLI exits.
      const cmd =
        process.platform === "darwin"
          ? ["open", url]
          : process.platform === "win32"
            ? ["cmd", "/c", "start", "", url]
            : ["xdg-open", url];
      Bun.spawn(cmd, {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }).unref();
    },
  };
  // For the single binary too, argv is [exe, <embedded entry>, ...args] — same shape as dev — so slice(2).
  const { exitCode } = await main(process.argv.slice(2), deps);
  process.exit(exitCode);
}

if (import.meta.main) {
  await runCli();
}

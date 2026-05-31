#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SpawnResult = { pid: number };
export type StopResult = { stopped: boolean; pid?: number };

export type CliDeps = {
  fetch: typeof fetch;
  readFile: (path: string) => Promise<string>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  baseUrl: string;
  // lazy-spawn 用: server を detached で起動する
  spawnServer: () => SpawnResult;
  // `syokan stop` 用: lazy-spawn した server を停止する
  stopServer: () => StopResult | Promise<StopResult>;
  // readiness poll の待機 (test では即時 resolve を注入する)
  sleep: (ms: number) => Promise<void>;
};

export type CliResult = { exitCode: number };

type PostResult = { ok: boolean; status: number; data: unknown };

// cold start は shiki / react-markdown の import + bind を含むため余裕を持たせる
// (15s)。短すぎると ready 直前に server_unavailable を返して server を orphan 化する。
const READY_RETRIES = 150;
const READY_INTERVAL_MS = 100;

export function deriveTitle(body: string, file: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const heading = /^#\s+(.+)$/.exec(line);
    if (heading?.[1]) return heading[1].trim();
    if (line.length > 0) break;
  }
  return basename(file).replace(/\.md$/i, "");
}

export function buildMarkdownPayload(
  body: string,
  opts?: { title?: string; sourceLabel?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    root: { type: "MarkdownDoc", props: { body } },
  };
  if (opts?.title) payload.title = opts.title;
  if (opts?.sourceLabel) {
    payload.metadata = { source: { label: opts.sourceLabel } };
  }
  return payload;
}

export function buildTextPayload(
  body: string,
  opts?: { title?: string; sourceLabel?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    root: { type: "PlainText", props: { body } },
  };
  if (opts?.title) payload.title = opts.title;
  if (opts?.sourceLabel) {
    payload.metadata = { source: { label: opts.sourceLabel } };
  }
  return payload;
}

async function isHealthy(deps: CliDeps): Promise<boolean> {
  try {
    const res = await deps.fetch(`${deps.baseUrl}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// lazy-spawn: server が既に居れば使い、居なければ起動して ready になるまで待つ
export async function ensureServerRunning(
  deps: CliDeps,
): Promise<{ ok: true; spawned: boolean } | { ok: false; error: string }> {
  if (await isHealthy(deps)) return { ok: true, spawned: false };
  deps.spawnServer();
  for (let i = 0; i < READY_RETRIES; i++) {
    await deps.sleep(READY_INTERVAL_MS);
    if (await isHealthy(deps)) return { ok: true, spawned: true };
  }
  return {
    ok: false,
    error: `server did not become ready within ${
      (READY_RETRIES * READY_INTERVAL_MS) / 1000
    }s`,
  };
}

async function postItems(deps: CliDeps, payload: unknown): Promise<PostResult> {
  const res = await deps.fetch(`${deps.baseUrl}/api/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
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
  const payload =
    result.data ?? { error: "request_failed", status: result.status };
  deps.stderr(JSON.stringify(payload));
  return { exitCode: 1 };
}

// post 系コマンド共通: server を ensure (lazy-spawn) してから payload を投げる
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
  return result.ok ? reportSuccess(deps, result.data) : reportFailure(deps, result);
}

// 入力種別を識別する。拡張子を最優先で見る: .json は中身が壊れていても JSON
// として扱い (markdown に化けて MarkdownDoc 投稿される事故を防ぎ、invalid_json を
// 返す)、.md / .markdown は markdown、.txt / .log は整形しない PlainText。
// 拡張子が無いときだけ中身で判定する: JSON envelope は必ず object なので、trim 後の
// 先頭が `{` なら json、それ以外は markdown とみなす (議事録/メモは markdown 期待が多い)。
export function classifyInput(
  file: string,
  text: string,
): "json" | "markdown" | "text" {
  const lower = file.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text";
  return text.trimStart().startsWith("{") ? "json" : "markdown";
}

// 単一 post コマンド。markdown は MarkdownDoc envelope に包み、JSON はそのまま
// envelope として投げる。種別は classifyInput で決める。
export async function runPost(file: string, deps: CliDeps): Promise<CliResult> {
  let text: string;
  try {
    text = await deps.readFile(file);
  } catch (err) {
    deps.stderr(JSON.stringify({ error: "read_failed", message: String(err) }));
    return { exitCode: 1 };
  }

  const kind = classifyInput(file, text);
  if (kind === "markdown") {
    const payload = buildMarkdownPayload(text, {
      title: deriveTitle(text, file),
      sourceLabel: "manual-cli",
    });
    return postWithServer(deps, payload);
  }
  if (kind === "text") {
    // plain text / log は markdown の H1 抽出が効かないので title は file 名にする
    const payload = buildTextPayload(text, {
      title: basename(file),
      sourceLabel: "manual-cli",
    });
    return postWithServer(deps, payload);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    deps.stderr(JSON.stringify({ error: "invalid_json", message: String(err) }));
    return { exitCode: 1 };
  }
  return postWithServer(deps, payload);
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

type Command = {
  arg?: string; // 必須の位置引数名 (省略 = 引数不要)
  run: (
    deps: CliDeps,
    file: string,
  ) => CliResult | Promise<CliResult>;
};

const COMMANDS: Record<string, Command> = {
  post: {
    arg: "<file.md|file.json>",
    run: (deps, file) => runPost(file, deps),
  },
  stop: {
    run: (deps) => runStop(deps),
  },
};

export async function main(
  argv: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  const [command, file] = argv;
  const entry = command ? COMMANDS[command] : undefined;
  if (!entry) {
    const names = Object.keys(COMMANDS).join("|");
    deps.stderr(
      `unknown command: ${command ?? "(none)"}\nusage: syokan <${names}> [file]`,
    );
    return { exitCode: 2 };
  }
  if (entry.arg && !file) {
    deps.stderr(`usage: syokan ${command} ${entry.arg}`);
    return { exitCode: 2 };
  }
  return entry.run(deps, file ?? "");
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

function runtimeDir(): string {
  return process.env.SYOKAN_RUNTIME_DIR ?? join(homedir(), ".syokan");
}

function pidFilePath(port: number): string {
  return join(runtimeDir(), `server-${port}.json`);
}

function realSpawnServer(baseUrl: string): SpawnResult {
  const port = portFromBaseUrl(baseUrl);
  const serverEntry = fileURLToPath(
    new URL("../server/index.ts", import.meta.url),
  );
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  const logFd = openSync(join(dir, `server-${port}.log`), "a");
  const proc = Bun.spawn(["bun", serverEntry], {
    env: { ...process.env, PORT: String(port) },
    stdout: logFd,
    stderr: logFd,
    stdin: "ignore",
  });
  // CLI が exit しても server を生かす
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
    // 破損 / 中断書き込みで壊れた pidfile。掃除して nothing-to-stop 扱いにする
    rmSync(file, { force: true });
    return { stopped: false };
  }
  if (typeof pid !== "number") {
    rmSync(file, { force: true });
    return { stopped: false };
  }
  // PID 再利用で無関係なプロセスを kill しないよう、記録した baseUrl で
  // syokan server が実際に応答しているときだけ kill する。落ちていれば
  // pidfile を掃除するだけ (= nothing-to-stop) にして誤 kill を避ける。
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
    // 既に死んでいても pidfile は片付ける
  }
  rmSync(file, { force: true });
  return { stopped: true, pid };
}

if (import.meta.main) {
  const baseUrl = process.env.SYOKAN_BASE_URL ?? "http://localhost:5173";
  const deps: CliDeps = {
    fetch: globalThis.fetch,
    readFile: (path) => readFile(path, "utf8"),
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
  };
  const { exitCode } = await main(process.argv.slice(2), deps);
  process.exit(exitCode);
}

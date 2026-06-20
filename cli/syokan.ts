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
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type SpawnResult = { pid: number };
export type StopResult = { stopped: boolean; pid?: number };

export type CliDeps = {
  fetch: typeof fetch;
  readFile: (path: string) => Promise<string>;
  // 引数なし起動時の post 入力 (`... | syokan`)
  readStdin: () => Promise<string>;
  // 引数なし起動で stdin が pipe / redirect か (端末でないか) の判定
  stdinIsPipe: () => boolean;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  baseUrl: string;
  // lazy-spawn 用: server を detached で起動する
  spawnServer: () => SpawnResult;
  // `syokan stop` 用: lazy-spawn した server を停止する
  stopServer: () => StopResult | Promise<StopResult>;
  // readiness poll の待機 (test では即時 resolve を注入する)
  sleep: (ms: number) => Promise<void>;
  // 閲覧 URL を OS のデフォルトブラウザに渡す
  openUrl: (url: string) => void;
};

export type CliResult = { exitCode: number };

type PostResult = { ok: boolean; status: number; data: unknown };

// cold start は shiki / react-markdown の import + bind を含むため余裕を持たせる
// (15s)。短すぎると ready 直前に server_unavailable を返して server を orphan 化する。
const READY_RETRIES = 150;
const READY_INTERVAL_MS = 100;

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
  const res = await deps.fetch(`${deps.baseUrl}/api/snapshots`, {
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

// 入力は JSON envelope のみ。markdown / plain text を表示したい場合も MarkdownDoc /
// PlainText catalog を使って envelope の中で表現する。source の label など metadata も
// envelope に書く (CLI 側では一切付与しない)。
async function postText(text: string, deps: CliDeps): Promise<CliResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    deps.stderr(JSON.stringify({ error: "invalid_json", message: String(err) }));
    return { exitCode: 1 };
  }
  return postWithServer(deps, payload);
}

export async function runPost(file: string, deps: CliDeps): Promise<CliResult> {
  let text: string;
  try {
    text = await deps.readFile(file);
  } catch (err) {
    deps.stderr(JSON.stringify({ error: "read_failed", message: String(err) }));
    return { exitCode: 1 };
  }
  return postText(text, deps);
}

// open に渡された引数を閲覧 URL に正規化する。post の出力 (フル URL / `/views/:id`)
// と bare id のどれを渡してもそのまま開けるようにする。
export function resolveViewUrl(idOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//.test(idOrUrl)) return idOrUrl;
  const path = idOrUrl.startsWith("/")
    ? idOrUrl
    : `/views/${encodeURIComponent(idOrUrl)}`;
  return `${baseUrl}${path}`;
}

// ブラウザで開く。閲覧には server が必要なので post と同じく lazy-spawn する。
// id 省略時は home (snapshot 一覧) を開く。
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

// post を default action にする: open / stop 以外の第一引数はファイルパスとして post し、
// 専用の unknown-command 扱いはしない。引数なしの振り分けは下の inline コメント参照。
export async function main(
  argv: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  const [first, second] = argv;
  if (first === "open") return runOpen(second, deps);
  if (first === "stop") return runStop(deps);
  if (first === undefined) {
    // isTTY は pipe でも /dev/null でも falsy なので、空入力は home を開く方に倒す
    // (素打ち = open。実際に中身が流れたときだけ post)。
    const piped = deps.stdinIsPipe() ? await deps.readStdin() : "";
    return piped.trim() ? postText(piped, deps) : runOpen(undefined, deps);
  }
  return runPost(first, deps);
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
      // OS ごとの opener でデフォルトブラウザに渡す。CLI が exit しても切られないよう unref。
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
  const { exitCode } = await main(process.argv.slice(2), deps);
  process.exit(exitCode);
}

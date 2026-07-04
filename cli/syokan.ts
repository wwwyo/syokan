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
// compile 時に JSON ごとバイナリへ埋め込まれる (= そのバイナリのバージョン)
import pkg from "../package.json";
import { type Command, createRouter } from "./router";

export type SpawnResult = { pid: number };
export type StopResult = { stopped: boolean; pid?: number };

export type CliDeps = {
  fetch: typeof fetch;
  readFile: (path: string) => Promise<string>;
  // FileDoc に包むときの絶対パス解決 (canonical 化)。dedup 識別子に使う。
  resolvePath: (path: string) => string;
  // ファイルサイズ (byte)。stat 不能 (未存在等) は -1。巨大ファイルを読まずに弾くのに使う。
  fileSize: (path: string) => number;
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

// absent=居ない / compatible=この build と同系 / incompatible=旧 build が居る。
// 旧 build は health に version を返さない。新 CLI がそれを黙って再利用すると
// catalog/templates が 404 になり、stop も別 pidfile を見て止められないため区別する。
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

// lazy-spawn: server が既に居れば使い、居なければ起動して ready になるまで待つ。
// 旧 build が同じ port に居る場合は黙って再利用せず、停止を促すエラーを返す。
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

// API を叩いて本文を JSON として読む共通処理。本文が JSON でなければ data=null。
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

// server の PUT は「既にある前提」(無ければ 404) なので、呼び出し側が
// 初回か否かを判定しなくて済むよう、404 のときだけここで POST にフォールバックする。
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
  return result.ok
    ? reportSuccess(deps, result.data)
    : reportFailure(deps, result);
}

// 入力は JSON envelope のみ。markdown / plain text を表示したい場合も MarkdownDoc /
// PlainText catalog を使って envelope の中で表現する。source の label など metadata も
// envelope に書く (CLI 側では一切付与しない)。
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

// envelope か否かの軽量判定。catalog の full schema を import すると React component 群が
// CLI バンドルに混入するため使わない。`root` が Item 形 (`{ type: string, ... }`) かだけを見る。
// 壊れた envelope はここを通し、server の strict 検証に validation_failed を返させる。
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

// ファイルを FileDoc 1 ノードの envelope に包む。title / source.label は basename、
// 同じファイルを指す再 post が同じ id/url を指すよう、dedup 識別子 (idempotencyKey)
// は絶対パスとする (FR-15〜17)。
function wrapFileDoc(absPath: string): unknown {
  const name = basename(absPath);
  return {
    title: name,
    root: { type: "FileDoc", props: { path: absPath } },
    metadata: { source: { label: name } },
    idempotencyKey: `filedoc:${absPath}`,
  };
}

// FileDoc の表示上限と揃える。これを超えるファイルは envelope ではありえず、表示もできない
// ので、CLI が内容を読まずに FileDoc へ包む (巨大 log を丸ごと読んで OOM するのを防ぐ。
// server 側が too_large を表示する)。
const SNIFF_SIZE_LIMIT = 2 * 1024 * 1024;

// `syokan <path>`: 内容が envelope schema を満たすなら従来どおり post、満たさなければ
// 絶対パスに解決して FileDoc に包んで post する (FR-13/14)。markdown/log/txt は JSON.parse
// に失敗するので自動的に wrap 経路へ入る。
export async function runPost(file: string, deps: CliDeps): Promise<CliResult> {
  // 表示上限超のファイルは sniff せず即 wrap する (内容を読み込まない)。
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

// open に渡された引数を閲覧 URL に正規化する。post の出力 (フル URL / `/snapshots/:id`)
// と bare id のどれを渡してもそのまま開けるようにする。
export function resolveViewUrl(idOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//.test(idOrUrl)) return idOrUrl;
  const path = idOrUrl.startsWith("/")
    ? idOrUrl
    : `/snapshots/${encodeURIComponent(idOrUrl)}`;
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

// catalog / templates は server を要する API なので post と同じく lazy-spawn する。
// 起動できなければ server_unavailable を返し、ここで処理を打ち切る。
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

// 引数欠落を統一フォーマットの error JSON で返す。
function argError(deps: CliDeps, error: string, message: string): CliResult {
  deps.stderr(JSON.stringify({ error, message }));
  return { exitCode: 1 };
}

// GET 系 API を server ensure 後に叩き、本文 (JSON) を stdout に出す共通処理。
async function getJson(deps: CliDeps, path: string): Promise<CliResult> {
  const fail = await ensureOrFail(deps);
  if (fail) return fail;
  const result = await apiCall(deps, path);
  if (!result.ok) return reportFailure(deps, result);
  deps.stdout(JSON.stringify(result.data));
  return { exitCode: 0 };
}

// catalog は src/catalogs が SSOT。LLM はこの出力を見て props を組む。
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
  // agent の誤入力 (option 値の欠落・未知 flag・source の重複) を正常入力として
  // 飲み込まず、明示エラーにする。値が次の flag を巻き込むのを防ぐ。
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
  // 雛形 JSON は file か stdin。`-` / 省略は stdin (post と同じく流し込めるように)。
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

// templates: 一覧 (省略 / list)、add、get <id>、rm <id>。すべて API 経由。
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

// --help の単一ソース。text と --json はどちらもここから導出するので drift しない。
// agent はこれを読めばコマンド・env・exit code・出力形式を把握でき、静的 doc に依存しない。
// router 登録と help の出所を 1 箇所に集約する宣言 (help は下の helpManifest が
// これを map して生成する)。help 用の usage/details も併せて持たせる。
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
];

// help の静的メタ。コマンドでない既定の使い方 (file/stdin/bare) は commands と区別して
// forms に分けて持つ。
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
        "error: invalid_json | validation_failed | read_failed | server_unavailable | missing_title | missing_id | unknown_subcommand | unknown_option",
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

// help は純粋にローカル出力。server を起こさず即返す。--json で manifest をそのまま出す。
export function runHelp(argv: readonly string[], deps: CliDeps): CliResult {
  const asJson = argv.includes("--json");
  deps.stdout(asJson ? JSON.stringify(helpManifest) : renderHelpText());
  return { exitCode: 0 };
}

const cli = createRouter<CliDeps, CliResult | Promise<CliResult>>({
  commands: COMMANDS,
  // 引数なし: stdin に中身が流れていれば post、無ければ home を開く
  // (isTTY は pipe でも /dev/null でも falsy なので、空入力は home に倒す)。
  noArgs: async (deps) => {
    const piped = deps.stdinIsPipe() ? await deps.readStdin() : "";
    return piped.trim() ? postText(piped, deps) : runOpen(undefined, deps);
  },
  // 予約語でも flag でもない第一引数はファイルパスとして post する。
  fallback: (first, _rest, deps) => runPost(first, deps),
  // 未知の `-` 始まりはファイル扱い (ENOENT) を避け、他エラーと同じ JSON 契約で返す。
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

// 単体バイナリでは process.execPath が自前バイナリ、dev は bun runtime を指す。
// spawn 方法 (自分を再 exec か、bun でソースを起動か) の判定に使う。
function isCompiledBinary(): boolean {
  return basename(process.execPath).replace(/\.exe$/i, "") !== "bun";
}

function realSpawnServer(baseUrl: string): SpawnResult {
  const port = portFromBaseUrl(baseUrl);
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  const logFd = openSync(join(dir, `server-${port}.log`), "a");
  // 単体バイナリは自分自身 (process.execPath) を server モードで再 exec、dev は bun で
  // ソースを起動する。entry が SYOKAN_SERVE を見て分岐する。
  const cmd = isCompiledBinary()
    ? [process.execPath]
    : ["bun", fileURLToPath(new URL("../server/index.ts", import.meta.url))];
  const proc = Bun.spawn(cmd, {
    // 親 CLI 終了後も生かすため別 process group に切り離す (unref だけだと親の
    // session 終了で SIGHUP を受けて落ちうる)。NODE_ENV 未設定なら prod 既定。
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
  // 親の event loop から参照を外し、CLI が即 exit できるようにする
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

// 実行時 deps を組んで CLI を回す。entry.ts (単体バイナリの dual-mode) と
// 直接実行 (`bun cli/syokan.ts`) の両方から呼ぶ。
export async function runCli(): Promise<void> {
  const baseUrl = process.env.SYOKAN_BASE_URL ?? "http://localhost:5173";
  const deps: CliDeps = {
    fetch: globalThis.fetch,
    readFile: (path) => readFile(path, "utf8"),
    // canonical 化 (symlink/`..`/相対 を解決)。未存在 (realpath が ENOENT) は resolve に
    // 落として post は通し、view 側で not_found を表示させる。
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
  // 単体バイナリも argv は [exe, <embedded entry>, ...args] と dev と同形なので slice(2)。
  const { exitCode } = await main(process.argv.slice(2), deps);
  process.exit(exitCode);
}

if (import.meta.main) {
  await runCli();
}

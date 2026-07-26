#!/usr/bin/env bun
// Smoke test against a COMPILED syokan binary (usage: bun smoke.ts [path-to-binary]).
// Guards "the distributed artifact itself works": lazy-spawn via re-exec, the embedded frontend's
// server, and TreeDoc file-follow over SSE — paths a dev-mode `bun test` never exercises.
// Runs fully isolated (temp XDG dirs + its own port), so it can't touch a real install.
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = process.argv[2] ?? fileURLToPath(new URL("../dist/syokan", import.meta.url));

// Let the OS hand out a free ephemeral port instead of deriving one from the PID —
// a fixed guess can collide with whatever else runs on a shared CI runner.
function freePort(): number {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const picked = listener.port;
  listener.stop(true);
  return picked;
}

const port = freePort();
const baseUrl = `http://localhost:${port}`;
const work = mkdtempSync(join(tmpdir(), "syokan-smoke-"));
const env = {
  ...process.env,
  SYOKAN_BASE_URL: baseUrl,
  XDG_CONFIG_HOME: join(work, "config"),
  XDG_DATA_HOME: join(work, "data"),
  XDG_STATE_HOME: join(work, "state"),
};

// Thrown instead of exiting so the outer finally still tears down the spawned server / temp dir.
class SmokeFailure extends Error {
  constructor(step: string, detail: string) {
    super(`smoke: FAIL at ${step}\n${detail}`);
  }
}

async function run(args: string[], stdin?: string): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn([bin, ...args], {
    env,
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    console.log(`smoke: ok - ${name}`);
    return result;
  } catch (e) {
    throw new SmokeFailure(name, e instanceof Error ? e.message : String(e));
  }
}

let failed = false;
try {
  await step("--help runs", async () => {
    const r = await run(["--help"]);
    if (r.code !== 0 || !r.out.includes("syokan")) throw new Error(`exit=${r.code}\n${r.err}`);
  });

  const snapshotUrl = await step("post envelope via stdin (lazy-spawns server)", async () => {
    const envelope = JSON.stringify({
      title: "smoke",
      root: { type: "Heading", props: { text: "smoke" } },
    });
    const r = await run([], envelope);
    if (r.code !== 0 || !r.out.includes("/snapshots/")) throw new Error(`exit=${r.code} out=${r.out}\n${r.err}`);
    return r.out;
  });

  await step("posted snapshot is retrievable via API", async () => {
    const id = snapshotUrl.split("/snapshots/")[1];
    const res = await fetch(`${baseUrl}/api/snapshots/${id}`);
    if (!res.ok) throw new Error(`GET /api/snapshots/${id} -> ${res.status}`);
    const body = (await res.json()) as { title?: string };
    if (body.title !== "smoke") throw new Error(`unexpected body: ${JSON.stringify(body)}`);
  });

  await step("view URL serves the SPA HTML", async () => {
    const res = await fetch(snapshotUrl);
    const html = await res.text();
    if (!res.ok || !html.includes("<script")) throw new Error(`status=${res.status}`);
  });

  const treePath = join(work, "tree.json");
  await step("syokan <path> summons a bare tree as TreeDoc", async () => {
    writeFileSync(treePath, JSON.stringify({ type: "Heading", props: { text: "smoke v1" } }));
    const r = await run([treePath]);
    if (r.code !== 0 || !r.out.includes("/snapshots/")) throw new Error(`exit=${r.code} out=${r.out}\n${r.err}`);
  });

  await step("GET /api/files returns the tree content", async () => {
    const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(treePath)}`);
    const body = (await res.json()) as { content?: string };
    if (!res.ok || !body.content?.includes("smoke v1")) throw new Error(`status=${res.status} body=${JSON.stringify(body)}`);
  });

  await step("editor-style save (write tmp + rename) is notified over SSE", async () => {
    const res = await fetch(`${baseUrl}/api/files/watch?path=${encodeURIComponent(treePath)}`);
    if (!res.ok || !res.body) throw new Error(`watch -> ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const readUntil = async (marker: string, timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (!buffer.includes(marker)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`timed out waiting for ${JSON.stringify(marker)}; got: ${JSON.stringify(buffer)}`);
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${JSON.stringify(marker)}; got: ${JSON.stringify(buffer)}`)), remaining)),
        ]);
        if (chunk.done) throw new Error("SSE stream closed early");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    };
    await readUntil(": connected", 5000);
    // The atomic-save shape (inode swap) — the save style that broke naive watching (AGENTS.md pitfall).
    const tmp = `${treePath}.tmp`;
    writeFileSync(tmp, JSON.stringify({ type: "Heading", props: { text: "smoke v2" } }));
    renameSync(tmp, treePath);
    await readUntil("event: change", 10000);
    await reader.cancel();
  });

  await step("refetch returns the updated content", async () => {
    const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent(treePath)}`);
    const body = (await res.json()) as { content?: string };
    if (!res.ok || !body.content?.includes("smoke v2")) throw new Error(`status=${res.status} body=${JSON.stringify(body)}`);
  });

  await step("syokan stop shuts the server down", async () => {
    // Assert the exit code and the observable effect (health goes down) — not the CLI's
    // human-readable wording, which may change without the stop behavior changing.
    const r = await run(["stop"]);
    if (r.code !== 0) throw new Error(`exit=${r.code}\n${r.err}`);
    const deadline = Date.now() + 5000;
    for (;;) {
      try {
        await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      } catch {
        return;
      }
      if (Date.now() > deadline) throw new Error("server still answers /api/health after stop");
      await new Promise((r2) => setTimeout(r2, 100));
    }
  });

  console.log("smoke: PASS");
} catch (e) {
  failed = true;
  console.error(e instanceof Error ? e.message : String(e));
} finally {
  // Best-effort teardown so a failed run doesn't leave an orphan server or temp dir.
  await run(["stop"]).catch(() => {});
  rmSync(work, { recursive: true, force: true });
}
if (failed) process.exit(1);

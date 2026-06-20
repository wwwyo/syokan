import { describe, expect, test } from "bun:test";
import {
  type CliDeps,
  ensureServerRunning,
  main,
  resolveViewUrl,
} from "./syokan";

type Captured = {
  url: string;
  body: unknown;
};

type Harness = {
  deps: CliDeps;
  out: string[];
  err: string[];
  calls: Captured[];
  opened: string[];
  spawnCount: () => number;
  stopCalls: () => number;
};

function makeDeps(opts: {
  files?: Record<string, string>;
  respond: (captured: Captured) => Response;
  // /api/health の応答を制御する。未指定なら常に healthy (= server 起動済み扱い)
  health?: () => boolean;
  stopped?: boolean;
  // stdin の中身。指定すると pipe 扱い (stdinIsPipe=true) になる
  stdin?: string;
}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const calls: Captured[] = [];
  const opened: string[] = [];
  let spawns = 0;
  let stops = 0;
  const healthFn = opts.health ?? (() => true);

  const deps: CliDeps = {
    baseUrl: "http://localhost:5173",
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    sleep: async () => {},
    openUrl: (url) => opened.push(url),
    spawnServer: () => {
      spawns += 1;
      return { pid: 4242 };
    },
    stopServer: () => {
      stops += 1;
      return opts.stopped === false
        ? { stopped: false }
        : { stopped: true, pid: 4242 };
    },
    readFile: async (path) => {
      const content = opts.files?.[path];
      if (content === undefined) {
        const e = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      return content;
    },
    readStdin: async () => opts.stdin ?? "",
    stdinIsPipe: () => opts.stdin !== undefined,
    fetch: (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/health")) {
        return new Response(null, { status: healthFn() ? 200 : 503 });
      }
      const captured: Captured = {
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      };
      calls.push(captured);
      return opts.respond(captured);
    }) as unknown as typeof fetch,
  };
  return {
    deps,
    out,
    err,
    calls,
    opened,
    spawnCount: () => spawns,
    stopCalls: () => stops,
  };
}

function okResponse(id = "generated-id"): Response {
  return Response.json(
    { id, url: `/views/${id}`, snapshot: { id } },
    { status: 201 },
  );
}

function errorResponse(): Response {
  return Response.json(
    {
      error: "validation_failed",
      issues: [{ path: ["root", "type"], message: "invalid", code: "x" }],
    },
    { status: 400 },
  );
}

describe("cli main: post (default action)", () => {
  test("posts the JSON envelope as-is and prints the view URL", async () => {
    const tree = JSON.stringify({
      root: { type: "Heading", props: { text: "T" } },
    });
    const { deps, out, calls } = makeDeps({
      files: { "items.json": tree },
      respond: () => okResponse("xyz"),
    });
    const result = await main(["items.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/views/xyz"]);
    expect(calls[0]?.url).toBe("http://localhost:5173/api/snapshots");
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("Heading");
  });

  test("posts the JSON envelope piped via stdin", async () => {
    const tree = JSON.stringify({
      root: { type: "Heading", props: { text: "piped" } },
    });
    const { deps, out, calls } = makeDeps({
      stdin: tree,
      respond: () => okResponse("piped-1"),
    });
    const result = await main([], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/views/piped-1"]);
    const body = calls[0]?.body as { root: { props: { text: string } } };
    expect(body.root.props.text).toBe("piped");
  });

  test("does not inject any source label (envelope owns metadata)", async () => {
    const tree = JSON.stringify({
      root: { type: "MarkdownDoc", props: { body: "# hi" } },
    });
    const { deps, calls } = makeDeps({
      files: { "doc.json": tree },
      respond: () => okResponse(),
    });
    const result = await main(["doc.json"], deps);
    expect(result.exitCode).toBe(0);
    const body = calls[0]?.body as { metadata?: unknown };
    expect(body.metadata).toBeUndefined();
  });

  test("passes through metadata.source.label written in the envelope", async () => {
    const tree = JSON.stringify({
      root: { type: "MarkdownDoc", props: { body: "# hi" } },
      metadata: { source: { label: "daily-rss" } },
    });
    const { deps, calls } = makeDeps({
      files: { "doc.json": tree },
      respond: () => okResponse(),
    });
    await main(["doc.json"], deps);
    const body = calls[0]?.body as {
      metadata: { source: { label: string } };
    };
    expect(body.metadata.source.label).toBe("daily-rss");
  });

  test("invalid JSON: invalid_json error to stderr, exit non-zero", async () => {
    const { deps, err } = makeDeps({
      files: { "items.json": "{not json" },
      respond: () => okResponse(),
    });
    const result = await main(["items.json"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("invalid_json");
  });

  test("server validation error: error JSON to stderr, exit non-zero", async () => {
    const { deps, out, err } = makeDeps({
      files: {
        "items.json": JSON.stringify({ root: { type: "Bogus", props: {} } }),
      },
      respond: () => errorResponse(),
    });
    const result = await main(["items.json"], deps);
    expect(result.exitCode).toBe(1);
    expect(out).toEqual([]);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("validation_failed");
  });

  test("missing file: read_failed error to stderr, exit non-zero", async () => {
    const { deps, err } = makeDeps({
      files: {},
      respond: () => okResponse(),
    });
    const result = await main(["nope.json"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("read_failed");
  });
});

describe("cli main: bare invocation", () => {
  test("no args + no pipe opens home", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main([], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual(["http://localhost:5173"]);
    expect(h.out[0]).toBe("http://localhost:5173");
    // home を開くだけで /api/snapshots への POST は走らない
    expect(h.calls.length).toBe(0);
  });

  test("no args + pipe posts stdin instead of opening", async () => {
    const h = makeDeps({
      stdin: JSON.stringify({ root: { type: "Stack", props: {} } }),
      respond: () => okResponse("from-pipe"),
    });
    const result = await main([], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual([]);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/snapshots");
  });

  test("no args + empty/blank stdin opens home (not an invalid_json error)", async () => {
    const h = makeDeps({ stdin: "   \n", respond: () => okResponse() });
    const result = await main([], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual(["http://localhost:5173"]);
    expect(h.calls.length).toBe(0);
  });
});

describe("resolveViewUrl", () => {
  const base = "http://localhost:5173";

  test("builds a /views/:id URL from a bare id", () => {
    expect(resolveViewUrl("abc123", base)).toBe(`${base}/views/abc123`);
  });

  test("encodes id segments that need escaping", () => {
    expect(resolveViewUrl("a/b", base)).toBe(`${base}/views/a%2Fb`);
  });

  test("prefixes a path with the base url", () => {
    expect(resolveViewUrl("/views/abc123", base)).toBe(
      `${base}/views/abc123`,
    );
  });

  test("passes a full URL through unchanged (post output)", () => {
    expect(resolveViewUrl(`${base}/views/abc123`, base)).toBe(
      `${base}/views/abc123`,
    );
  });
});

describe("cli main: open", () => {
  test("opens the snapshot URL and prints it", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["open", "abc123"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual(["http://localhost:5173/views/abc123"]);
    expect(h.out[0]).toBe("http://localhost:5173/views/abc123");
  });

  test("lazy-spawns the server before opening when it is down", async () => {
    let up = false;
    const h = makeDeps({
      respond: () => okResponse(),
      health: () => {
        const was = up;
        up = true;
        return was;
      },
    });
    const result = await main(["open", "abc123"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(1);
    expect(h.opened).toEqual(["http://localhost:5173/views/abc123"]);
  });

  test("opens home when no id is given", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["open"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual(["http://localhost:5173"]);
    expect(h.out[0]).toBe("http://localhost:5173");
  });
});

describe("cli main: non-subcommand arg is a file path", () => {
  test("a bare word that is not open/stop is read as a file to post", async () => {
    const { deps, err } = makeDeps({ respond: () => okResponse() });
    const result = await main(["frobnicate"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("read_failed");
  });
});

describe("ensureServerRunning (lazy-spawn)", () => {
  test("does not spawn when the server is already healthy", async () => {
    const h = makeDeps({ respond: () => okResponse(), health: () => true });
    const result = await ensureServerRunning(h.deps);
    expect(result).toEqual({ ok: true, spawned: false });
    expect(h.spawnCount()).toBe(0);
  });

  test("spawns and waits until the server becomes healthy", async () => {
    let checks = 0;
    const h = makeDeps({
      respond: () => okResponse(),
      // 最初の health (spawn 前) と直後 2 回は落ちていて、その後 ready になる
      health: () => {
        checks += 1;
        return checks > 3;
      },
    });
    const result = await ensureServerRunning(h.deps);
    expect(result).toEqual({ ok: true, spawned: true });
    expect(h.spawnCount()).toBe(1);
  });

  test("returns an error if the server never becomes ready", async () => {
    const h = makeDeps({ respond: () => okResponse(), health: () => false });
    const result = await ensureServerRunning(h.deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("did not become ready");
    expect(h.spawnCount()).toBe(1);
  });
});

describe("cli main: lazy-spawn integration", () => {
  test("post spawns the server when down, then posts", async () => {
    let checks = 0;
    const h = makeDeps({
      files: {
        "items.json": JSON.stringify({ root: { type: "Stack", props: {} } }),
      },
      respond: () => okResponse("spawned-1"),
      health: () => {
        checks += 1;
        return checks > 1; // 初回 (起動前) だけ落ちている
      },
    });
    const result = await main(["items.json"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(1);
    expect(h.out).toEqual(["http://localhost:5173/views/spawned-1"]);
    expect(h.err.some((l) => l.includes("started server"))).toBe(true);
    // health は calls に積まれず、POST だけが記録される
    expect(h.calls.length).toBe(1);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/snapshots");
  });

  test("post does not spawn when the server is already up", async () => {
    const h = makeDeps({
      files: { "items.json": JSON.stringify({ root: { type: "Stack", props: {} } }) },
      respond: () => okResponse("reuse-1"),
      health: () => true,
    });
    const result = await main(["items.json"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(0);
    expect(h.out).toEqual(["http://localhost:5173/views/reuse-1"]);
  });

  test("post reports server_unavailable if it never comes up", async () => {
    const h = makeDeps({
      files: {
        "items.json": JSON.stringify({ root: { type: "Stack", props: {} } }),
      },
      respond: () => okResponse(),
      health: () => false,
    });
    const result = await main(["items.json"], h.deps);
    expect(result.exitCode).toBe(1);
    expect(h.out).toEqual([]);
    const parsed = JSON.parse(h.err.at(-1) as string) as { error: string };
    expect(parsed.error).toBe("server_unavailable");
  });
});

describe("cli main: stop", () => {
  test("stops a syokan-managed server", async () => {
    const h = makeDeps({ respond: () => okResponse(), stopped: true });
    const result = await main(["stop"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.stopCalls()).toBe(1);
    expect(h.err[0]).toContain("stopped server");
  });

  test("reports nothing-to-stop when no managed server exists", async () => {
    const h = makeDeps({ respond: () => okResponse(), stopped: false });
    const result = await main(["stop"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.err[0]).toContain("no syokan-managed server");
  });
});

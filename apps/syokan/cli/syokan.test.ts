import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import {
  type CliDeps,
  ensureServerRunning,
  main,
  resolveViewUrl,
} from "./syokan";

type Captured = {
  url: string;
  method: string;
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
  // Controls the /api/health response. Always healthy if unset (= treated as server already up)
  health?: () => boolean;
  // true drops version from health, mimicking an old-build server (= incompatible)
  legacyServer?: boolean;
  stopped?: boolean;
  // stdin contents. Setting it marks it as a pipe (stdinIsPipe=true)
  stdin?: string;
  // stat size (bytes) per path. 0 if unset.
  fileSizes?: Record<string, number>;
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
    // Don't use real realpath; resolve deterministically to `/abs/<path>` (for assertions).
    resolvePath: (path) => `/abs/${path}`,
    fileSize: (path) => opts.fileSizes?.[path] ?? 0,
    readStdin: async () => opts.stdin ?? "",
    stdinIsPipe: () => opts.stdin !== undefined,
    fetch: (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/health")) {
        if (!healthFn()) return new Response(null, { status: 503 });
        // An old build returns no version. A new build carries a version and is treated as compatible.
        return opts.legacyServer
          ? Response.json({ ok: true })
          : Response.json({ ok: true, version: "test" });
      }
      const captured: Captured = {
        url,
        method: init?.method ?? "GET",
        // A non-JSON body (the device flow's form-encoded) is kept as a raw string
        body: init?.body ? parseBodyLoose(init.body as string) : undefined,
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

function parseBodyLoose(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function okResponse(id = "generated-id"): Response {
  return Response.json(
    { id, url: `/snapshots/${id}`, snapshot: { id } },
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
    expect(out).toEqual(["http://localhost:5173/snapshots/xyz"]);
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
    expect(out).toEqual(["http://localhost:5173/snapshots/piped-1"]);
    const body = calls[0]?.body as { root: { props: { text: string } } };
    expect(body.root.props.text).toBe("piped");
  });

  test("does not inject any source label (envelope owns metadata)", async () => {
    const tree = JSON.stringify({
      root: { type: "PlainText", props: { body: "hi" } },
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
      root: { type: "PlainText", props: { body: "hi" } },
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

  test("invalid JSON via stdin: invalid_json error to stderr, exit non-zero", async () => {
    const { deps, err } = makeDeps({
      stdin: "{not json",
      respond: () => okResponse(),
    });
    const result = await main([], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("invalid_json");
  });

  test("bare catalog tree file is wrapped as a live TreeDoc (title/label/key = basename/abs path)", async () => {
    const { deps, out, calls } = makeDeps({
      files: {
        "dashboard.json": JSON.stringify({
          type: "Heading",
          props: { text: "hi" },
        }),
      },
      respond: () => okResponse("tree-1"),
    });
    const result = await main(["dashboard.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/snapshots/tree-1"]);
    const body = calls[0]?.body as {
      title: string;
      root: { type: string; props: { path: string } };
      metadata: { source: { label: string } };
      idempotencyKey: string;
    };
    expect(body.root.type).toBe("TreeDoc");
    expect(body.root.props.path).toBe("/abs/dashboard.json");
    expect(body.title).toBe("dashboard.json");
    expect(body.metadata.source.label).toBe("dashboard.json");
    expect(body.idempotencyKey).toBe("treedoc:/abs/dashboard.json");
    // A payload with an idempotencyKey tries PUT (update) first.
    expect(calls[0]?.method).toBe("PUT");
  });

  test("PUT 404 not_found falls back to POST to create the snapshot (first-ever post of a key)", async () => {
    const { deps, out, calls } = makeDeps({
      files: {
        "dashboard.json": JSON.stringify({ type: "Text", props: { body: "b" } }),
      },
      respond: (captured) =>
        captured.method === "PUT"
          ? Response.json({ error: "not_found" }, { status: 404 })
          : okResponse("created-1"),
    });
    const result = await main(["dashboard.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/snapshots/created-1"]);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "POST"]);
    expect(calls[1]?.body).toEqual(calls[0]?.body);
  });

  test("PUT 200 (existing key) does not fall back to POST", async () => {
    const { deps, calls } = makeDeps({
      files: {
        "dashboard.json": JSON.stringify({ type: "Text", props: { body: "b" } }),
      },
      respond: (captured) =>
        captured.method === "PUT"
          ? okResponse("existing-1")
          : Response.json({ error: "unexpected_post" }, { status: 500 }),
    });
    const result = await main(["dashboard.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(calls.map((c) => c.method)).toEqual(["PUT"]);
  });

  test("non-JSON file is rejected with unsupported_input (nothing posted)", async () => {
    const { deps, calls, err } = makeDeps({
      files: { "notes.md": "# Meeting notes\n\n- Decisions" },
      respond: () => okResponse(),
    });
    const result = await main(["notes.md"], deps);
    expect(result.exitCode).toBe(1);
    expect(calls).toEqual([]);
    const parsed = JSON.parse(err[0] as string) as {
      error: string;
      message: string;
    };
    expect(parsed.error).toBe("unsupported_input");
    expect(parsed.message).toContain("envelope");
    expect(parsed.message).toContain("catalog tree");
  });

  test("JSON that is neither an envelope nor a tree is rejected with unsupported_input", async () => {
    const { deps, calls, err } = makeDeps({
      files: { "config.json": JSON.stringify({ port: 5173, name: "x" }) },
      respond: () => okResponse(),
    });
    const result = await main(["config.json"], deps);
    expect(result.exitCode).toBe(1);
    expect(calls).toEqual([]);
    expect((JSON.parse(err[0] as string) as { error: string }).error).toBe(
      "unsupported_input",
    );
  });

  test("a type field alone does not make a tree (package.json-like input is rejected)", async () => {
    const { deps, calls, err } = makeDeps({
      files: { "package.json": JSON.stringify({ type: "module", name: "x" }) },
      respond: () => okResponse(),
    });
    const result = await main(["package.json"], deps);
    expect(result.exitCode).toBe(1);
    expect(calls).toEqual([]);
    expect((JSON.parse(err[0] as string) as { error: string }).error).toBe(
      "unsupported_input",
    );
  });

  test("a .json file over the sniff limit is wrapped as a TreeDoc without reading its contents", async () => {
    let read = false;
    const { deps, calls } = makeDeps({
      fileSizes: { "huge.json": 5 * 1024 * 1024 },
      respond: () => okResponse(),
    });
    // Record if readFile is called (confirming a huge file isn't read).
    const orig = deps.readFile;
    deps.readFile = async (p) => {
      read = true;
      return orig(p);
    };
    const result = await main(["huge.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(read).toBe(false);
    const body = calls[0]?.body as { root: { type: string; props: { path: string } } };
    expect(body.root.type).toBe("TreeDoc");
    expect(body.root.props.path).toBe("/abs/huge.json");
  });

  test("a non-.json file over the sniff limit is rejected without reading its contents", async () => {
    let read = false;
    const { deps, calls, err } = makeDeps({
      fileSizes: { "huge.log": 5 * 1024 * 1024 },
      respond: () => okResponse(),
    });
    const orig = deps.readFile;
    deps.readFile = async (p) => {
      read = true;
      return orig(p);
    };
    const result = await main(["huge.log"], deps);
    expect(result.exitCode).toBe(1);
    expect(read).toBe(false);
    expect(calls).toEqual([]);
    expect((JSON.parse(err[0] as string) as { error: string }).error).toBe(
      "unsupported_input",
    );
  });

  test("envelope JSON file is posted as-is (not wrapped, no injected idempotencyKey)", async () => {
    const { deps, calls } = makeDeps({
      files: {
        "view.json": JSON.stringify({
          root: { type: "Heading", props: { text: "T" } },
        }),
      },
      respond: () => okResponse(),
    });
    await main(["view.json"], deps);
    const body = calls[0]?.body as {
      root: { type: string };
      idempotencyKey?: string;
    };
    expect(body.root.type).toBe("Heading");
    expect(body.idempotencyKey).toBeUndefined();
  });

  test("re-posting the same path yields a stable idempotencyKey", async () => {
    const { deps, calls } = makeDeps({
      files: {
        "tree.json": JSON.stringify({ type: "Text", props: { body: "b" } }),
      },
      respond: () => okResponse(),
    });
    await main(["tree.json"], deps);
    await main(["tree.json"], deps);
    const a = calls[0]?.body as { idempotencyKey: string };
    const b = calls[1]?.body as { idempotencyKey: string };
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
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
    // Just opens home; no POST to /api/snapshots runs
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

  test("builds a /snapshots/:id URL from a bare id", () => {
    expect(resolveViewUrl("abc123", base)).toBe(`${base}/snapshots/abc123`);
  });

  test("encodes id segments that need escaping", () => {
    expect(resolveViewUrl("a/b", base)).toBe(`${base}/snapshots/a%2Fb`);
  });

  test("prefixes a path with the base url", () => {
    expect(resolveViewUrl("/snapshots/abc123", base)).toBe(
      `${base}/snapshots/abc123`,
    );
  });

  test("passes a full URL through unchanged (post output)", () => {
    expect(resolveViewUrl(`${base}/snapshots/abc123`, base)).toBe(
      `${base}/snapshots/abc123`,
    );
  });
});

describe("cli main: open", () => {
  test("opens the snapshot URL and prints it", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["open", "abc123"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.opened).toEqual(["http://localhost:5173/snapshots/abc123"]);
    expect(h.out[0]).toBe("http://localhost:5173/snapshots/abc123");
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
    expect(h.opened).toEqual(["http://localhost:5173/snapshots/abc123"]);
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
      // The first health (before spawn) and the next 2 are down, then it becomes ready
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

  test("refuses an incompatible (pre-version) server without spawning", async () => {
    const h = makeDeps({ respond: () => okResponse(), legacyServer: true });
    const result = await ensureServerRunning(h.deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("older syokan server");
    expect(h.spawnCount()).toBe(0);
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
        return checks > 1; // down only on the first (before startup)
      },
    });
    const result = await main(["items.json"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(1);
    expect(h.out).toEqual(["http://localhost:5173/snapshots/spawned-1"]);
    expect(h.err.some((l) => l.includes("started server"))).toBe(true);
    // health isn't pushed into calls; only the POST is recorded
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
    expect(h.out).toEqual(["http://localhost:5173/snapshots/reuse-1"]);
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

describe("cli main: help", () => {
  test("--help prints text help without touching the server", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["--help"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.calls.length).toBe(0);
    expect(h.spawnCount()).toBe(0);
    const text = h.out[0] as string;
    expect(text).toContain("Usage:");
    expect(text).toContain("syokan catalog");
    expect(text).toContain("syokan templates add");
  });

  test("-h and help are aliases", async () => {
    for (const arg of ["-h", "help"]) {
      const h = makeDeps({ respond: () => okResponse() });
      const result = await main([arg], h.deps);
      expect(result.exitCode).toBe(0);
      expect(h.out[0]).toContain("Usage:");
    }
  });

  test("--help --json emits a machine-readable manifest", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["--help", "--json"], h.deps);
    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(h.out[0] as string) as {
      name: string;
      commands: Array<{ usage: string }>;
      env: Array<{ name: string }>;
    };
    expect(manifest.name).toBe("syokan");
    expect(manifest.commands.some((c) => c.usage.startsWith("syokan catalog"))).toBe(
      true,
    );
    expect(manifest.env.some((e) => e.name === "SYOKAN_BASE_URL")).toBe(true);
  });
});

describe("cli main: catalog", () => {
  test("GETs /api/catalog and prints the JSON", async () => {
    const h = makeDeps({
      respond: () => Response.json({ items: [{ type: "Stack" }] }),
    });
    const result = await main(["catalog"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/catalog");
    expect(h.calls[0]?.method).toBe("GET");
    const data = JSON.parse(h.out[0] as string) as { items: unknown[] };
    expect(data.items.length).toBe(1);
  });
});

describe("cli main: templates", () => {
  test("bare 'templates' lists via GET /api/templates", async () => {
    const h = makeDeps({
      respond: () => Response.json({ items: [{ id: "a", title: "A" }] }),
    });
    const result = await main(["templates"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/templates");
    expect(h.calls[0]?.method).toBe("GET");
  });

  test("add --title reads file and POSTs title+json, prints id", async () => {
    const h = makeDeps({
      files: { "t.json": JSON.stringify({ root: { type: "Stack", props: {} } }) },
      respond: () => Response.json({ id: "tmpl-1" }, { status: 201 }),
    });
    const result = await main(
      ["templates", "add", "--title", "RSS", "--description", "daily", "t.json"],
      h.deps,
    );
    expect(result.exitCode).toBe(0);
    expect(h.out).toEqual(["tmpl-1"]);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/templates");
    expect(h.calls[0]?.method).toBe("POST");
    const body = h.calls[0]?.body as {
      title: string;
      description: string;
      json: { root: { type: string } };
    };
    expect(body.title).toBe("RSS");
    expect(body.description).toBe("daily");
    expect(body.json.root.type).toBe("Stack");
  });

  test("add reads json from stdin when source is omitted", async () => {
    const h = makeDeps({
      stdin: JSON.stringify({ root: { type: "Card", props: {} } }),
      respond: () => Response.json({ id: "tmpl-2" }, { status: 201 }),
    });
    const result = await main(["templates", "add", "--title", "Piped"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.out).toEqual(["tmpl-2"]);
    const body = h.calls[0]?.body as { json: { root: { type: string } } };
    expect(body.json.root.type).toBe("Card");
  });

  test("add without --title fails before any request", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["templates", "add", "t.json"], h.deps);
    expect(result.exitCode).toBe(1);
    expect(h.calls.length).toBe(0);
    const err = JSON.parse(h.err[0] as string) as { error: string };
    expect(err.error).toBe("missing_title");
  });

  test("add rejects an option whose value is swallowed by the next flag", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(
      ["templates", "add", "--title", "--description", "foo", "t.json"],
      h.deps,
    );
    expect(result.exitCode).toBe(1);
    expect(h.calls.length).toBe(0);
    const err = JSON.parse(h.err[0] as string) as { error: string };
    expect(err.error).toBe("missing_option_value");
  });

  test("add rejects an unknown option and duplicate sources", async () => {
    for (const args of [
      ["templates", "add", "--title", "x", "--bogus", "t.json"],
      ["templates", "add", "--title", "x", "a.json", "b.json"],
    ]) {
      const h = makeDeps({ respond: () => okResponse() });
      const result = await main(args, h.deps);
      expect(result.exitCode).toBe(1);
      expect(h.calls.length).toBe(0);
    }
  });

  test("get <id> GETs the template", async () => {
    const h = makeDeps({
      respond: () => Response.json({ id: "x", title: "X", json: {} }),
    });
    const result = await main(["templates", "get", "x"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/templates/x");
    expect(h.calls[0]?.method).toBe("GET");
  });

  test("rm <id> DELETEs the template", async () => {
    const h = makeDeps({ respond: () => Response.json({ ok: true }) });
    const result = await main(["templates", "rm", "x"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/templates/x");
    expect(h.calls[0]?.method).toBe("DELETE");
  });

  test("unknown subcommand fails", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["templates", "bogus"], h.deps);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(h.err[0] as string) as { error: string };
    expect(err.error).toBe("unknown_subcommand");
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

describe("cli main: version / unknown option", () => {
  test.each(["--version", "-v", "version"])(
    "%s prints the package version without spawning a server",
    async (flag) => {
      const h = makeDeps({ respond: () => okResponse() });
      const result = await main([flag], h.deps);
      expect(result.exitCode).toBe(0);
      expect(h.out).toEqual([pkg.version]);
      expect(h.spawnCount()).toBe(0);
    },
  );

  test("an unknown flag errors as JSON instead of reading it as a file", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["--bogus"], h.deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(h.err[0] as string) as {
      error: string;
      message: string;
    };
    expect(parsed.error).toBe("unknown_option");
    expect(parsed.message).toContain("--bogus");
    expect(h.err[0]).not.toContain("ENOENT");
  });
});

describe("cli main: help (generated from command declarations)", () => {
  test("--help text lists every declared command and the version, without spawning", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    const result = await main(["--help"], h.deps);
    expect(result.exitCode).toBe(0);
    const text = h.out.join("\n");
    for (const usage of [
      "syokan open [id]",
      "syokan stop",
      "syokan catalog",
      "syokan templates [list|add|get|rm]",
      "syokan --version",
    ]) {
      expect(text).toContain(usage);
    }
    expect(text).toContain(pkg.version);
    expect(h.spawnCount()).toBe(0);
  });

  test("--help --json emits a manifest whose commands come from the declarations", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    await main(["--help", "--json"], h.deps);
    const manifest = JSON.parse(h.out[0] as string) as {
      commands: { usage: string }[];
    };
    const usages = manifest.commands.map((c) => c.usage);
    expect(usages).toContain("syokan open [id]");
    expect(usages).toContain("syokan templates [list|add|get|rm]");
  });
});

describe("cli main: share commands (login / logout / publish / shares / unpublish)", () => {
  const DEVICE_CODE_URL = "https://github.com/login/device/code";
  const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

  test("login: device flow polls until the token arrives, then exchanges it via the local server", async () => {
    let polls = 0;
    const { deps, out, calls } = makeDeps({
      respond: (captured) => {
        if (captured.url === DEVICE_CODE_URL) {
          return Response.json({
            device_code: "dev-1",
            user_code: "ABCD-1234",
            verification_uri: "https://github.com/login/device",
            interval: 0,
          });
        }
        if (captured.url === ACCESS_TOKEN_URL) {
          polls += 1;
          return polls === 1
            ? Response.json({ error: "authorization_pending" })
            : Response.json({ access_token: "gh-tok" });
        }
        return Response.json({ login: "octocat" });
      },
    });
    const result = await main(["login"], deps);
    expect(result.exitCode).toBe(0);
    expect(out[0]).toBe(
      "Open https://github.com/login/device and enter code: ABCD-1234",
    );
    expect(out[1]).toBe("Logged in as octocat");
    // The GitHub token obtained via the device flow is handed to the local server (the CLI doesn't store it)
    const exchange = calls.find((c) => c.url.endsWith("/api/auth/login"));
    expect(exchange?.method).toBe("POST");
    expect(exchange?.body).toEqual({ githubAccessToken: "gh-tok" });
  });

  test("login: access_denied stops polling and fails with login_failed", async () => {
    const { deps, err } = makeDeps({
      respond: (captured) => {
        if (captured.url === DEVICE_CODE_URL) {
          return Response.json({
            device_code: "dev-1",
            user_code: "ABCD-1234",
            verification_uri: "https://github.com/login/device",
            interval: 0,
          });
        }
        return Response.json({ error: "access_denied" });
      },
    });
    const result = await main(["login"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("login_failed");
  });

  test("logout: DELETE /api/auth/login and print Logged out", async () => {
    const { deps, out, calls } = makeDeps({
      respond: () => Response.json({ ok: true }),
    });
    const result = await main(["logout"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["Logged out"]);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("http://localhost:5173/api/auth/login");
  });

  test("publish: posts expiresIn (12h -> seconds) and prints url + expiry", async () => {
    const { deps, out, calls } = makeDeps({
      respond: () =>
        Response.json(
          {
            id: "s1",
            url: "https://syokan.dev/shares/s1",
            expiresAt: "2026-07-11T00:00:00.000Z",
          },
          { status: 201 },
        ),
    });
    const result = await main(["publish", "abc", "--expires", "12h"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual([
      "https://syokan.dev/shares/s1",
      "Expires: 2026-07-11T00:00:00.000Z",
    ]);
    expect(calls[0]?.url).toBe(
      "http://localhost:5173/api/snapshots/abc/publish",
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toEqual({ expiresIn: 43_200 });
  });

  test("publish: 401 not_logged_in points at `syokan login`", async () => {
    const { deps, err } = makeDeps({
      respond: () =>
        Response.json({ error: "not_logged_in" }, { status: 401 }),
    });
    const result = await main(["publish", "abc"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as {
      error: string;
      message: string;
    };
    expect(parsed.error).toBe("not_logged_in");
    expect(parsed.message).toContain("syokan login");
  });

  test("publish: 422 materialize_failed is reported with path + reason", async () => {
    const { deps, err } = makeDeps({
      respond: () =>
        Response.json(
          { error: "materialize_failed", path: "/x/gone.md", reason: "not_found" },
          { status: 422 },
        ),
    });
    const result = await main(["publish", "abc"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as {
      error: string;
      message: string;
    };
    expect(parsed.error).toBe("materialize_failed");
    expect(parsed.message).toContain("/x/gone.md");
    expect(parsed.message).toContain("not_found");
  });

  test("publish: an invalid --expires value is an arg error (no request is made)", async () => {
    const { deps, err, calls } = makeDeps({ respond: () => okResponse() });
    const result = await main(["publish", "abc", "--expires", "30x"], deps);
    expect(result.exitCode).toBe(1);
    expect(calls).toEqual([]);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("invalid_expires");
  });

  test("publish: missing id is an arg error", async () => {
    const { deps, err } = makeDeps({ respond: () => okResponse() });
    const result = await main(["publish"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("missing_id");
  });

  test("shares: prints one line per share", async () => {
    const { deps, out } = makeDeps({
      respond: () =>
        Response.json({
          shares: [
            {
              id: "s1",
              url: "https://syokan.dev/shares/s1",
              sourceSnapshotId: "a",
              createdAt: "c",
              expiresAt: "e1",
            },
            {
              id: "s2",
              url: "https://syokan.dev/shares/s2",
              sourceSnapshotId: "b",
              createdAt: "c",
              expiresAt: "e2",
            },
          ],
        }),
    });
    const result = await main(["shares"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual([
      "s1  https://syokan.dev/shares/s1  expires e1",
      "s2  https://syokan.dev/shares/s2  expires e2",
    ]);
  });

  test("shares: empty list prints 'No active shares'", async () => {
    const { deps, out } = makeDeps({
      respond: () => Response.json({ shares: [] }),
    });
    const result = await main(["shares"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["No active shares"]);
  });

  test("unpublish: DELETE /api/shares/:id and print confirmation", async () => {
    const { deps, out, calls } = makeDeps({
      respond: () => Response.json({ ok: true }),
    });
    const result = await main(["unpublish", "s1"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["Unpublished s1"]);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("http://localhost:5173/api/shares/s1");
  });

  test("--help lists the share commands", async () => {
    const h = makeDeps({ respond: () => okResponse() });
    await main(["--help"], h.deps);
    const text = h.out.join("\n");
    for (const usage of [
      "syokan login",
      "syokan logout",
      "syokan publish <id> [--expires <Nd|Nh>]",
      "syokan shares",
      "syokan unpublish <shareId>",
    ]) {
      expect(text).toContain(usage);
    }
  });
});

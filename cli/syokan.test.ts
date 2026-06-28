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
  // /api/health の応答を制御する。未指定なら常に healthy (= server 起動済み扱い)
  health?: () => boolean;
  // true で health から version を落とし、旧 build の server を模す (= incompatible)
  legacyServer?: boolean;
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
        if (!healthFn()) return new Response(null, { status: 503 });
        // 旧 build は version を返さない。新 build は version 付きで compatible 扱い。
        return opts.legacyServer
          ? Response.json({ ok: true })
          : Response.json({ ok: true, version: "test" });
      }
      const captured: Captured = {
        url,
        method: init?.method ?? "GET",
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
        return checks > 1; // 初回 (起動前) だけ落ちている
      },
    });
    const result = await main(["items.json"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(1);
    expect(h.out).toEqual(["http://localhost:5173/snapshots/spawned-1"]);
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

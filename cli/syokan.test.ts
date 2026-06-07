import { describe, expect, test } from "bun:test";
import {
  type CliDeps,
  buildMarkdownPayload,
  buildTextPayload,
  classifyInput,
  deriveTitle,
  ensureServerRunning,
  main,
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
  spawnCount: () => number;
  stopCalls: () => number;
};

function makeDeps(opts: {
  files?: Record<string, string>;
  respond: (captured: Captured) => Response;
  // /api/health の応答を制御する。未指定なら常に healthy (= server 起動済み扱い)
  health?: () => boolean;
  stopped?: boolean;
}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const calls: Captured[] = [];
  let spawns = 0;
  let stops = 0;
  const healthFn = opts.health ?? (() => true);

  const deps: CliDeps = {
    baseUrl: "http://localhost:5173",
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    sleep: async () => {},
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

describe("deriveTitle", () => {
  test("uses the first markdown H1 heading", () => {
    expect(deriveTitle("# My Title\n\nbody", "/x/notes.md")).toBe("My Title");
  });

  test("falls back to filename without extension", () => {
    expect(deriveTitle("no heading here", "/x/meeting-notes.md")).toBe(
      "meeting-notes",
    );
  });
});

describe("buildMarkdownPayload", () => {
  test("wraps body in a MarkdownDoc root", () => {
    const payload = buildMarkdownPayload("# hi") as {
      root: { type: string; props: { body: string } };
    };
    expect(payload.root.type).toBe("MarkdownDoc");
    expect(payload.root.props.body).toBe("# hi");
  });

  test("attaches title and source label when provided", () => {
    const payload = buildMarkdownPayload("# hi", {
      title: "T",
      sourceLabel: "manual-cli",
    }) as {
      title: string;
      metadata: { source: { label: string } };
    };
    expect(payload.title).toBe("T");
    expect(payload.metadata.source.label).toBe("manual-cli");
  });
});

describe("buildTextPayload", () => {
  test("wraps body in a PlainText root (no markdown parsing)", () => {
    const payload = buildTextPayload("# literal\nlog line") as {
      root: { type: string; props: { body: string } };
    };
    expect(payload.root.type).toBe("PlainText");
    expect(payload.root.props.body).toBe("# literal\nlog line");
  });

  test("attaches title and source label when provided", () => {
    const payload = buildTextPayload("x", {
      title: "app.log",
      sourceLabel: "manual-cli",
    }) as { title: string; metadata: { source: { label: string } } };
    expect(payload.title).toBe("app.log");
    expect(payload.metadata.source.label).toBe("manual-cli");
  });
});

describe("classifyInput", () => {
  test("treats a .json extension as json even if the body looks like markdown", () => {
    expect(classifyInput("/x/tree.json", "# not really markdown")).toBe("json");
  });

  test("treats .md / .markdown extensions as markdown even if the body is JSON", () => {
    expect(classifyInput("/x/note.md", "{}")).toBe("markdown");
    expect(classifyInput("/x/note.markdown", "{}")).toBe("markdown");
  });

  test("treats .txt / .log extensions as text", () => {
    expect(classifyInput("/x/notes.txt", "# literal hash")).toBe("text");
    expect(classifyInput("/x/app.log", "[INFO] started")).toBe("text");
  });

  test("extensionless: a leading { is treated as json", () => {
    expect(classifyInput("/x/clip", '  {"root":{}}')).toBe("json");
  });

  test("extensionless: anything else is treated as markdown", () => {
    expect(classifyInput("/x/clip", "# heading")).toBe("markdown");
  });
});

describe("cli main: post (markdown file)", () => {
  test("prints the view URL on success and exits 0", async () => {
    const { deps, out, calls } = makeDeps({
      files: { "doc.md": "# Hello\n\nworld" },
      respond: () => okResponse("abc-123"),
    });
    const result = await main(["post", "doc.md"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/views/abc-123"]);
    expect(calls[0]?.url).toBe("http://localhost:5173/api/items");
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("MarkdownDoc");
  });

  test("writes error JSON to stderr and exits non-zero on validation failure", async () => {
    const { deps, out, err } = makeDeps({
      files: { "doc.md": "# Hello" },
      respond: () => errorResponse(),
    });
    const result = await main(["post", "doc.md"], deps);
    expect(result.exitCode).toBe(1);
    expect(out).toEqual([]);
    expect(err.length).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("validation_failed");
  });

  test("missing file: error to stderr, exit non-zero", async () => {
    const { deps, err } = makeDeps({
      files: {},
      respond: () => okResponse(),
    });
    const result = await main(["post", "nope.md"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("read_failed");
  });

  test("missing file argument: usage error exit 2", async () => {
    const { deps, err } = makeDeps({ respond: () => okResponse() });
    const result = await main(["post"], deps);
    expect(result.exitCode).toBe(2);
    expect(err[0]).toContain("usage");
  });
});

describe("cli main: post (json file)", () => {
  test("posts a raw JSON tree and prints the URL", async () => {
    const tree = JSON.stringify({
      root: { type: "Heading", props: { text: "T" } },
    });
    const { deps, out, calls } = makeDeps({
      files: { "items.json": tree },
      respond: () => okResponse("xyz"),
    });
    const result = await main(["post", "items.json"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/views/xyz"]);
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("Heading");
  });

  test("invalid JSON file: error to stderr, exit non-zero", async () => {
    const { deps, err } = makeDeps({
      files: { "items.json": "{not json" },
      respond: () => okResponse(),
    });
    const result = await main(["post", "items.json"], deps);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("invalid_json");
  });

  test("server validation error: error JSON to stderr, exit non-zero", async () => {
    const { deps, out, err } = makeDeps({
      files: { "items.json": JSON.stringify({ root: { type: "Bogus", props: {} } }) },
      respond: () => errorResponse(),
    });
    const result = await main(["post", "items.json"], deps);
    expect(result.exitCode).toBe(1);
    expect(out).toEqual([]);
    const parsed = JSON.parse(err[0] as string) as { error: string };
    expect(parsed.error).toBe("validation_failed");
  });
});

describe("cli main: post (text/log file)", () => {
  test("routes a .log file through PlainText with the filename as title", async () => {
    const { deps, out, calls } = makeDeps({
      files: { "app.log": "[INFO] started\n# not a heading\n* not a bullet" },
      respond: () => okResponse("log-1"),
    });
    const result = await main(["post", "app.log"], deps);
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["http://localhost:5173/views/log-1"]);
    const body = calls[0]?.body as {
      root: { type: string; props: { body: string } };
      title: string;
    };
    expect(body.root.type).toBe("PlainText");
    expect(body.root.props.body).toContain("# not a heading");
    expect(body.title).toBe("app.log");
  });

  test("routes a .txt file through PlainText", async () => {
    const { deps, calls } = makeDeps({
      files: { "notes.txt": "plain text body" },
      respond: () => okResponse("txt-1"),
    });
    const result = await main(["post", "notes.txt"], deps);
    expect(result.exitCode).toBe(0);
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("PlainText");
  });
});

describe("cli main: post (extensionless file)", () => {
  test("routes a JSON-looking body to a raw post", async () => {
    const { deps, calls } = makeDeps({
      files: {
        clip: JSON.stringify({ root: { type: "Heading", props: { text: "h" } } }),
      },
      respond: () => okResponse("ext-json"),
    });
    const result = await main(["post", "clip"], deps);
    expect(result.exitCode).toBe(0);
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("Heading");
  });

  test("routes a markdown-looking body through MarkdownDoc", async () => {
    const { deps, calls } = makeDeps({
      files: { clip: "# Title\n\nbody" },
      respond: () => okResponse("ext-md"),
    });
    const result = await main(["post", "clip"], deps);
    expect(result.exitCode).toBe(0);
    const body = calls[0]?.body as { root: { type: string } };
    expect(body.root.type).toBe("MarkdownDoc");
  });
});

describe("cli main: unknown command", () => {
  test("unknown command exits 2 with usage", async () => {
    const { deps, err } = makeDeps({ respond: () => okResponse() });
    const result = await main(["frobnicate"], deps);
    expect(result.exitCode).toBe(2);
    expect(err[0]).toContain("unknown command");
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
  test("post (markdown) spawns the server when down, then posts", async () => {
    let checks = 0;
    const h = makeDeps({
      files: { "doc.md": "# Hi\n\nbody" },
      respond: () => okResponse("spawned-1"),
      health: () => {
        checks += 1;
        return checks > 1; // 初回 (起動前) だけ落ちている
      },
    });
    const result = await main(["post", "doc.md"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(1);
    expect(h.out).toEqual(["http://localhost:5173/views/spawned-1"]);
    expect(h.err.some((l) => l.includes("started server"))).toBe(true);
    // health は calls に積まれず、POST だけが記録される
    expect(h.calls.length).toBe(1);
    expect(h.calls[0]?.url).toBe("http://localhost:5173/api/items");
  });

  test("post does not spawn when the server is already up", async () => {
    const h = makeDeps({
      files: { "items.json": JSON.stringify({ root: { type: "Stack", props: {} } }) },
      respond: () => okResponse("reuse-1"),
      health: () => true,
    });
    const result = await main(["post", "items.json"], h.deps);
    expect(result.exitCode).toBe(0);
    expect(h.spawnCount()).toBe(0);
    expect(h.out).toEqual(["http://localhost:5173/views/reuse-1"]);
  });

  test("post (markdown) reports server_unavailable if it never comes up", async () => {
    const h = makeDeps({
      files: { "doc.md": "# Hi" },
      respond: () => okResponse(),
      health: () => false,
    });
    const result = await main(["post", "doc.md"], h.deps);
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

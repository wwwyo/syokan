import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  fetchShares,
  publishSnapshot,
  ShareControls,
  ShareDialogBody,
  shareDialogTitle,
  ShareList,
  unpublishShare,
} from ".";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(fn: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    fn(String(input), init)) as unknown as typeof fetch;
}

const share = {
  id: "abc-123",
  url: "https://syokan.dev/shares/abc-123",
  expiresAt: "2026-07-11T00:00:00Z",
};

describe("publishSnapshot", () => {
  test("201 → success with the returned share", async () => {
    stubFetch((url, init) => {
      expect(url).toBe("/api/snapshots/k3f9q2/publish");
      expect(init?.method).toBe("POST");
      // hc sends no body; the server treats an empty body as {} (expiresIn omitted)
      expect(init?.body).toBeUndefined();
      return Response.json(share, { status: 201 });
    });
    const result = await publishSnapshot("k3f9q2");
    expect(result).toEqual({ kind: "success", share });
  });

  test("401 not_logged_in → not_logged_in", async () => {
    stubFetch(() =>
      Response.json({ error: "not_logged_in" }, { status: 401 }),
    );
    expect(await publishSnapshot("a")).toEqual({ kind: "not_logged_in" });
  });

  test("422 materialize_failed → error message containing the path", async () => {
    stubFetch(() =>
      Response.json(
        { error: "materialize_failed", path: "/a/b.md", reason: "not_found" },
        { status: 422 },
      ),
    );
    const result = await publishSnapshot("a");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toContain("/a/b.md");
  });

  test("502 share_api_unreachable → error", async () => {
    stubFetch(() =>
      Response.json({ error: "share_api_unreachable" }, { status: 502 }),
    );
    const result = await publishSnapshot("a");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("share service");
    }
  });

  test("network down (fetch reject) → error (does not throw)", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const result = await publishSnapshot("a");
    expect(result.kind).toBe("error");
  });
});

describe("fetchShares", () => {
  test("200 → shares", async () => {
    stubFetch((url) => {
      expect(url).toBe("/api/shares?snapshot=k3f9q2");
      return Response.json({ shares: [share] });
    });
    expect(await fetchShares("k3f9q2")).toEqual([share]);
  });

  test("failure (500 / network down) degrades quietly to []", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    expect(await fetchShares("a")).toEqual([]);
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await fetchShares("a")).toEqual([]);
  });
});

describe("unpublishShare", () => {
  test("200 → true / 500 → false / network down → false", async () => {
    stubFetch((url, init) => {
      expect(url).toBe("/api/shares/abc-123");
      expect(init?.method).toBe("DELETE");
      return Response.json({ ok: true });
    });
    expect(await unpublishShare("abc-123")).toBe(true);
    stubFetch(() => new Response(null, { status: 500 }));
    expect(await unpublishShare("abc-123")).toBe(false);
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await unpublishShare("abc-123")).toBe(false);
  });
});

describe("shareDialogTitle", () => {
  test("switches the title per kind", () => {
    expect(shareDialogTitle({ kind: "success", share })).toBe(
      "Public link created",
    );
    expect(shareDialogTitle({ kind: "not_logged_in" })).toBe("Login required");
    expect(shareDialogTitle({ kind: "error", message: "x" })).toBe(
      "Could not share",
    );
  });
});

describe("ShareDialogBody", () => {
  test("success shows the url, expiry and a copy button", () => {
    const html = renderToString(
      createElement(ShareDialogBody, { result: { kind: "success", share } }),
    );
    expect(html).toContain('data-slot="share-dialog-success"');
    expect(html).toContain("https://syokan.dev/shares/abc-123");
    expect(html).toContain('data-slot="share-copy"');
    expect(html).toContain("Expires");
  });

  test("not_logged_in shows the `syokan login` guidance", () => {
    const html = renderToString(
      createElement(ShareDialogBody, { result: { kind: "not_logged_in" } }),
    );
    expect(html).toContain('data-slot="share-dialog-login"');
    expect(html).toContain("syokan login");
  });

  test("error shows the message", () => {
    const html = renderToString(
      createElement(ShareDialogBody, {
        result: { kind: "error", message: "Could not reach the share service." },
      }),
    );
    expect(html).toContain('data-slot="share-dialog-error"');
    expect(html).toContain("Could not reach the share service.");
  });
});

describe("ShareList", () => {
  test("renders url / expiry / unpublish per share", () => {
    const html = renderToString(
      createElement(ShareList, {
        shares: [share, { ...share, id: "def-456", url: "https://syokan.dev/shares/def-456" }],
        onUnpublish: () => {},
      }),
    );
    expect(html.match(/data-slot="share-list-item"/g)?.length).toBe(2);
    expect(html).toContain("https://syokan.dev/shares/abc-123");
    expect(html).toContain("https://syokan.dev/shares/def-456");
    expect(html).toContain("Unpublish");
    expect(html).toContain("Expires");
  });
});

describe("ShareControls", () => {
  test("always shows the Share button", () => {
    const html = renderToString(
      createElement(ShareControls, { snapshotId: "k3f9q2", initialShares: [] }),
    );
    expect(html).toContain('data-slot="share-button"');
    expect(html).toContain("Share");
  });

  test("shows the Shared chip only when shares exist", () => {
    // The open → unpublish behavior is already tested via unpublishShare through fetch.
    // Here we only confirm the chip's conditional rendering (the derived "shared" display) via SSR.
    const withShares = renderToString(
      createElement(ShareControls, {
        snapshotId: "k3f9q2",
        initialShares: [share],
      }),
    );
    expect(withShares).toContain('data-slot="share-chip"');
    expect(withShares).toContain("Shared");

    const without = renderToString(
      createElement(ShareControls, { snapshotId: "k3f9q2", initialShares: [] }),
    );
    expect(without).not.toContain("share-chip");
  });
});

import { describe, expect, test } from "bun:test";
import { router } from "./router";

type KeyFn = NonNullable<typeof router.options.getScrollRestorationKey>;

// Goes through router.options rather than a standalone helper so that dropping the option from
// createRouter fails here.
function keyOf(location: { pathname: string; hash?: string; search?: object; state?: object }) {
  const getKey = router.options.getScrollRestorationKey;
  if (!getKey) throw new Error("getScrollRestorationKey is not configured on the router");
  return getKey({ hash: "", search: {}, state: {}, ...location } as unknown as Parameters<KeyFn>[0]);
}

describe("router scroll restoration", () => {
  test("is enabled", () => {
    expect(router.options.scrollRestoration).toBe(true);
  });

  test("shares one position per snapshot across history entries, anchor hashes, and search", () => {
    const plain = keyOf({ pathname: "/snapshots/abc" });
    expect(
      keyOf({ pathname: "/snapshots/abc", hash: "section-1", state: { __TSR_key: "entry-2" } }),
    ).toBe(plain);
    expect(
      keyOf({ pathname: "/snapshots/abc", search: { tab: "x" }, state: { __TSR_key: "entry-3" } }),
    ).toBe(plain);
  });

  test("keeps a separate position for each snapshot", () => {
    expect(keyOf({ pathname: "/snapshots/abc" })).not.toBe(keyOf({ pathname: "/snapshots/xyz" }));
  });
});

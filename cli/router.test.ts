import { describe, expect, test } from "bun:test";
import { createRouter } from "./router";

// Ctx / Res は汎用なので、テストでは文字列を返す素の router で挙動だけを見る。
function makeRoute() {
  return createRouter<{ tag: string }, string>({
    commands: [
      {
        name: "open",
        run: (rest, ctx) => `open(${ctx.tag}):${rest.join(",")}`,
      },
      {
        name: "version",
        aliases: ["--version", "-v"],
        run: () => "version",
      },
    ],
    noArgs: (ctx) => `noargs(${ctx.tag})`,
    fallback: (first, rest) => `file:${first}|${rest.join(",")}`,
    onUnknownOption: (token) => `unknown:${token}`,
  });
}

describe("createRouter", () => {
  const ctx = { tag: "t" };

  test("routes by command name and passes the rest args", () => {
    expect(makeRoute()(["open", "a", "b"], ctx)).toBe("open(t):a,b");
  });

  test("routes by alias / shorthand", () => {
    const route = makeRoute();
    expect(route(["--version"], ctx)).toBe("version");
    expect(route(["-v"], ctx)).toBe("version");
  });

  test("empty argv goes to the noArgs handler", () => {
    expect(makeRoute()([], ctx)).toBe("noargs(t)");
  });

  test("a non-flag unknown first arg falls back as positional", () => {
    expect(makeRoute()(["x.json", "y"], ctx)).toBe("file:x.json|y");
  });

  test("a `-` prefixed unknown token is an unknown option, not a file", () => {
    expect(makeRoute()(["--bogus"], ctx)).toBe("unknown:--bogus");
  });

  test("a command token wins over positional even if a same-named file exists", () => {
    // `open` は予約語なので fallback ではなく command に行く
    expect(makeRoute()(["open"], ctx)).toBe("open(t):");
  });

  test("duplicate tokens across commands throw at construction", () => {
    expect(() =>
      createRouter<unknown, string>({
        commands: [
          { name: "a", run: () => "a" },
          { name: "b", aliases: ["a"], run: () => "b" },
        ],
        noArgs: () => "",
        fallback: () => "",
        onUnknownOption: () => "",
      }),
    ).toThrow(/duplicate command token "a"/);
  });
});

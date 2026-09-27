import { describe, expect, test } from "bun:test";
import type { Item } from "../src/schema";
import { redactTree } from "./redact";

describe("redactTree", () => {
  test("a tree without Probe passes through structurally unchanged", () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "S" }, key: "h" },
        { type: "Text", props: { body: "b" } },
      ],
    };
    expect(redactTree(tree)).toEqual(tree);
  });

  test("the input tree is not mutated", () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        {
          type: "Probe",
          props: {
            check: { kind: "file_exists", path: "/a" },
            result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
          },
        },
      ],
    };
    const before = structuredClone(tree);
    const out = redactTree(tree);
    expect(tree).toEqual(before);
    expect(out).not.toBe(tree);
  });

  test("cross-cutting id survives the copy", () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      id: "root",
      children: [{ type: "Text", props: { body: "x" }, id: "risk-1" }],
    };
    const out = redactTree(tree);
    expect(out.id).toBe("root");
    expect(out.children?.[0]?.id).toBe("risk-1");
  });

  test("strips probe check/result unless shareVisible", () => {
    const probe: Item = {
      type: "Probe",
      props: {
        label: "no diff",
        check: {
          kind: "diff_clean",
          repo: "/home/me/repo",
          base: "main",
          paths: ["src/a.ts"],
        },
        result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
      },
    };
    expect(redactTree(probe).props).toEqual({ label: "no diff" });
  });

  test("shareVisible probes keep check/result on publish", () => {
    const probe: Item = {
      type: "Probe",
      props: {
        check: { kind: "file_exists", path: "/repo/README.md" },
        result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
        shareVisible: true,
      },
    };
    const out = redactTree(probe);
    expect(out.props.check).toBeDefined();
    expect(out.props.result).toBeDefined();
  });

  test("probes nested anywhere in the tree are redacted", () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        {
          type: "Card",
          props: {},
          children: [
            {
              type: "Probe",
              props: {
                check: { kind: "file_exists", path: "/secret/place" },
              },
            },
          ],
        },
      ],
    };
    expect(redactTree(tree).children?.[0]?.children?.[0]?.props).toEqual({});
  });
});

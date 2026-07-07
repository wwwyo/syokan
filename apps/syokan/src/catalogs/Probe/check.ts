// Probe check contract, shared by the catalog props (this dir's index.tsx), the run
// API (server/probe.ts, server/routes.ts) and the manifest. A check is one of the
// predefined read-only kinds below — there is deliberately no free-form command:
// "no false green" rests on the renderer being able to re-run exactly what is declared.

import { z } from "zod";
import { absoluteLocalPath } from "../../lib/path";

// op → human label, shared by the run detail (server) and the check description (client)
// so a new op can't render inconsistently between them.
export const SEARCH_OP_LABEL = { eq: "==", max: "<=", min: ">=" } as const;

// A git revision passed to `git diff <base> -- <paths>`. Reject a leading dash so it can
// never be read as a git option (base sits before the `--` separator, unlike paths).
const gitRef = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("-"), "must not start with '-'");

export const probeCheckSchema = z.discriminatedUnion("kind", [
  // the given paths have no diff from base (e.g. "refactor didn't touch behavior files").
  // Target ref = repo HEAD: new commits make the result stale.
  z
    .object({
      kind: z.literal("diff_clean"),
      repo: absoluteLocalPath,
      base: gitRef,
      paths: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  // literal-substring match count under path (file or directory) compares to expected.
  // op: eq (default) / max (<=) / min (>=). No target ref.
  z
    .object({
      kind: z.literal("search_count"),
      path: absoluteLocalPath,
      pattern: z.string().min(1),
      expected: z.int().min(0),
      op: z.enum(["eq", "max", "min"]).optional(),
    })
    .strict(),
  // path existence matches expected (default: must exist). No target ref.
  z
    .object({
      kind: z.literal("file_exists"),
      path: absoluteLocalPath,
      expected: z.boolean().optional(),
    })
    .strict(),
]);

export type ProbeCheck = z.infer<typeof probeCheckSchema>;

export const probeResultSchema = z
  .object({
    status: z.enum(["pass", "fail", "error"]),
    detail: z.string().optional(),
    ranAt: z.iso.datetime(),
    // resolved target ref at run time; present only for kinds that define one
    ref: z.object({ commit: z.string().min(1) }).strict().optional(),
  })
  .strict();

export type ProbeResult = z.infer<typeof probeResultSchema>;

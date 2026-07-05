import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diff } from ".";

// Diff is a catalog component that splits a patch into 1..N files via parsePatchFiles and
// stacks a @pierre/diffs FileDiff per file.
// Shiki highlighting is applied asynchronously after mount (inside the shadow DOM).
// The theme switches by watching documentElement's .dark, so the toolbar's
// light/dark toggle confirms it follows along.
const meta = {
  title: "Catalog/Diff",
  component: Diff,
  tags: ["autodocs"],
} satisfies Meta<typeof Diff>;

export default meta;
type Story = StoryObj<typeof meta>;

const TS_PATCH = `diff --git a/src/lib/date.ts b/src/lib/date.ts
--- a/src/lib/date.ts
+++ b/src/lib/date.ts
@@ -1,6 +1,7 @@
 export function formatDateTime(input: string | Date): string {
-  const d = new Date(input);
-  return d.toLocaleString();
+  const d = typeof input === "string" ? new Date(input) : input;
+  if (Number.isNaN(d.getTime())) return "Invalid Date";
+  return d.toLocaleString("ja-JP", { hour12: false });
 }
`;

const MULTI_HUNK_PATCH = `diff --git a/server/index.ts b/server/index.ts
--- a/server/index.ts
+++ b/server/index.ts
@@ -10,7 +10,7 @@ const routes = {
   "/": indexHtml,
-  "/api/items": itemsHandler,
+  "/api/items": withCors(itemsHandler),
   "/api/health": healthHandler,
 };
@@ -42,6 +42,9 @@ function itemsHandler(req: Request) {
   const body = await req.json();
+  const parsed = itemSchema.safeParse(body);
+  if (!parsed.success) {
+    return Response.json({ error: parsed.error }, { status: 400 });
+  }
   return Response.json({ ok: true });
 }
`;

export const Unified: Story = {
  args: { patch: TS_PATCH, diffStyle: "unified" },
};

export const Split: Story = {
  args: { patch: TS_PATCH, diffStyle: "split" },
};

export const MultipleHunks: Story = {
  args: { patch: MULTI_HUNK_PATCH, diffStyle: "unified" },
};

const MULTI_FILE_PATCH = `diff --git a/src/lib/date.ts b/src/lib/date.ts
--- a/src/lib/date.ts
+++ b/src/lib/date.ts
@@ -1,3 +1,4 @@
 export function formatDateTime(input: string | Date): string {
-  return new Date(input).toLocaleString();
+  const d = typeof input === "string" ? new Date(input) : input;
+  return d.toLocaleString("ja-JP", { hour12: false });
 }
diff --git a/server/index.ts b/server/index.ts
--- a/server/index.ts
+++ b/server/index.ts
@@ -10,6 +10,7 @@ const routes = {
   "/": indexHtml,
+  "/api/items": withCors(itemsHandler),
   "/api/health": healthHandler,
 };
`;

// Passing a multi-file patch (like gh pr diff) as a single node lays out
// FileDiffs with filename headers vertically, one per file.
export const MultipleFiles: Story = {
  args: { patch: MULTI_FILE_PATCH, diffStyle: "unified" },
};

// With multiple files, comment.file specifies the target file (new name or rename source name).
export const MultipleFilesWithComments: Story = {
  args: {
    patch: MULTI_FILE_PATCH,
    diffStyle: "unified",
    comments: [
      {
        file: "src/lib/date.ts",
        side: "new",
        line: 2,
        body: "The type guard lets it accept a Date now.",
        author: "wwwyo",
      },
      {
        file: "server/index.ts",
        side: "new",
        line: 11,
        body: "Is this the right place to apply CORS?",
      },
    ],
  },
};

// Show line comments (lineAnnotations) inline at the target line.
// side: "new" refers to the added side (additions), "old" to the removed side (deletions) line number.
export const WithComments: Story = {
  args: {
    patch: TS_PATCH,
    diffStyle: "unified",
    comments: [
      {
        side: "new",
        line: 2,
        body: "Non-string inputs can arrive too, so adding a type guard. Nice fix.",
        author: "wwwyo",
      },
      {
        side: "new",
        line: 3,
        body: "Glad the Invalid Date handling made it in.",
      },
    ],
  },
};

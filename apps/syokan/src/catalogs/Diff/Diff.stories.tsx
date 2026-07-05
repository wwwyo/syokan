import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diff } from ".";

// Diff は patch を parsePatchFiles で 1..N ファイルに分解し、ファイルごとに
// @pierre/diffs の FileDiff を積む catalog component。
// Shiki ハイライトはマウント後に非同期で適用される (shadow DOM 内)。
// theme は documentElement の .dark を監視して切り替わるので、toolbar の
// light/dark トグルで追従を確認できる。
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

// gh pr diff のような複数ファイル patch を 1 ノードで渡すと、ファイルごとに
// filename ヘッダ付きの FileDiff が縦に並ぶ。
export const MultipleFiles: Story = {
  args: { patch: MULTI_FILE_PATCH, diffStyle: "unified" },
};

// 複数ファイルでは comment.file で対象ファイルを指定する (新名 or rename 元名)。
export const MultipleFilesWithComments: Story = {
  args: {
    patch: MULTI_FILE_PATCH,
    diffStyle: "unified",
    comments: [
      {
        file: "src/lib/date.ts",
        side: "new",
        line: 2,
        body: "型ガードで Date を受けられるようになった。",
        author: "wwwyo",
      },
      {
        file: "server/index.ts",
        side: "new",
        line: 11,
        body: "CORS を挟む位置はここで良い？",
      },
    ],
  },
};

// 行コメント (lineAnnotations) を対象行にインライン表示する。
// side: "new" は追加側 (additions)、"old" は削除側 (deletions) の行番号を指す。
export const WithComments: Story = {
  args: {
    patch: TS_PATCH,
    diffStyle: "unified",
    comments: [
      {
        side: "new",
        line: 2,
        body: "string 以外も来るので型ガードを追加。良い修正。",
        author: "wwwyo",
      },
      {
        side: "new",
        line: 3,
        body: "Invalid Date のハンドリングが入ったのが嬉しい。",
      },
    ],
  },
};

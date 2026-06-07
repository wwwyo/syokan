import { type DiffLineAnnotation, PatchDiff } from "@pierre/diffs/react";
import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

const diffCommentSchema = z.object({
  // 旧ファイル側 (deletions) か新ファイル側 (additions) か。LLM には old/new の方が直感的。
  side: z.enum(["old", "new"]),
  // 対象 side の行番号 (diff の gutter に出る番号)。patch に含まれる行のみ指定可。
  line: z.number().int().positive(),
  body: z.string(),
  author: z.string().optional(),
});

export const diffPropsSchema = z
  .object({
    patch: z.string(),
    diffStyle: z.enum(["split", "unified"]).optional(),
    comments: z.array(diffCommentSchema).optional(),
  })
  .strict();

export type DiffProps = z.infer<typeof diffPropsSchema>;

type CommentMeta = { body: string; author?: string };

/**
 * app は class ベースの dark mode (.dark)、@pierre/diffs は shadow DOM 内で独自テーマを
 * 持つため app の CSS 変数が届かない。documentElement の .dark を監視して themeType を
 * 明示制御する。pierre 既定の themeType:'system' は OS preference 追従で、app/storybook の
 * class トグルと噛み合わないため使わない。
 */
function useColorScheme(): "dark" | "light" {
  const [scheme, setScheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setScheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/**
 * 行コメント1件の表示。annotation は light DOM に slot されるので Tailwind がそのまま効く。
 * diff の行 (全幅・github テーマ色) と区別するため、インセットしたカード + アイコンで
 * 「コード行ではない挿入物」と分かる見た目にする。
 */
function DiffComment({ body, author }: CommentMeta) {
  return (
    <div className="mx-3 my-2 flex gap-2 rounded-md border border-border bg-card p-3 text-sm text-card-foreground shadow-sm">
      <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        {author ? <div className="mb-0.5 font-semibold">{author}</div> : null}
        <div className="whitespace-pre-wrap break-words">{body}</div>
      </div>
    </div>
  );
}

/**
 * unified diff の patch 文字列 (gh / git 由来) を描画する。filename は patch の
 * `diff --git a/... b/...` ヘッダから @pierre/diffs が自動抽出する。
 * comments は対象行にインラインで表示する (patch に含まれる行のみ対象)。
 */
export function Diff({ patch, diffStyle = "split", comments }: DiffProps) {
  const themeType = useColorScheme();
  const lineAnnotations = useMemo<DiffLineAnnotation<CommentMeta>[]>(
    () =>
      (comments ?? []).map((c) => ({
        side: c.side === "old" ? "deletions" : "additions",
        lineNumber: c.line,
        metadata: { body: c.body, author: c.author },
      })),
    [comments],
  );
  return (
    <div
      data-slot="diff"
      className="my-4 overflow-hidden rounded-lg border border-border"
    >
      <PatchDiff
        patch={patch}
        lineAnnotations={lineAnnotations.length ? lineAnnotations : undefined}
        renderAnnotation={(a) => <DiffComment {...a.metadata} />}
        options={{
          // app の CodeBlock (github-light/dark) と syntax color を揃える
          theme: { dark: "github-dark", light: "github-light" },
          themeType,
          diffStyle,
        }}
      />
    </div>
  );
}

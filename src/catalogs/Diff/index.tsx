import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";
import { type DiffLineAnnotation, FileDiff } from "@pierre/diffs/react";
import { MessageSquare } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useColorScheme } from "@/lib/useColorScheme";

const diffCommentSchema = z.object({
  // 複数ファイル patch で対象ファイルを指定する。新ファイル名 (例 "src/a.ts")、
  // rename なら旧名でも可。単一ファイルなら省略でき、その唯一のファイルに付く。
  file: z.string().optional(),
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

type DiffCommentInput = z.infer<typeof diffCommentSchema>;
type CommentMeta = { body: string; author?: string };

/**
 * 指定ファイルに属する comment を抽出する。file 指定があれば新名/旧名で照合し、
 * 未指定の comment は単一ファイル時のみ (唯一のファイルに) 適用する。
 */
export function commentsForFile(
  comments: readonly DiffCommentInput[] | undefined,
  file: Pick<FileDiffMetadata, "name" | "prevName">,
  isSoleFile: boolean,
): DiffCommentInput[] {
  return (comments ?? []).filter((c) =>
    c.file != null
      ? c.file === file.name || c.file === file.prevName
      : isSoleFile,
  );
}

/**
 * catalog の comment (old/new 表記) を pierre の DiffLineAnnotation に変換する。
 * old=deletions(旧ファイル側) / new=additions(新ファイル側) のマッピングはここに集約する。
 */
export function toLineAnnotations(
  comments: readonly DiffCommentInput[] | undefined,
): DiffLineAnnotation<CommentMeta>[] {
  return (comments ?? []).map((c) => ({
    side: c.side === "old" ? "deletions" : "additions",
    lineNumber: c.line,
    metadata: { body: c.body, author: c.author },
  }));
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

// props 非依存なので毎レンダリングの再生成を避けてトップレベルに巻き上げる
const renderDiffAnnotation = (a: DiffLineAnnotation<CommentMeta>) => (
  <DiffComment {...a.metadata} />
);

/**
 * patch 文字列 (gh / git 由来) を描画する。`parsePatchFiles` で 1..N ファイルに分解し、
 * ファイルごとに pierre の FileDiff (filename ヘッダ付き) を縦に積む。filename / rename は
 * patch から自動抽出される。comments は対象ファイル・対象行にインライン表示する
 * (patch に含まれる行のみ対象)。
 */
export function Diff({ patch, diffStyle = "split", comments }: DiffProps) {
  const themeType = useColorScheme();
  // patch のフルパースは重いので patch 変化時のみ実行する。複数 commit を含む patch は
  // 各 commit の files を平坦化する (commit 境界は持たないので同名ファイルは複数回出る)。
  const parsedFiles = useMemo(
    () => parsePatchFiles(patch).flatMap((p) => p.files),
    [patch],
  );
  const { files, unassigned } = useMemo(() => {
    const isSoleFile = parsedFiles.length === 1;
    const assigned = new Set<DiffCommentInput>();
    const files = parsedFiles.map((file) => {
      const fileComments = commentsForFile(comments, file, isSoleFile);
      for (const c of fileComments) assigned.add(c);
      return { file, annotations: toLineAnnotations(fileComments) };
    });
    // どのファイルにも割り当たらなかった comment。黙って消すと producer が
    // 表示されたと誤認するため、件数を可視化する。
    const unassigned = (comments ?? []).filter((c) => !assigned.has(c));
    return { files, unassigned };
  }, [parsedFiles, comments]);
  const options = useMemo(
    () => ({
      // app の Code (github-light/dark) と syntax color を揃える
      theme: { dark: "github-dark", light: "github-light" },
      themeType,
      diffStyle,
    }),
    [themeType, diffStyle],
  );

  if (files.length === 0) {
    return (
      <div
        data-slot="diff"
        className="my-4 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground"
      >
        diff を表示できませんでした (patch を解釈できません)。
      </div>
    );
  }

  return (
    <div data-slot="diff" className="my-4 space-y-4">
      {files.map(({ file, annotations }, i) => (
        <div
          // name は重複しうる (rename 等) ため index も混ぜて安定させる
          key={`${file.name}-${i}`}
          className="overflow-hidden rounded-lg border border-border"
        >
          {/* FileDiff は壊れた metadata で render 中に throw しうる。1 ファイルの
              失敗が全体を巻き込まないようファイル単位で境界に包む。 */}
          <ErrorBoundary
            fallback={
              <div className="px-4 py-3 text-sm text-muted-foreground">
                この diff を表示できませんでした。
              </div>
            }
          >
            <FileDiff
              fileDiff={file}
              lineAnnotations={annotations.length ? annotations : undefined}
              renderAnnotation={renderDiffAnnotation}
              options={options}
            />
          </ErrorBoundary>
        </div>
      ))}
      {unassigned.length > 0 ? (
        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          {unassigned.length}{" "}
          件のコメントを表示できませんでした (file 未指定、または patch 内のファイル名と不一致)。
        </div>
      ) : null}
    </div>
  );
}

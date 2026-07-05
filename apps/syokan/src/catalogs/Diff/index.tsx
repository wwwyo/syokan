import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";
import { type DiffLineAnnotation, FileDiff } from "@pierre/diffs/react";
import { MessageSquare } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { t } from "@/lib/i18n";
import { useColorScheme } from "@/lib/useColorScheme";

const diffCommentSchema = z.object({
  // Specifies the target file in a multi-file patch. The new filename (e.g. "src/a.ts"),
  // or the old name for a rename. Omittable for a single file, where it attaches to that sole file.
  // An empty string is "specified" but matches nothing, so it's rejected (leave it unspecified to omit).
  file: z.string().min(1).optional(),
  // The old-file side (deletions) or the new-file side (additions). old/new is more intuitive for the LLM.
  side: z.enum(["old", "new"]),
  // The line number on the target side (the number in the diff's gutter). Only lines present in the patch are valid.
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
 * Extracts the comments belonging to the given file. If file is specified, match against the
 * new/old name; a comment without file applies only when there is a single file (to that sole file).
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
 * Converts catalog comments (old/new notation) into pierre's DiffLineAnnotation.
 * The mapping old=deletions (old-file side) / new=additions (new-file side) is consolidated here.
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
 * Renders a single line comment. The annotation is slotted into the light DOM, so Tailwind applies directly.
 * To distinguish it from diff lines (full-width, github theme colors), an inset card + icon makes it
 * read as "an insertion that is not a code line".
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

// props-independent, so hoisted to the top level to avoid recreating it on every render
const renderDiffAnnotation = (a: DiffLineAnnotation<CommentMeta>) => (
  <DiffComment {...a.metadata} />
);

/**
 * Renders a patch string (from gh / git). Splits it into 1..N files via `parsePatchFiles` and
 * stacks a pierre FileDiff (with a filename header) vertically per file. filename / rename are
 * auto-extracted from the patch. Comments are shown inline at the target file and target line
 * (only lines present in the patch are eligible).
 */
export function Diff({ patch, diffStyle = "split", comments }: DiffProps) {
  const themeType = useColorScheme();
  // Fully parsing the patch is expensive, so run it only when patch changes. For a patch spanning
  // multiple commits, flatten each commit's files (commit boundaries aren't kept, so a same-named file appears multiple times).
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
    // Comments assigned to no file. Dropping them silently would make the producer think
    // they were shown, so surface the count.
    const unassigned = (comments ?? []).filter((c) => !assigned.has(c));
    return { files, unassigned };
  }, [parsedFiles, comments]);
  const options = useMemo(
    () => ({
      // Match syntax colors with the app's Code (github-light/dark)
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
        {t.diff.unparsable}
      </div>
    );
  }

  return (
    <div data-slot="diff" className="my-4 space-y-4">
      {files.map(({ file, annotations }, i) => (
        <div
          // name can collide (renames etc.), so mix in index to keep it stable
          key={`${file.name}-${i}`}
          className="overflow-hidden rounded-lg border border-border"
        >
          {/* FileDiff can throw mid-render on broken metadata. Wrap each file in a boundary
              so one file's failure doesn't take down the whole thing. */}
          <ErrorBoundary
            fallback={
              <div className="px-4 py-3 text-sm text-muted-foreground">
                {t.diff.fileFailed}
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
          {t.diff.unassignedComments(unassigned.length)}
        </div>
      ) : null}
    </div>
  );
}

import { File, type FileOptions } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { z } from "zod";
import { toCodeLang } from "../../lib/code";
import { useColorScheme } from "../../lib/useColorScheme";
import { cn } from "../../lib/utils";
import { CopyButton } from "./CopyButton";

export const codePropsSchema = z
  .object({
    code: z.string(),
    lang: z.string().optional(),
    filename: z.string().optional(),
  })
  .strict();

export type CodeProps = z.infer<typeof codePropsSchema>;

const COPY_REVEAL =
  "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100";

// The pierre File host (diffs-container) carries its own theme background (github's editing surface).
// Passing padding / line-height directly to the host renders on a single surface with margin, without stacking another surface.
// (the old implementation muddied things by overlaying a white code surface on a bg-muted frame)
const FILE_STYLE = {
  display: "block",
  padding: "0.875rem 1rem",
  "--diffs-font-size": "13px",
  "--diffs-line-height": "1.65",
} as CSSProperties;

// Dev StrictMode collapse fix. On a cold-grammar first render, File paints an empty <pre>
// (no [data-code]) into its shadow DOM, then StrictMode unmounts before the async highlight
// lands. The remounted instance's shouldRenderCode() only tests `pre == null`, so it adopts the
// stale empty <pre> via the hydrate path — which never registers a completion callback — and
// stays collapsed. Dropping the incomplete <pre> at unmount forces the remount back onto the
// normal render path (pre == null → re-highlights). A module-level stable ref avoids option
// equality churn; warm/production renders leave a completed <pre> ([data-code]) untouched.
const removeIncompleteRender: NonNullable<
  FileOptions<undefined>["onPostRender"]
> = (node, _instance, phase) => {
  if (phase !== "unmount") return;
  const pre = node.shadowRoot?.querySelector("pre");
  if (pre && !pre.querySelector("[data-code]")) pre.remove();
};

const FILE_OPTIONS = {
  // The github theme, kept consistent across all code display in the app. dark/light switches via themeType
  theme: { dark: "github-dark", light: "github-light" },
  disableFileHeader: true,
  overflow: "scroll",
  onPostRender: removeIncompleteRender,
} as const;

/**
 * A catalog component that displays a code fragment in monospace + syntax highlighting.
 * Highlighting is delegated to @pierre/diffs' File, unifying on the same Shiki stack as Diff.
 * The code surface uses File's own theme background as the sole surface; filename / CopyButton
 * ride on top of it as chrome. An unspecified/unknown lang shows plain text as "text".
 *
 * Known limitation (dev only): on a cold-grammar first render, File emits an empty placeholder
 * (height 0) and swaps in the body via a re-render callback when async highlighting completes.
 * Under React StrictMode's mount→unmount→remount, that callback lands on the old instance,
 * already cleanUp'd (enabled=false) at unmount, so it becomes a no-op and stays collapsed at
 * height 0 (deterministic inside tabs, intermittent on ViewPage).
 * Warm (grammar cached) and production (StrictMode disabled) render synchronously and are fine.
 */
export function Code({ code, lang, filename }: CodeProps) {
  const themeType = useColorScheme();
  return (
    <div
      data-slot="code"
      className="group relative my-4 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      {filename ? (
        <div
          data-slot="code-filename"
          className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"
        >
          <span className="truncate font-mono text-xs font-medium text-muted-foreground">
            {filename}
          </span>
          <CopyButton code={code} className={COPY_REVEAL} />
        </div>
      ) : null}
      <File
        file={{ name: filename ?? "code", contents: code, lang: toCodeLang(lang) }}
        style={FILE_STYLE}
        options={{ ...FILE_OPTIONS, themeType }}
      />
      {filename ? null : (
        <CopyButton
          code={code}
          className={cn("absolute right-2 top-2 z-10", COPY_REVEAL)}
        />
      )}
    </div>
  );
}

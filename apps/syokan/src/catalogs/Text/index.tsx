import type { ReactNode } from "react";
import { z } from "zod";
import { cn } from "../../lib/utils";

export const textPropsSchema = z
  .object({
    body: z
      .string()
      .min(1)
      .describe(
        "Text content. A single '\\n' is a soft line break rendered as <br> within the same paragraph; '\\n\\n' (two or more consecutive newlines) starts a new paragraph.",
      ),
    // dimmed display for supplementary text
    muted: z.boolean().optional(),
  })
  .strict();

export type TextProps = z.infer<typeof textPropsSchema>;

/**
 * Split body into paragraphs on runs of 2+ newlines, dropping empty paragraphs
 * from leading/trailing/collapsed breaks. CRLF/CR is normalized to LF first
 * since producers (editors, pasted content) may emit either.
 */
function splitParagraphs(body: string): string[] {
  const normalized = body.replace(/\r\n?/g, "\n");
  const trimmed = normalized.replace(/^\n+|\n+$/g, "");
  return trimmed.split(/\n{2,}/).filter((paragraph) => paragraph.length > 0);
}

/** Render a single paragraph's soft line breaks (`\n`) as `<br>`, keeping the plain-string shape when there are none. */
function renderParagraph(text: string): ReactNode {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return text;
  }
  return lines.flatMap((line, i) =>
    i === 0
      ? [line]
      : // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
        [<br key={i} />, line],
  );
}

/** Build the single `<p data-slot="text">` markup shared by the single- and multi-paragraph render paths. */
function paragraphElement(text: string, className: string, key?: number) {
  return (
    // biome-ignore lint/suspicious/noArrayIndexKey: key is only set (to the paragraph index) in the multi-paragraph path; static content, order never changes
    <p key={key} data-slot="text" className={className}>
      {renderParagraph(text)}
    </p>
  );
}

/** Short or supplementary text (single line or a few lines), supporting soft line breaks (`\n`) and paragraph breaks (`\n\n`). */
export function Text({ body, muted }: TextProps) {
  const className = cn("text-sm leading-6", muted && "text-muted-foreground");
  const paragraphs = splitParagraphs(body);
  // A body that is only newlines (or empty after trimming) still renders one empty paragraph
  // rather than falling back to the raw, unsplit body.
  const items = paragraphs.length > 0 ? paragraphs : [""];

  if (items.length === 1) {
    return paragraphElement(items[0] ?? "", className);
  }

  return (
    <div className="space-y-2">
      {items.map((paragraph, i) => paragraphElement(paragraph, className, i))}
    </div>
  );
}

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

/** Split body into paragraphs on runs of 2+ newlines, dropping empty paragraphs from leading/trailing/collapsed breaks. */
function splitParagraphs(body: string): string[] {
  const trimmed = body.replace(/^\n+/, "").replace(/\n+$/, "");
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

/** Short or supplementary text (single line or a few lines), supporting Markdown-style line breaks. */
export function Text({ body, muted }: TextProps) {
  const className = cn("text-sm leading-6", muted && "text-muted-foreground");
  const paragraphs = splitParagraphs(body);

  if (paragraphs.length <= 1) {
    return (
      <p data-slot="text" className={className}>
        {renderParagraph(paragraphs[0] ?? body)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
        <p key={i} data-slot="text" className={className}>
          {renderParagraph(paragraph)}
        </p>
      ))}
    </div>
  );
}

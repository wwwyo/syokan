import { z } from "zod";
import { Code } from "../Code";

export const plainTextPropsSchema = z
  .object({
    body: z.string(),
  })
  .strict();

export type PlainTextProps = z.infer<typeof plainTextPropsSchema>;

// thin wrapper that shows plain text / logs monospaced without formatting. It delegates to Code
// (no lang specified = text): no markdown interpretation, whitespace and newlines preserved as-is,
// shown in a theme-following frame. # and * come out as literal characters (never interpreted as markup).
export function PlainText({ body }: PlainTextProps) {
  return (
    <div data-slot="plain-text">
      <Code code={body} />
    </div>
  );
}

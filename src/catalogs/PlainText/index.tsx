import { z } from "zod";
import { Code } from "@/catalogs/Code";

export const plainTextPropsSchema = z
  .object({
    body: z.string(),
  })
  .strict();

export type PlainTextProps = z.infer<typeof plainTextPropsSchema>;

// plain text / log を整形せず等幅で見せる薄い wrapper。中身は Code
// (lang 未指定 = text) に委譲する: markdown 解釈はせず空白・改行をそのまま保持し、
// テーマ追従の枠で表示する。# や * を文字としてそのまま出すのが MarkdownDoc との違い。
export function PlainText({ body }: PlainTextProps) {
  return (
    <div data-slot="plain-text">
      <Code code={body} />
    </div>
  );
}

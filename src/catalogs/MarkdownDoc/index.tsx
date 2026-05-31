import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import { CodeBlock } from "@/components/CodeBlock";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveCodeInfo } from "@/lib/shiki";

export const markdownDocPropsSchema = z
  .object({
    body: z.string(),
  })
  .strict();

export type MarkdownDocProps = z.infer<typeof markdownDocPropsSchema>;

type HastNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

function extractCodeFromPre(
  node: unknown,
): { code: string; lang?: string; filename?: string } | null {
  const pre = node as HastNode | undefined;
  const codeNode =
    pre?.children?.find((c) => c.tagName === "code") ?? pre?.children?.[0];
  if (!codeNode) return null;
  // info string (例 "ts" / "hoge.json") は className "language-<info>" に載る
  let info: string | undefined;
  const classes = codeNode.properties?.className;
  if (Array.isArray(classes)) {
    for (const c of classes) {
      const match = typeof c === "string" ? /^language-(.+)$/.exec(c) : null;
      if (match?.[1]) info = match[1];
    }
  }
  const code = (codeNode.children ?? [])
    .map((c) => (typeof c.value === "string" ? c.value : ""))
    .join("")
    .replace(/\n$/, "");
  // info がファイル名 (例 hoge.json) なら拡張子から lang を推定しファイル名も返す
  return { code, ...resolveCodeInfo(info) };
}

export function MarkdownDoc({ body }: MarkdownDocProps) {
  return (
    <article data-slot="markdown-doc" className="text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-6 text-3xl font-semibold tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-6 text-2xl font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-xl font-semibold tracking-tight">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
          ul: ({ className, children }) => {
            // remark-gfm の task list は bullet を消す (checkbox を出すため)
            const isTaskList = className?.includes("contains-task-list");
            return (
              <ul
                className={
                  isTaskList
                    ? "my-3 list-none space-y-1 pl-0"
                    : "my-3 list-disc space-y-1 pl-6"
                }
              >
                {children}
              </ul>
            );
          },
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-7">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-4 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {children}
            </code>
          ),
          pre: ({ node, children }) => {
            const extracted = extractCodeFromPre(node);
            if (extracted) {
              return (
                <CodeBlock
                  code={extracted.code}
                  lang={extracted.lang}
                  filename={extracted.filename}
                />
              );
            }
            return (
              <pre
                data-slot="codeblock"
                className="my-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6"
              >
                {children}
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-border pl-4 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          del: ({ children }) => (
            <del className="text-muted-foreground">{children}</del>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-hidden rounded-lg border border-border">
              <Table>{children}</Table>
            </div>
          ),
          thead: ({ children }) => (
            <TableHeader className="bg-muted">{children}</TableHeader>
          ),
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children }) => <TableHead>{children}</TableHead>,
          td: ({ children }) => <TableCell>{children}</TableCell>,
          input: ({ checked, type }) =>
            type === "checkbox" ? (
              <Checkbox
                checked={checked === true}
                readOnly
                className="mr-2 inline-flex align-middle"
              />
            ) : null,
        }}
      >
        {body}
      </ReactMarkdown>
    </article>
  );
}

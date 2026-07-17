import { lexer, type Token, type Tokens } from "marked";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { z } from "zod";
import { httpUrl } from "../../lib/url";
import { cn } from "../../lib/utils";
import { Code } from "../Code";

export const markdownPropsSchema = z
  .object({
    body: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    collectIssues(lexer(value.body, { gfm: true }), ctx);
  });

export type MarkdownProps = z.infer<typeof markdownPropsSchema>;

function addIssue(ctx: z.RefinementCtx, message: string): void {
  ctx.addIssue({ code: "custom", path: ["body"], message });
}

// Block structure and data belong to dedicated catalog nodes (Heading/Table/Checklist);
// Markdown is prose flow only. Walk marked's full token tree (block + inline, GFM on)
// so a heading/table/task-list/image/html/bad-link buried inside a list or blockquote
// is caught too, not just at the top level.
function collectIssues(tokens: Token[], ctx: z.RefinementCtx): void {
  for (const token of tokens) {
    if (token.type === "heading") {
      addIssue(
        ctx,
        "markdown headings are not supported; use the Heading catalog node",
      );
      continue;
    }
    if (token.type === "table") {
      addIssue(
        ctx,
        "markdown tables are not supported; use the Table catalog node",
      );
      continue;
    }
    if (token.type === "html") {
      addIssue(ctx, "raw HTML is not supported in Markdown");
      continue;
    }
    if (token.type === "image") {
      addIssue(ctx, "images are not supported in Markdown");
      continue;
    }
    if (token.type === "link" && !httpUrl.safeParse(token.href).success) {
      addIssue(
        ctx,
        "Markdown links must be http(s) URLs; relative paths and other protocols (e.g. javascript:) are rejected",
      );
    }
    if (token.type === "list") {
      for (const item of token.items) {
        if (item.task) {
          addIssue(
            ctx,
            "markdown task list items are not supported; use the Checklist catalog node",
          );
        }
        collectIssues(item.tokens, ctx);
      }
    }
    if ("tokens" in token && token.tokens) {
      collectIssues(token.tokens, ctx);
    }
  }
}

const LINK_CLASS = "text-primary underline-offset-4 hover:underline";
const INLINE_CODE_CLASS = "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]";

function renderChildren(tokens: Token[] | undefined): ReactNode {
  if (!tokens) return null;
  return tokens.map((token, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
    <MarkdownNode key={i} token={token} />
  ));
}

function MarkdownList({ token }: { token: Tokens.List }) {
  const items = token.items.map((item, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
    // no flex on li: display:flex would override display:list-item and drop the ::marker
    <li key={i} className="pl-1 [&>*+*]:mt-1">
      {renderChildren(item.tokens)}
    </li>
  ));
  if (token.ordered) {
    return (
      <ol
        className="flex flex-col gap-1 pl-5 text-sm leading-6 list-decimal"
        start={typeof token.start === "number" ? token.start : undefined}
      >
        {items}
      </ol>
    );
  }
  return <ul className="flex flex-col gap-1 pl-5 text-sm leading-6 list-disc">{items}</ul>;
}

// Renders one marked token. heading/table/task-list/html/image tokens and non-http(s)
// links never reach here — the props schema rejects them at POST time — so this only
// implements the allowed prose subset (paragraphs, lists, emphasis, links, code, quotes).
function MarkdownNode({ token }: { token: Token }): ReactNode {
  switch (token.type) {
    case "paragraph":
      return <p className="text-sm leading-6">{renderChildren(token.tokens)}</p>;
    case "text":
      return token.tokens ? <>{renderChildren(token.tokens)}</> : token.text;
    case "escape":
      return token.text;
    case "strong":
      return <strong>{renderChildren(token.tokens)}</strong>;
    case "em":
      return <em>{renderChildren(token.tokens)}</em>;
    case "del":
      return <del>{renderChildren(token.tokens)}</del>;
    case "codespan":
      return <code className={INLINE_CODE_CLASS}>{token.text}</code>;
    case "br":
      return <br />;
    case "link":
      return (
        <a
          href={token.href}
          className={LINK_CLASS}
          target="_blank"
          rel="noopener noreferrer"
        >
          {renderChildren(token.tokens)}
        </a>
      );
    case "blockquote":
      return (
        <blockquote
          className={cn(
            "flex flex-col gap-2 border-l-2 border-border pl-4 text-muted-foreground",
          )}
        >
          {renderChildren(token.tokens)}
        </blockquote>
      );
    case "list":
      // marked's own Token union includes an extension-only Generic variant (unused here,
      // no custom tokenizers registered); the type-narrowed literal check above is exact.
      return <MarkdownList token={token as Tokens.List} />;
    case "code":
      return <Code code={token.text} lang={token.lang} />;
    case "hr":
      return <hr className="border-border" />;
    default:
      return null;
  }
}

/**
 * Restricted markdown renderer for prose flow only: paragraphs, plain lists (nested
 * ok), emphasis, inline/fenced code, blockquotes, links. Block structure and data
 * (headings, tables, task lists) belong to dedicated catalog nodes and are rejected
 * by the schema before this ever renders. Tokens map to React elements directly —
 * raw HTML injection is structurally impossible here, not just policy.
 */
export function Markdown({ body }: MarkdownProps) {
  const tokens = useMemo(() => lexer(body, { gfm: true }), [body]);
  return (
    <div data-slot="markdown" className="flex flex-col gap-3 text-sm leading-6">
      {renderChildren(tokens)}
    </div>
  );
}

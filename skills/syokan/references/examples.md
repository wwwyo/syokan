# Envelope examples

Complete envelopes that can be POSTed as-is, shown as composition references.
The exact definitions of types and props come from `syokan catalog`, which is the SSOT (including the DiffComment table below — always confirm there in the end).
None of them include `id` or `createdAt` (the server assigns those).

## DiffComment shape

Each element of `Diff`'s `comments[]` takes this shape.

| key | type | required | notes |
| --- | --- | --- | --- |
| `side` | `"old" \| "new"` | required | old side (deleted lines) or new side (added lines) |
| `line` | positive integer | required | gutter line number on that side. Only lines present in the patch |
| `body` | string | required | comment body |
| `file` | non-empty string | optional | targets a file in a multi-file patch. New file name (old name also accepted for renames). Can be omitted for a single-file patch |
| `author` | string | optional | comment author |

## Example 1: RSS or article list

Stack Cards with a heading link, fetch time, and summary.
`source` piggybacks a `url`.

```json
{
  "title": "Today's RSS",
  "metadata": { "source": { "label": "daily-rss", "fetchedAt": "2026-06-28T08:00:00Z" } },
  "idempotencyKey": "daily-rss-2026-06-28",
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      { "type": "Heading", "props": { "text": "Feed for 2026-06-28", "level": 1 } },
      {
        "type": "Card",
        "props": {},
        "children": [
          { "type": "Heading", "props": { "text": "Article title", "level": 3, "href": "https://example.com/article" } },
          { "type": "Time", "props": { "datetime": "2026-06-28T06:30:00Z", "muted": true } },
          { "type": "Text", "props": { "body": "Put the article summary here.", "clamp": true } }
        ]
      }
    ]
  }
}
```

## Example 2: PR review (diff with line comments)

Show state with a `Badge`, and put a unified patch plus line comments on a `Diff`.

```json
{
  "title": "review: feature branch",
  "metadata": { "source": { "label": "gh-review", "url": "https://example.com/owner/repo/pull/42" } },
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      {
        "type": "Stack",
        "props": { "direction": "horizontal" },
        "children": [
          { "type": "Heading", "props": { "text": "#42 title", "level": 2 } },
          { "type": "Badge", "props": { "text": "changes requested", "variant": "destructive" } }
        ]
      },
      {
        "type": "Diff",
        "props": {
          "diffStyle": "unified",
          "patch": "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,4 @@\n const a = 1;\n+const b = 2;\n export { a };\n",
          "comments": [
            { "side": "new", "line": 2, "body": "Where does this value come from? Should be a named constant", "author": "reviewer" }
          ]
        }
      }
    ]
  }
}
```

## Example 3: meeting notes or article body (markdown)

Wrap long prose in a single `MarkdownDoc` node.
Markdown cannot be posted bare outside an envelope.

```json
{
  "title": "1on1 notes 2026-06-28",
  "metadata": { "source": { "label": "meeting" } },
  "root": {
    "type": "Stack",
    "props": {},
    "children": [
      { "type": "MarkdownDoc", "props": { "body": "## Agenda\n\n- Priorities this quarter\n- Next moves\n\n## Decisions\n\n1. Proceed with A\n2. B on hold\n" } }
    ]
  }
}
```

Post it.

```bash
syokan meeting.json
# to check against the dev renderer, use:
SYOKAN_BASE_URL=http://localhost:5273 bun cli/syokan.ts meeting.json
```

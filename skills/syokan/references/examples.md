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

```json
{
  "title": "Today's RSS",
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
          {
            "type": "Stack",
            "props": {},
            "children": [
              { "type": "Heading", "props": { "text": "Article title", "level": 3, "href": "https://example.com/article" } },
              { "type": "Time", "props": { "datetime": "2026-06-28T06:30:00Z", "muted": true } },
              { "type": "Text", "props": { "body": "Put the article summary here.", "clamp": true } }
            ]
          }
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

## Example 3: meeting notes or article body (structured prose)

There is no markdown node — structure prose into catalog nodes.
Headings become `Heading`, paragraphs `Text`, enumerations `PlainText` (whitespace preserved), diagrams `Mermaid`.

```json
{
  "title": "1on1 notes 2026-06-28",
  "root": {
    "type": "Stack",
    "props": {},
    "children": [
      { "type": "Heading", "props": { "text": "Agenda", "level": 2 } },
      { "type": "PlainText", "props": { "body": "- Priorities this quarter\n- Next moves" } },
      { "type": "Heading", "props": { "text": "Decisions", "level": 2 } },
      { "type": "PlainText", "props": { "body": "1. Proceed with A\n2. B on hold" } },
      { "type": "Mermaid", "props": { "code": "graph LR\n  A[Proposal] --> B[Decision]" } }
    ]
  }
}
```

Post it.

```bash
syokan meeting.json
```

## Example 4: live-synced view (TreeDoc)

Write a bare catalog tree (no envelope) to a file and syokan the path — it is auto-wrapped in a `TreeDoc` and the view follows every save.
This is the shape of the *file content*, not a POST body:

```json
{
  "type": "Stack",
  "props": {},
  "children": [
    { "type": "Heading", "props": { "text": "Build status", "level": 2 } },
    { "type": "Badge", "props": { "text": "running", "variant": "secondary" } }
  ]
}
```

```bash
syokan ./status.json   # keep rewriting status.json; the view updates in place
```

To embed a synced subtree inside a larger static view, place the node yourself (absolute path only; `TreeDoc` cannot appear inside the synced tree itself):

```json
{
  "title": "Ops dashboard",
  "root": {
    "type": "Stack",
    "props": {},
    "children": [
      { "type": "Heading", "props": { "text": "Ops dashboard", "level": 1 } },
      { "type": "TreeDoc", "props": { "path": "/Users/me/status.json" } }
    ]
  }
}
```

## Example 5: review risk panel (interactive primitives)

Stat row → Table cockpit whose rows jump to finding cards (`Link` with `href:"#<id>"`) → findings narrowed by `TagFilter` (cards carry `tags`) → evidence folded in `Collapsible` → "no findings" claims backed by re-runnable `Probe`s → reviewer `Checklist`. Interaction state stays in the viewer's browser; post only the initial state.

```json
{
  "title": "Review risk panel — PR #27",
  "idempotencyKey": "review-pr-27",
  "root": {
    "type": "Stack",
    "props": {},
    "children": [
      {
        "type": "Stack",
        "props": { "direction": "horizontal" },
        "children": [
          { "type": "Stat", "props": { "label": "High", "value": 1 } },
          { "type": "Stat", "props": { "label": "None (verified)", "value": 2 } }
        ]
      },
      {
        "type": "TagFilter",
        "props": { "tags": ["High", "None"], "label": "Severity" },
        "id": "severity-filter",
        "children": [
          {
            "type": "Table",
            "props": {
              "columns": ["Finding", "Severity", "Jump"],
              "rows": [
                [
                  "token could reach logs",
                  { "type": "Badge", "props": { "text": "High", "variant": "destructive" } },
                  { "type": "Link", "props": { "href": "#risk-1", "text": "→ details" } }
                ]
              ]
            }
          },
          {
            "type": "Card",
            "props": { "title": "token could reach logs" },
            "id": "risk-1",
            "tags": ["High"],
            "children": [
              {
                "type": "Stack",
                "props": {},
                "children": [
                  {
                    "type": "Collapsible",
                    "props": { "summary": "Evidence (1 hunk)" },
                    "id": "risk-1-evidence",
                    "children": [
                      { "type": "Diff", "props": { "patch": "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new" } }
                    ]
                  },
                  {
                    "type": "Probe",
                    "props": {
                      "label": "no auth header logged",
                      "check": { "kind": "search_count", "path": "/abs/path/to/app", "pattern": "console.log(auth", "expected": 0, "op": "max" },
                      "result": { "status": "pass", "detail": "0 matches", "ranAt": "2026-07-06T09:00:00Z" }
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "type": "Checklist",
        "props": { "items": [{ "label": "probe re-run after new commits" }] },
        "id": "review-checklist"
      }
    ]
  }
}
```

Graph pairs (`role`: `added` / `removed` / `hotspot` / `neutral`; colors fixed by the renderer) go in a horizontal `Stack` for before/after dependency contrasts — see `syokan catalog` for props.

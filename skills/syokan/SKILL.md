---
name: syokan
license: MIT
description: "Build and POST a JSON snapshot envelope to syokan (召喚 — a verb: summon data into a rich, living view). Use when the user says \"syokan this\", \"syokan X\", \"show in syokan\", \"post a snapshot\", \"preview this markdown\", or in Japanese 『〜を syokan』『syokan に出して/表示して/投げて』『snapshot を作って/送って』『syokan のUIで見たい』『Markdown をプレビューして/md ファイルをブラウザで見たい』 — for RSS feeds, in-progress PR reviews, meeting notes, today's TODO, or any aggregated data the user wants to see as structured UI. Compose the tree only from catalog components (Stack, Card, Heading, Link, Text, Time, PlainText, Diff, Code, Badge, Mermaid, TreeDoc) and send it via the syokan CLI or POST /api/snapshots. Markdown is not rendered — structure prose into catalog nodes instead. Never write JSX. Whenever the word syokan appears, use this skill even if the user does not explicitly say snapshot."
---

# syokan

**syokan (召喚, "summon") is a verb — LLMs summon rich UI.** When the user says "syokan X" (JA: 「Xを syokan」), that is a request to summon that data into a view. Under the hood it is a schema-driven view layer: instead of writing JSX, you speak a JSON incantation — a tree of catalog components — and syokan renders it with predefined components.
Your job is to assemble the data into an envelope and POST it to syokan.
In prose, use syokan as a bare transitive verb (never "do syokan" / never 「syokan する」 — syokan stands on its own).

If syokan is not installed yet (`syokan --help` fails), or the user says "onboarding", "set it up", or "first time using it", walk them through [references/onboarding.md](references/onboarding.md) up to their first snapshot. Do not silently run environment-changing operations such as installs: report that it is not installed and get the user's approval before executing (never install on your own).

## Non-negotiables

- **Snapshots are ephemeral**: a posted snapshot has no persistence guarantee. Only put reconstructible, transient data there (today's RSS, an in-progress review, etc.). For layouts you reuse, save a template to reproduce them (templates persist — see "Templates for reproducibility" below).
- **JSON only — markdown is not rendered**: the server accepts nothing but a JSON envelope, and there is no markdown node. Structure prose into catalog nodes yourself: headings → `Heading`, paragraphs → `Text`, code fences → `Code`, mermaid fences → `Mermaid`, preformatted or bullet text → `PlainText`.
- **Strict schema**: props are validated strictly. Keys not in the schema are rejected — do not invent extra keys.
- **Leaves cannot have children**: only `Stack` and `Card` accept children. Attaching children to a leaf node is rejected at ingest.

## From composing to viewing

1. Check the available types and props with `syokan catalog` (see "Catalog" below).
2. Map the data you want to show onto those components. The top level is usually a container (`Stack` etc.) stacking items vertically.
3. Turn it into an envelope JSON (see "Envelope shape" below). Only `root` is required.
4. Post it with the CLI (see "Posting" below). On success the view URL is printed.

If you have built a similar view before, do not start from scratch — base it on a saved template (see "Templates for reproducibility" below).

## Envelope shape

Only the following may go in the POST body.
Never include `id`, `createdAt`, or `url` — the server assigns them.

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* catalog nodes; full examples in references/examples.md */ ] }, // required. the view tree
  "title": "Today's RSS",                                // optional. shown in the list and the view header
  "metadata": { "source": { "label": "daily-rss" } },   // optional. provenance label
  "schemaVersion": 1,                                    // optional. server fills it in
  "idempotencyKey": "rss-2026-06-28"                     // optional. names this view so it can be refreshed later instead of duplicated
}
```

`metadata.source` keeps extra keys beyond `label`; you may add `url` or `fetchedAt` (e.g. `{ "label": "gh-review", "url": "https://example.com/..." }`).

For daily or recurring views, include something like the date in the `idempotencyKey`. The syokan CLI handles the rest: it targets that key first, and only creates a new view if none exists yet — so the first post creates the view and every later post with the same key refreshes that same view in place instead of duplicating it. You don't need to track whether it's the first post yourself. (If you call the HTTP API directly instead of the CLI: `POST /api/snapshots` always creates and tags the key; `PUT /api/snapshots` targets an existing key and 404s if it's not there yet — there is no create-on-miss endpoint, which is why the CLI tries `PUT` first and falls back to `POST` on a 404.)

## Catalog

Get the available `type`s and their props definitions **from `syokan catalog`** (never transcribe them into md — pull them from here every time).

The output is `{ "items": [{ "type", "props", "childrenTypes" }] }`.

- `props`: the type's props as JSON Schema. Satisfy `required` / `enum` / `format` (httpUrl is `uri`, `Time.datetime` is `date-time`) / `additionalProperties:false` (unknown keys are rejected) exactly as given.
- `childrenTypes`: `null` means a container that accepts children, `[]` means a leaf that accepts none, `[..]` means only the listed types may be children.

For complete examples combining the components, see [references/examples.md](references/examples.md).

## Posting

Pass the assembled envelope as a file or via stdin; on success the view URL is printed to stdout (`syokan snapshot.json` / `cat snapshot.json | syokan` / `claude -p '…JSON…' | syokan`).

For everything else — commands, subcommands, env vars, exit codes — consult `syokan --help --json`; for types and props, `syokan catalog`.

## Live-syncing a tree file (TreeDoc)

To keep updating a view without re-posting, **write the catalog tree to a JSON file and syokan the path**. A file holding a bare catalog tree (`{ "type": ..., "props": ... }`, no envelope) is auto-wrapped in a live `TreeDoc`: the CLI resolves it to an absolute path, and **while the view is open it follows every save of the file**. Rewrite the file to update the view.

```bash
syokan ./dashboard.json   # summons the tree; every save re-renders the view
```

- `syokan <path>` accepts JSON only: an envelope posts once (static); a bare catalog tree live-syncs; anything else (markdown / log / txt / other JSON) is rejected with `unsupported_input`.
- Mid-write invalid JSON is safe: the view keeps the last valid render and shows an unobtrusive error until the file is valid again.
- To mix a synced subtree with static nodes, place `TreeDoc` nodes yourself (props: `path`, **absolute paths only**, no URLs). A `TreeDoc` cannot appear inside a synced tree (nesting is rejected).

To show a local markdown / text file, there is no file viewer: read it, structure it into catalog nodes (see "JSON only" above), and post the result. For raw text, `jq --rawfile` streams a body in without worrying about JSON escaping.

```bash
jq -n --rawfile body app.log \
  '{title:"app.log", root:{type:"PlainText",props:{body:$body}}}' \
  | syokan
```

## Templates for reproducibility

Do not rebuild a favorite view from scratch every time — save it as a template in syokan and reuse it.
A template is "the saved envelope itself". You may put markers like `{{...}}` in the skeleton and fill them in yourself.

If a matching template exists, do not build from zero: find the id in the list → fetch it → swap in the data → post. When you produce a new view worth keeping, save it and reproduce it next time. For subcommand syntax (`templates list|add|get|rm`), consult `syokan --help --json`.

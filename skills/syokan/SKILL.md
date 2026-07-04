---
name: syokan
license: MIT
description: "Build and POST a JSON snapshot envelope to syokan (召喚 — a verb: summon data into a rich, living view). Use when the user says \"syokan this\", \"syokan X\", \"show in syokan\", \"post a snapshot\", \"preview this markdown\", or in Japanese 『〜を syokan』『syokan に出して/表示して/投げて』『snapshot を作って/送って』『syokan のUIで見たい』『Markdown をプレビューして/md ファイルをブラウザで見たい』 — for RSS feeds, in-progress PR reviews, meeting-notes markdown, today's TODO, local Markdown files, or any aggregated data the user wants to see as structured UI. Compose the tree only from catalog components (Stack, Card, Heading, Link, Text, Time, MarkdownDoc, PlainText, Diff, Code, Badge, FileDoc) and send it via the syokan CLI or POST /api/snapshots. Never write JSX. Whenever the word syokan appears, use this skill even if the user does not explicitly say snapshot."
---

# syokan

**syokan (召喚, "summon") is a verb — LLMs summon rich UI.** When the user says "syokan X" (JA: 「Xを syokan」), that is a request to summon that data into a view. Under the hood it is a schema-driven view layer: instead of writing JSX, you speak a JSON incantation — a tree of catalog components — and syokan renders it with predefined components.
Your job is to assemble the data into an envelope and POST it to syokan.
In prose, use syokan as a bare transitive verb (never "do syokan" / never 「syokan する」 — syokan stands on its own).

If syokan is not installed yet (`syokan --help` fails), or the user says "onboarding", "set it up", or "first time using it", walk them through [references/onboarding.md](references/onboarding.md) up to their first snapshot. Do not silently run environment-changing operations such as installs: report that it is not installed and get the user's approval before executing (never install on your own).

## Non-negotiables

- **Snapshots are ephemeral**: a posted snapshot has no persistence guarantee. Only put reconstructible, transient data there (today's RSS, an in-progress review, etc.). For layouts you reuse, save a template to reproduce them (templates persist — see "Templates for reproducibility" below).
- **JSON only**: the server accepts nothing but a JSON envelope. Raw markdown or plain text is rejected. To show prose, wrap it in a `MarkdownDoc` or `PlainText` node.
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
  "idempotencyKey": "rss-2026-06-28"                     // optional. re-POSTs with the same key are deduped
}
```

`metadata.source` keeps extra keys beyond `label`; you may add `url` or `fetchedAt` (e.g. `{ "label": "gh-review", "url": "https://example.com/..." }`).
For daily or recurring views, include something like the date in the `idempotencyKey` to prevent duplicates.

## Catalog

Get the available `type`s and their props definitions **from `syokan catalog`** (never transcribe them into md — pull them from here every time).

The output is `{ "items": [{ "type", "props", "childrenTypes" }] }`.

- `props`: the type's props as JSON Schema. Satisfy `required` / `enum` / `format` (httpUrl is `uri`, `Time.datetime` is `date-time`) / `additionalProperties:false` (unknown keys are rejected) exactly as given.
- `childrenTypes`: `null` means a container that accepts children, `[]` means a leaf that accepts none, `[..]` means only the listed types may be children.

For complete examples combining the components, see [references/examples.md](references/examples.md).

## Posting

Pass the assembled envelope as a file or via stdin; on success the view URL is printed to stdout (`syokan snapshot.json` / `cat snapshot.json | syokan` / `claude -p '…JSON…' | syokan`).

For everything else — commands, subcommands, env vars, exit codes — consult `syokan --help --json`; for types and props, `syokan catalog`.

## Previewing local files

For a local file, **`syokan <path>` is the shortest route** — you syokan the file itself. Envelope JSON is posted as-is; anything else (markdown / log / txt / json, ...) is auto-wrapped in a live `FileDoc`. The CLI resolves it to an absolute path and hands it to the server, which reads the content and infers the format from the extension (`.md`/`.markdown` → markdown, `.json` → code, everything else → text). **While the view is open it follows edits to the file** (no re-posting needed).

```bash
syokan notes.md   # renders markdown; the view refreshes on every save
syokan app.log    # shows a growing log in monospace
```

To combine multiple files into one view, or mix them with `Heading` and other nodes, place `FileDoc` nodes yourself (props: `path`, **absolute paths only**; FileDoc handles reading and change tracking).

Conversely, to show a file's content **frozen statically** (no follow-up needed, or you are transforming the content), put the body into a `MarkdownDoc` / `PlainText` / `Code` node. `jq --rawfile` streams it in without worrying about JSON escaping.

```bash
jq -n --rawfile body README.md \
  '{title:"README.md", root:{type:"Stack",props:{},children:[{type:"MarkdownDoc",props:{body:$body}}]}}' \
  | syokan
```

## Templates for reproducibility

Do not rebuild a favorite view from scratch every time — save it as a template in syokan and reuse it.
A template is "the saved envelope itself". You may put markers like `{{...}}` in the skeleton and fill them in yourself.

If a matching template exists, do not build from zero: find the id in the list → fetch it → swap in the data → post. When you produce a new view worth keeping, save it and reproduce it next time. For subcommand syntax (`templates list|add|get|rm`), consult `syokan --help --json`.

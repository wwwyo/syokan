---
name: syokan
license: MIT
description: "Build and POST a JSON snapshot envelope to syokan (召喚 — a verb: summon data into a rich, living view). Use when the user says \"syokan this\", \"syokan X\", \"show in syokan\", \"post a snapshot\", \"preview this markdown\", or in Japanese 『〜を syokan』『syokan に出して/表示して/投げて』『snapshot を作って/送って』『syokan のUIで見たい』『Markdown をプレビューして/md ファイルをブラウザで見たい』 — for RSS feeds, in-progress PR reviews, review risk panels, meeting notes, today's TODO, dashboards, or any aggregated data the user wants to see as structured UI. Compose the tree only from catalog components (Stack, Card, Heading, Link, Text, Time, PlainText, Diff, Code, Badge, Mermaid, TreeDoc, Table, Stat, Checklist, Collapsible, TagFilter, Graph, Probe) and send it via the syokan CLI or POST /api/snapshots. Markdown is not rendered — structure prose into catalog nodes instead. Never write JSX. Whenever the word syokan appears, use this skill even if the user does not explicitly say snapshot."
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
- **Leaves cannot have children**: only containers (`Stack`, `Card`, `Checklist`, `Collapsible`, `TagFilter`) accept children; check `childrenTypes` in `syokan catalog`. Attaching children to a leaf node is rejected at ingest.
- **Probes are predefined checks only**: `Probe.check` must be one of the kinds published in the catalog's `mechanisms.probe.kinds`. There is no way to run an arbitrary command from a view — do not try.

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
  "schemaVersion": 1,                                    // optional. server fills it in
  "idempotencyKey": "rss-2026-06-28"                     // optional. names this view so it can be refreshed later instead of duplicated
}
```

For daily or recurring views, include something like the date in the `idempotencyKey`. The syokan CLI handles the rest: it targets that key first, and only creates a new view if none exists yet — so the first post creates the view and every later post with the same key refreshes that same view in place instead of duplicating it. You don't need to track whether it's the first post yourself. (If you call the HTTP API directly instead of the CLI: `POST /api/snapshots` always creates and tags the key; `PUT /api/snapshots` targets an existing key and 404s if it's not there yet — there is no create-on-miss endpoint, which is why the CLI tries `PUT` first and falls back to `POST` on a 404.)

## Catalog

Get the available `type`s and their props definitions **from `syokan catalog`** (never transcribe them into md — pull them from here every time).

The output is `{ "items": [{ "type", "props", "childrenTypes", "notes" }], "mechanisms": { ... } }`.

- `props`: the type's props as JSON Schema. Satisfy `required` / `enum` / `format` (httpUrl is `uri`, `Time.datetime` is `date-time`) / `additionalProperties:false` (unknown keys are rejected) exactly as given.
- `childrenTypes`: `null` means a container that accepts children, `[]` means a leaf that accepts none, `[..]` means only the listed types may be children.
- `notes`: usage contract the props schema can't express (e.g. `Checklist` pairs `children[i]` with `items[i]`). Read it before using a type.
- `mechanisms`: cross-cutting capabilities that work on **every** node — read this to know what `id` / `tags` do and which `Probe` kinds exist.

For complete examples combining the components, see [references/examples.md](references/examples.md).

## Cross-cutting node fields (id / tags)

Besides `type` / `props` / `children` / `key`, any node may carry:

- `id`: makes the node addressable. A `Link` with `href: "#<id>"` jumps to it inside the view (revealing it if folded or filtered out). It is also the identity for viewer-local UI state — **give an `id` to every `Checklist` / `Collapsible` / `TagFilter` / `Probe`** so checks, folds, and selections survive reloads.
- `tags`: opts the node into narrowing by an ancestor `TagFilter` (e.g. tag finding cards with `"High"` / `"Medium"` and let the reader show only High). Untagged nodes are never filtered.

Interaction state (checks, folds, filter selections, probe re-runs) lives in the viewer's browser, never in the envelope — post the *initial* state (`checked`, `defaultOpen`, `result`) and let the reader take it from there.

## Interactive views (risk panels, TODO, dashboards)

Typical composition for a review risk panel (condensed envelope in [references/examples.md](references/examples.md) Example 5):

- `Stat` row up top for the counts; `Table` as the cockpit where each row `Link`s (`#id`) to its finding `Card`.
- `TagFilter` around the findings; cards tagged by severity.
- Low-priority detail (evidence hunks, verified-None sections) goes inside `Collapsible` instead of being deleted.
- "No findings" claims carry a `Probe` whose `check` re-measures the claim (search count, diff cleanliness, file existence). Include the `result` you measured at generation time — you can run it via `POST /api/probes/run` with the same `check` — or omit it and the reader runs it. On public shares, probe args/results are stripped unless you set `shareVisible: true`.
- `Graph` (roles: added/removed/hotspot/neutral, colors fixed by syokan) side by side in a horizontal `Stack` for before/after dependency contrasts. Prefer it over `Mermaid` when the diagram is a plain node/edge sketch — it cannot fail to parse.
- `Checklist` for reviewer progress; checked items fold to one line.

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

# syokan

A personal, schema-driven **view layer**. Instead of writing JSX, an LLM (Claude Code / a scheduled agent / the CLI) posts a **JSON tree**, and syokan renders it with pre-defined React components. Snapshots are **ephemeral** — syokan never persists anything you need to keep; promote those to [meml](https://github.com/wwwyo/meml) instead.

> 照鑑 / 抄観 — a place to *abstract and observe* what's happening around you.

The design rationale, directory layout, and contribution rules live in [AGENTS.md](./AGENTS.md). This file is the **usage** reference.

## How it works

You send a snapshot as a JSON tree. Each node is `{ type, props, children? }`, where `type` is a catalog component. Zod validates the tree on ingest, and a registry maps each `type` to a React component:

```
{ "type": "Heading", "props": { "text": "Today" } }
                       │
                       ▼
          catalog["Heading"]  →  <Heading text="Today" />
```

syokan is a CSR single-page app with client-side routing (TanStack Router): `/` is the home and `/snapshots/:id` renders one snapshot. The server returns the same SPA HTML for any non-API path, so deep links and reloads work; unknown `/api/*` paths return a JSON `404`.

## Setup

```bash
mise install   # Bun 1.3.12, pinned in mise.toml
bun install    # also pulls portless (devDep)
bun run dev    # Bun.serve + HMR
```

`dev` runs behind [portless](https://github.com/vercel-labs/portless): the app is pinned to port `5173`, and the proxy serves it at both `https://syokan.localhost` and `http://localhost:5173`. The first run needs sudo (port 443) and registers a local CA. To bypass the proxy, run `PORTLESS=0 bun run dev`. Stop the proxy daemon with `bunx portless proxy stop`.

## Usage

### Posting a snapshot

Snapshots are a single REST resource at `/api/snapshots` — create (`POST`), list (`GET`), fetch (`GET /:id`), delete (`DELETE /:id`). Creation funnels through one endpoint:

```
POST /api/snapshots
Content-Type: application/json
```

The body is a snapshot **envelope** — and it must be **JSON**. syokan does not accept Markdown or plain-text files; to display those, wrap the content in a `MarkdownDoc` / `PlainText` node (see [Catalog types](#catalog-types)). The caller owns the envelope; syokan never wraps or decorates it.

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // required: the view tree
  "title": "Today's RSS",                  // optional
  "metadata": { "source": { "label": "daily-rss" } }, // optional — see Source label
  "schemaVersion": 1,                       // optional (server defaults this)
  "idempotencyKey": "rss-2026-06-20"        // optional — dedupes repeated posts
}
```

The server assigns `id` and `createdAt`, then responds `201` with:

```json
{ "id": "<uuid>", "url": "/snapshots/<uuid>", "snapshot": { /* full envelope */ } }
```

Errors are `400` with `{ "error": "invalid_json" }` (body isn't JSON) or `{ "error": "validation_failed", "issues": [...] }` (body doesn't satisfy the schema).

### CLI

The `syokan` binary (`cli/syokan.ts`, also runnable as `bun cli/syokan.ts`) lazy-spawns the server when needed.

| Command | What it does |
| --- | --- |
| `syokan` | Opens the home page. If JSON is piped to stdin, posts that instead. |
| `syokan <file.json>` | Reads the file as an envelope and posts it. Equivalent to `cat file.json \| syokan`. |
| `… \| syokan` | Posts the JSON envelope streamed on stdin (e.g. `claude -p '…' \| syokan`). |
| `syokan open [id]` | Opens a snapshot in the browser; with no `id`, opens home. |
| `syokan stop` | Stops the server that the CLI lazy-spawned. |

On a successful post the CLI prints the view URL. The file form and the stdin form are equivalent — both just stream a JSON envelope to `/api/snapshots`.

### Catalog types

These are the `type` values you can put in a tree:

- **Containers** (accept `children`): `Stack`, `Card`
- **Leaves**: `Heading`, `Link`, `Text`, `Time`, `MarkdownDoc`, `PlainText`, `Diff`, `Code`, `Badge`

Each component's props are defined and validated by its Zod schema in `src/catalogs/<Name>/`. Browse them visually with Storybook (below).

### Source label

A snapshot may carry `metadata.source.label` — an optional, non-empty string naming where the data came from (`"daily-rss"`, `"gh-review"`, …). When present it shows up in the sidebar list and the view header; when absent, no label is shown. The CLI never injects one — the label lives in the envelope, so it's entirely caller-controlled. The `source` object is loose, so extra fields like `url` or `fetchedAt` are preserved alongside `label`.

## Storybook

The catalog components are reviewed visually with Storybook:

```bash
bun run storybook        # http://localhost:6006
bun run build-storybook  # static build → storybook-static/
```

Each catalog component has a `<Name>.stories.tsx` next to it covering prop variants, edge cases, and light/dark. Toggle the `.dark` class from the toolbar to check theme behavior.

## More

- Design rationale, directory structure, and contribution conventions: [AGENTS.md](./AGENTS.md)
- Long-term memory layer (promotion target): [meml](https://github.com/wwwyo/meml)

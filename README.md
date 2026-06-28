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

`dev` runs behind [portless](https://github.com/vercel-labs/portless): `--app-port 5273` pins the dev app to port `5273` (portless injects it via `PORT`) and the proxy serves it at `https://syokan.localhost`. It uses a **separate, repo-local data dir** (`./.syokan-dev/`, gitignored) and a different port (`5273`) from the global install (`~/.config/syokan/`, port `5173`), so a running `bun run dev` and the everyday `syokan` never share a server or mix snapshots. The first run needs sudo (port 443) and registers a local CA. To bypass the proxy, run `PORTLESS=0 bun run dev` — without portless there's no `PORT` injection, so the server falls back to its default port `5173`. Stop the proxy daemon with `bunx portless proxy stop`.

While developing, post to the **dev** server by pointing the CLI at it: `SYOKAN_BASE_URL=http://localhost:5273 bun cli/syokan.ts <file.json>`. The bare `syokan` binary always talks to the **global install** on `5173`, so you see your latest local renderer in dev and the published one everywhere else.

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
| `syokan catalog` | Prints the catalog manifest (`GET /api/catalog`) as JSON. |
| `syokan templates` | Lists saved templates (id / title / description) as JSON. |
| `syokan templates add --title <t> [--description <d>] <file\|->` | Saves a template from a file or stdin; prints the new id. |
| `syokan templates get <id>` | Prints one template (incl. its json). |
| `syokan templates rm <id>` | Deletes a template. |

On a successful post the CLI prints the view URL. The file form and the stdin form are equivalent — both just stream a JSON envelope to `/api/snapshots`. The `catalog` / `templates` subcommands go through the same lazy-spawned server and print JSON for piping into other tools.

### Catalog types

The catalog (`src/catalogs`) is the SSOT for which `type` values a tree may contain. Fetch the machine-readable manifest instead of hard-coding it elsewhere:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes }] }
```

`childrenTypes` is `null` for containers (any child), `[]` for leaves (no children), or a list of allowed child types. `props` is each component's Zod schema rendered as JSON Schema (`required` / `enum` / `format` / `additionalProperties:false`).

At a glance, the current types are:

- **Containers** (accept `children`): `Stack`, `Card`
- **Leaves**: `Heading`, `Link`, `Text`, `Time`, `MarkdownDoc`, `PlainText`, `Diff`, `Code`, `Badge`

The props live in each component's Zod schema (`src/catalogs/<Name>/`); browse them visually with Storybook (below) or via `GET /api/catalog`.

### Templates

syokan keeps a store of reusable view **templates** so a favorite layout can be reproduced instead of rebuilt from scratch. A template is just a saved JSON (typically a snapshot envelope) plus a `title` / optional `description`; syokan stores and lists them but never interprets the contents. They live in `~/.config/syokan/templates/` — unlike snapshots, templates are meant to persist.

```
GET    /api/templates        # { items: [{ id, title, description?, createdAt }] }  (no json)
POST   /api/templates        # body { title, description?, json } → 201 { id, template }
GET    /api/templates/:id    # full template incl. json, or 404
DELETE /api/templates/:id    # 404 if unknown
```

### Source label

A snapshot may carry `metadata.source.label` — an optional, non-empty string naming where the data came from (`"daily-rss"`, `"gh-review"`, …). When present it shows up in the sidebar list and the view header; when absent, no label is shown. The CLI never injects one — the label lives in the envelope, so it's entirely caller-controlled. The `source` object is loose, so extra fields like `url` or `fetchedAt` are preserved alongside `label`.

## Build (standalone binary)

The global tool is a **self-contained executable** — no Bun, Node, or npm needed to run it. `bun run compile` bundles the CLI, server, and frontend (Tailwind included) into one binary via `Bun.build({ compile })`:

```bash
bun run compile               # → dist/syokan (a standalone binary)
cp dist/syokan ~/.local/bin/  # put it on PATH; then `syokan`, `syokan open`, `syokan <file.json>` …
```

The binary is **dual-mode** ([entry.ts](./entry.ts)): invoked normally it's the CLI; to run its server it re-execs *itself* with `SYOKAN_SERVE=1` (instead of shelling out to `bun`). The global binary uses port `5173` and data in `~/.config/syokan/` (override with `XDG_CONFIG_HOME`). To update, re-run `bun run compile` and replace the binary.

On macOS a locally built binary runs as-is; if Gatekeeper blocks it after copying, ad-hoc sign it once: `codesign --sign - dist/syokan`.

### Distribute via mise (ubi)

`bun run compile:all` cross-compiles per-platform binaries named so mise's [ubi](https://mise.jdx.dev/dev-tools/backends/ubi.html) backend can detect OS/arch:

```bash
bun run compile:all   # → dist/syokan-{darwin-arm64,darwin-x64,linux-x64,linux-arm64}
```

(Each target downloads its Bun runtime once.) Attach those to a GitHub Release, then install/pin with mise:

```bash
gh release create v0.1.0 dist/syokan-*           # publish the assets
mise use -g ubi:wwwyo/syokan@0.1.0               # install + pin
```

Notes: a **private** repo needs `GITHUB_TOKEN` for ubi to fetch assets; an unsigned binary may need `codesign --sign -` (or `xattr -dr com.apple.quarantine <path>`) on macOS; if ubi can't auto-pick the asset, narrow it with `ubi:wwwyo/syokan[matching=darwin-arm64]`.

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

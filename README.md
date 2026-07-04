# syokan

**syokan — LLMs summon rich UI.**

*syokan* (召喚, "summon") is a verb. Chant the name of what you want to see, and a view appears:

```bash
syokan notes.md   # syokan your notes
```

An LLM speaks a JSON incantation, and a rich, living interface materializes — no JSX written, no build step. Scattered data — today's RSS, an in-flight PR review, shared meeting notes, a local markdown file — appears as structured UI only when you need it. Views are ephemeral: summoned when needed, they fade; nothing is hoarded. And anything can chant: Claude Code, a scheduled agent, a CLI one-liner, a webhook.

日本語版: [README.ja.md](./README.ja.md)

Design rationale, directory layout, and development conventions live in [AGENTS.md](./AGENTS.md). This README covers **usage**.

## How it works

Under the hood, syokan is a personal schema-driven view layer. Instead of writing JSX, an LLM (Claude Code / scheduled agent / CLI) posts a **JSON tree**, and syokan renders it with predefined React components. Snapshots are **ephemeral** — summoned views are not meant to stay; data that must persist does not belong here.

A snapshot is a JSON tree of `{ type, props, children? }` nodes. Each `type` names a catalog component; on receipt, Zod validates the tree and the registry maps it to a React component:

```
{ "type": "Heading", "props": { "text": "Today" } }  →  <Heading text="Today" />
```

It is a CSR app with client-side routing (TanStack Router). `/` is home, `/snapshots/:id` is an individual snapshot. Every non-API path returns the SPA HTML, so deep links and reloads just work.

## Getting started

For everyday use, `syokan` is a **single binary** (no Bun/Node required; the server lazy-spawns automatically).

```bash
mise use -g github:wwwyo/syokan@latest   # install via the github backend
syokan --help                         # list commands (machine-readable: --help --json)
```

> Other install options: download `syokan-<os>-<arch>` directly from [Releases](https://github.com/wwwyo/syokan/releases), or build from source ([Build](#build-single-binary)). If macOS Gatekeeper blocks the binary, run `codesign --sign - <path>`.

Your first summon (the server starts automatically and a view URL is returned):

```bash
echo '{"root":{"type":"Heading","props":{"text":"🎉 syokan is set up"}}}' | syokan
syokan open   # open home
```

Check props with `syokan catalog` and compose the tree. From there, syokan whatever you want to see.

Local files need no envelope at all — just syokan the path. If the input is envelope JSON it is posted as-is; anything else (markdown / log / txt / config json, etc.) is auto-wrapped in a live `FileDoc`, so edits to the original file flow into the view:

```bash
syokan notes.md   # renders the markdown; every save refreshes the view
syokan app.log    # shows the growing log in monospace
```

## Development

```bash
mise install && bun install
bun run dev    # Bun.serve + HMR (https://syokan.localhost via portless)
```

Dev uses port `5273` and the repo-local `./.syokan-dev/` directory, so it never collides with a global install (port `5173` / standard XDG directories). To post to the dev server, set `SYOKAN_BASE_URL=http://localhost:5273`. To skip portless, use `PORTLESS=0 bun run dev` (default port `5173`).

## Envelope

The body of `POST /api/snapshots` is a snapshot **envelope** (**JSON** only; wrap Markdown/plain text in `MarkdownDoc` / `PlainText` nodes):

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // required: view tree
  "title": "Today's RSS",                              // optional
  "metadata": { "source": { "label": "daily-rss" } }, // optional: origin label, shown in the sidebar and header
  "idempotencyKey": "rss-2026-06-20"                   // optional: dedupes duplicate posts
}
```

On success: `201` with `{ id, url, snapshot }`. Validation errors return `400` (`invalid_json` / `validation_failed`). CLI commands: `syokan --help`.

## Catalog

The SSOT for `type` is the catalog (`src/catalogs`). Fetch the manifest to get the props contract:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes }] }
```

Current types — containers: `Stack` `Card` / leaves: `Heading` `Link` `Text` `Time` `MarkdownDoc` `PlainText` `Diff` `Code` `Badge` `FileDoc`. Review them visually with Storybook (`bun run storybook`).

`FileDoc` (props: `path`, **absolute paths only**) is a catalog node that references a file path. The server reads the content, infers the rendering format from the extension (`.md`/`.markdown` → markdown, `.json` → code, everything else → text), and keeps the view in sync with file changes (forward sync). The server binds to localhost only, and watching is transient state that lives only while a view is open (never persisted).

## Templates

A layout you like can be kept as a **template** (a saved envelope + `title`) under `~/.local/share/syokan/templates/`. Unlike snapshots, templates persist. syokan only stores and lists them and never interprets their contents (`GET/POST/DELETE /api/templates`).

## Settings

Display settings (theme / font) persist as a singleton resource at `~/.config/syokan/settings.json` (unlike snapshots, they are kept). The browser's localStorage is a cache for instant application; the server is the source of truth, synced on startup, so settings are shared across browsers.

```
GET /api/settings              # { theme, font } (defaults if unset)
PUT /api/settings              # partial update (only the keys you send are overwritten). Unknown keys / invalid values: 400
```

`theme`: `system` `light` `dark` (SSOT: `src/schema/setting.ts`). `font`: an identifier for a font preset (default `system`; most presets load from Google Fonts, but `system`/`moralerspace` do not). The list and how to extend it live in `src/lib/fonts.ts` — adding one entry there adds a font (the actual font is loaded dynamically via `<link>` on selection and `--app-font-*` is rewritten; `styles.css` / `index.html` stay untouched).

## Build (single binary)

```bash
bun run compile       # → dist/syokan (CLI + server + frontend in one binary)
bun run compile:all   # → dist/syokan-<os>-<arch> (cross-compile, for Release distribution)
```

Dual-mode ([entry.ts](./entry.ts)): a normal launch is the CLI; the server re-execs the binary itself with `SYOKAN_SERVE=1`. The global binary uses port `5173`, and persistence follows the XDG base directories (settings = `~/.config/syokan/`, templates = `~/.local/share/syokan/`, snapshots + runtime/log = `~/.local/state/syokan/`). Override locations with `XDG_{CONFIG,DATA,STATE}_HOME` (absolute paths only; relative values are ignored). When upgrading from the old layout, templates are migrated to the new location automatically on startup. To distribute, upload the assets to a Release and install with `mise use -g github:wwwyo/syokan@latest`.

## More

- Design rationale, directory layout, development conventions: [AGENTS.md](./AGENTS.md)

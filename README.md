# syokan

**syokan — LLMs summon rich UI.**

*syokan* (召喚, "summon") is a verb. Chant the name of what you want to see, and a view appears:

```bash
syokan dashboard.json   # syokan your dashboard
```

An LLM speaks a JSON incantation, and a rich, living interface materializes — no JSX written, no build step. Scattered data — today's RSS, an in-flight PR review, shared meeting notes, a live status board — appears as structured UI only when you need it. Views are ephemeral: summoned when needed, they fade; nothing is hoarded. And anything can chant: Claude Code, a scheduled agent, a CLI one-liner, a webhook.

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

A tree file needs no envelope at all — just syokan the path. If the input is envelope JSON it is posted once; a bare catalog tree is auto-wrapped in a live `TreeDoc`, so edits to the file flow into the view (an LLM keeps rewriting the file; the view keeps up). Non-JSON input is rejected — syokan speaks catalog trees only:

```bash
syokan dashboard.json   # summons the tree; every save re-renders the view
```

## Development

```bash
mise install && bun install
bun run dev    # both apps: syokan server (Bun.serve + HMR) and the share Worker (wrangler dev)
```

Root `dev` fans out to every workspace app (`bun --filter '@syokan/*' dev`); each app owns its own `dev` script. It brings up two processes:

- **`@syokan/app`** on port `5273` (`https://syokan.localhost` via portless), writing to the repo-local `./.syokan-dev/` directory, so it never collides with a global install (port `5173` / standard XDG directories).
- **`@syokan/share`** on port `8787` (`wrangler dev`, local KV via miniflare). The viewer is bundled once at startup; worker code hot-reloads, but viewer edits need a re-run (no viewer HMR).

In dev the syokan server points `SYOKAN_SHARE_API` at the local Worker (`http://localhost:8787`), so publishing/sharing is exercised against local KV — it never touches the production `syokan.dev` share service. Inside this repo the mise `[shell_alias]` likewise points the `syokan` CLI at the dev server (`SYOKAN_BASE_URL=http://localhost:5273`), so `syokan <file>` posts to dev, not production; outside the repo `syokan` is the global install. To skip portless, use `PORTLESS=0 bun run dev` (default port `5173`). To run just one app, use its own `dev` (e.g. `bun --filter @syokan/app dev`) — note `@syokan/app` alone still targets local share on `8787`, so publishing needs the share Worker up too.

## Envelope

A snapshot **envelope** (**JSON** only; markdown is not rendered — structure prose into catalog nodes, or wrap raw text in `PlainText`) is created with `POST /api/snapshots` and refreshed in place with `PUT /api/snapshots`:

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // required: view tree
  "title": "Today's RSS",                              // optional
  "metadata": { "source": { "label": "daily-rss" } }, // optional: origin label, shown in the sidebar and header
  "idempotencyKey": "rss-2026-06-20"                   // optional on POST, required on PUT: names a view so it can be targeted again later
}
```

`POST` always creates a fresh snapshot (`201`); an `idempotencyKey` just tags it for later `PUT`s. `PUT` requires `idempotencyKey` and targets an existing view by it: a match replaces `root`/`title`/`metadata` in place (same id/url; `createdAt` is kept) and returns `200`; no match returns `404` (`not_found`) — `PUT` never creates (there is no "create if missing" escape hatch; use `POST` for that). Validation errors return `400` (`invalid_json` / `validation_failed`). CLI commands: `syokan --help`.

## Catalog

The SSOT for `type` is the catalog (`apps/syokan/src/catalogs`). Fetch the manifest to get the props contract:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes }] }
```

Current types — containers: `Stack` `Card` / leaves: `Heading` `Link` `Text` `Time` `PlainText` `Diff` `Code` `Badge` `Mermaid` `TreeDoc`. Review them visually with Storybook (`bun run storybook`).

`TreeDoc` (props: `path`, **absolute paths only**, no URLs) is a catalog node that references a catalog-tree JSON file. The server reads the content, the client validates it and renders it as a live subtree, and the view stays in sync with file changes (forward sync). A mid-write invalid save never blanks the view: the last valid render is kept with an unobtrusive error until the file is valid again. A `TreeDoc` cannot appear inside a synced tree (nesting is rejected, which rules out cycles). The server binds to localhost only, and watching is transient state that lives only while a view is open (never persisted). Publishing a view freezes each `TreeDoc` into its subtree at that moment — public payloads never reference files.

## Templates

A layout you like can be kept as a **template** (a saved envelope + `title`) under `~/.local/share/syokan/templates/`. Unlike snapshots, templates persist. syokan only stores and lists them and never interprets their contents (`GET/POST/DELETE /api/templates`).

## Settings

Display settings (theme / font) persist as a singleton resource at `~/.config/syokan/settings.json` (unlike snapshots, they are kept). The browser's localStorage is a cache for instant application; the server is the source of truth, synced on startup, so settings are shared across browsers.

```
GET /api/settings              # { theme, font } (defaults if unset)
PUT /api/settings              # partial update (only the keys you send are overwritten). Unknown keys / invalid values: 400
```

`theme`: `system` `light` `dark` (SSOT: `apps/syokan/src/schema/setting.ts`). `font`: an identifier for a font preset (default `system`; most presets load from Google Fonts, but `system`/`moralerspace` do not). The list and how to extend it live in `apps/syokan/src/lib/fonts.ts` — adding one entry there adds a font (the actual font is loaded dynamically via `<link>` on selection and `--app-font-*` is rewritten; `styles.css` / `index.html` stay untouched).

## Build (single binary)

```bash
bun run compile       # → apps/syokan/dist/syokan (CLI + server + frontend in one binary)
bun run compile:all   # → apps/syokan/dist/syokan-<os>-<arch> (cross-compile, for Release distribution)
```

Dual-mode ([entry.ts](./apps/syokan/entry.ts)): a normal launch is the CLI; the server re-execs the binary itself with `SYOKAN_SERVE=1`. The global binary uses port `5173`, and persistence follows the XDG base directories (settings = `~/.config/syokan/`, templates = `~/.local/share/syokan/`, snapshots + runtime/log = `~/.local/state/syokan/`). Override locations with `XDG_{CONFIG,DATA,STATE}_HOME` (absolute paths only; relative values are ignored). When upgrading from the old layout, templates are migrated to the new location automatically on startup. To distribute, upload the assets to a Release and install with `mise use -g github:wwwyo/syokan@latest`.

## More

- Design rationale, directory layout, development conventions: [AGENTS.md](./AGENTS.md)

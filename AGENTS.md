# syokan

**syokan (召喚, "summon") is a verb.** An LLM speaks a JSON incantation, and a rich, living interface appears — no JSX written, no build step. Typing `syokan notes.md` reads literally as "syokan notes.md": the command itself is the incantation. Views are ephemeral — summoned when needed, they fade; nothing is hoarded. Under the hood this is a schema-driven renderer: data pulled from multiple repositories, external APIs, and the filesystem is rendered for humans through predefined React components. LLMs (Claude Code / scheduled agents / CLI) **post a JSON tree only** — no per-view JSX is ever generated.

> **Setup and usage (the `POST /api/snapshots` envelope schema / source.label spec / catalog type list) live in [README.md](./README.md); CLI commands live in `syokan --help` (machine-readable via `--help --json`) — those are the SSOT.** This AGENTS.md covers design judgments (why) and development conventions (how to change things).

## Why build this

### The problem to solve

The data I want to look at is scattered around me:

- Today's RSS feed (a daily input markdown)
- An in-progress code review (diff fetched via `gh` + my own comments)
- Meeting-notes markdown shared at work (I just want to open and read it on the spot)
- Today's Calendar / TODO
- Re-reading an article I saved somewhere

I want to see these **at a single URL, in structured UI, only when needed**. Opening markdown files one after another doesn't fit the requirement, and neither does hoarding everything in Notion.

### The limits of having Claude Code write JSX every time

Building views with Claude Code is possible, but generating JSX each time means:

- **Token cost** balloons (hundreds of lines of JSX × display frequency)
- **Generation speed** is slow (seconds to tens of seconds of lag)
- **Accuracy** wobbles (wrong props, type mismatches, missing imports)
- **Design consistency** erodes (the same Card looks subtly different from day to day)
- **Un-refactorable** — each page becomes a snowflake; no shared change is possible

An LLM's real strength is structuring data, not rendering it. **Rendering, designed once up front, can be reused.** I want to structure that division of labor.

### Why separate from the persistence layer

The place where data should be kept and the place where you just want to look at it have different lifecycles:

| | Keep (persistence layer) | Just look (syokan) |
|---|---|---|
| Example | "a concept I learned 3 months ago" | "today's RSS", "an in-progress review" |
| Lost on deletion | Knowledge | Nothing (reconstructible) |
| Backup | Required | Unnecessary |
| Schema stability | High | Loose |

Mixing these into the same store means:
- Temporary review state pollutes long-term memory
- "Today's RSS" shows up in a search three years later
- Deletion/cleanup policies clash, so you end up carving out a separate table with retention anyway → in which case, separate them from the start

Therefore **syokan does not persist data**. Anything worth keeping is explicitly promoted to a separate persistence layer (the promotion path).

### Why not pin down the interface

Locking the input path to MCP makes CLI, webhooks, and paste second-class citizens. Actual usage:

- Claude Code posts via file-edit-based workflows
- From the CLI, wrap local content (shared meeting notes, etc.) into an envelope on the spot and post it to view
- A scheduled agent may push periodically in the future
- A gh webhook may trigger on PR reviews

If all of these flow into the same JSON envelope at `POST /api/snapshots`, the renderer stays unchanged no matter how many input paths are added.

## Core design

### Separation of roles

| Layer | Role | This project |
|----|------|----------------|
| Memory layer (for LLMs) | Long-term memory, wiki, knowledge queries | **Out of scope** (a separate persistence layer owns this) |
| View layer (for humans) | Ephemeral dashboards, in-progress reviews, today's RSS | **This (syokan)** |

syokan **does not persist data** (ephemeral). Information that needs long-term storage is explicitly promoted to a separate persistence layer.

### Schema-driven view

Instead of having the LLM "write JSX", have it **output a JSON tree that satisfies a schema**. Zod validates it; the catalog maps it to React components.

```
{ type: "Heading", props: { text, href } }
                ↓
        catalog["Heading"] → <Heading {...props} />
```

Benefits: fewer LLM tokens, generation speed, type safety, design consistency, easy refactoring.

The catalog's type and props definitions have **`src/catalogs` as the single SSOT**. `manifest.ts` turns them into JSON Schema and exposes them at `GET /api/catalog`; the LLM (skill) pulls the props contract from this API rather than from a transcription in md. Copying into md drifts on every catalog change, so the SSOT is kept in exactly one place.

**Templates** — for "making a favorite view reproducible" — follow the same philosophy, with syokan as the SSOT. A template is "a saved envelope as-is"; syokan does not interpret its contents, it only stores and lists them (`~/.local/share/syokan/templates/`, `GET/POST/DELETE /api/templates`). There is no placeholder render engine. Assembling from a template (placeholder substitution, expanding variable-length lists) is the LLM's (skill's) job; syokan stays a vault. Unlike snapshots (ephemeral), templates are meant to be kept.

### Interface-free

The input path is not fixed to any one of MCP / CLI / HTTP / paste. Everything is unified into the same JSON envelope at `POST /api/snapshots` (the envelope schema's SSOT is the README).

```
[Claude Code]      ──┐
[CLI]              ──┤
[scheduled agent]  ──┼──→ JSON tree → catalog → React render
[gh webhook]       ──┘
```

### File-backed view (file-reference node)

Display a local file (markdown / log / json ...) by "just handing it over", with the view following edits to the source file. The file reference is confined to **a single catalog node (`FileDoc`)**, not the envelope or store level. This way the snapshot envelope carries only a catalog tree as before, and the store gives no special treatment to "snapshots that reference files". "When to re-read" becomes the `FileDoc` component's responsibility, and it can coexist in a snapshot with ordinary catalog nodes.

- **Rendering**: `FileDoc` reads the path (absolute) in its props via the server, infers the format from the extension, and delegates to the existing MarkdownDoc / PlainText / Code (the first catalog component that fetches data). The inference rules have `src/lib/fileFormat.ts` as SSOT (`.md`/`.markdown`→markdown, `.json`→code, everything else→text).
- **Forward sync**: the server watches the file and, on change, notifies only "it changed" via SSE (`/api/files/watch`). The client re-fetches the content with `GET /api/files`. Errors for missing / oversized / binary / non-regular files ride plainly on HTTP status codes (404/413/415/422/403); content is not pushed over SSE so that initial mount and updates share a single read path.
- **watcher = f(subscription)**: watching is connection-scoped runtime state, never persisted. Opening/closing the SSE connection is the subscription; watchers are armed/released via a per-path refcount. After a server restart, watchers are re-armed by client reconnection (independent of the store).
- **CLI auto-wrap**: `syokan <path>` posts as-is if the file is envelope JSON; otherwise it auto-wraps it in a `FileDoc` (the sole exception to the previous rule "the CLI does not wrap text"). The dedup identifier is the absolute path, riding the existing idempotency mechanism (no store changes).
- **Ephemeral principle**: file contents are never brought into the envelope/store. A file-backed snapshot differs in lifecycle from conventional snapshots in that its reproducibility depends on the source file, but this difference is accepted to preserve the principle. The trust boundary is the localhost bind + user permissions; no allowlist is imposed on file reads. Judgment and history: `.agent/prd/file-source-sync/` (prd.md / decision.log).

## Directory structure

```
syokan/                      # bun workspace root (package "syokan-workspace"): delegation scripts only, no deps. tsconfig.base.json is the shared compilerOptions base
├── apps/syokan/             # the app (workspace package "syokan"; version SSOT = its package.json)
│   ├── entry.ts             # dual-mode entry for the single binary (SYOKAN_SERVE switches cli/server)
│   ├── cli/syokan.ts        # CLI (post / open / stop / catalog / templates). Lazy-spawns the server (compiled: itself)
│   ├── build.ts             # compile script (host=dist/syokan; --release cross-compiles each OS/arch)
│   ├── src/
│   │   ├── frontend.tsx     # RouterProvider mount
│   │   ├── router.tsx       # TanStack Router route tree (root → _shell layout=AppShell → home/view)
│   │   ├── Home.tsx / ViewPage.tsx / Render.tsx  # each route's body + recursive JSON tree renderer
│   │   ├── schema/          # Zod schemas (catalog Item / envelope / validation formatting)
│   │   ├── lib/             # cross-cutting utils (paths=XDG 3-way (config/data/state) resolution / cn / date / code / snapshots ...)
│   │   ├── catalogs/        # ★ public types LLMs post as JSON. index.ts is the registry; manifest.ts JSON-Schemas it for GET /api/catalog
│   │   └── components/      # internal UI not registered in the catalog (ui=shadcn / AppShell / AppSidebar / PageLayout ...)
│   ├── server/             # Bun.serve (127.0.0.1 bind). routes.ts=/api/{snapshots,catalog,templates,settings,files}, store.ts=snapshots (ephemeral), templates.ts=template storage (persistent), setting.ts=display-settings singleton (persistent), fileSource.ts=file reads + change watching (connection-scoped runtime state), share.ts=publish/auth proxy to the share Worker (token holder), materialize.ts=FileDoc freezing at publish
│   └── .storybook/         # visual review base for the catalog
├── apps/share/             # bun workspace package (@syokan/share): the public-share Cloudflare Worker (worker.ts=Hono /api/v1/*, hc<AppType> RPC types), viewer/ (share page + landing SPA), wrangler.jsonc. Deploys independently (`bun run deploy:share`). viewer imports apps/syokan/src/catalogs + Render.tsx directly — a deliberate coupling so catalog and viewer share one deploy unit (no schema drift). Design/history: .agent/prd/public-share/
└── skills/syokan/          # ★ SSOT of the syokan skill for LLMs. Bundled in the repo for distribution; the dotfiles side (.agents/skills/) is an installed copy. Always edit here when fixing the skill
```

Client-side routing uses **TanStack Router** (code-based routes; no Vite plugin — it rides Bun's bundler). The resident shell is a pathless layout route (`_shell`, component=AppShell) that mounts the sidebar and content slot exactly once; route transitions swap only the contents of `<Outlet />`. This keeps the sidebar's open/closed state, scroll position, and the already-fetched list alive across transitions, and the router's `scrollRestoration` restores the reading position in the body. Direct URL / reload / back-forward work via the server's SPA fallback (`/*` → HTML). Paths matching no route are caught by a splat route (`path: "$"`) under `_shell` so they render inside the shell (a pathless layout unmatches itself when no child matches, so a root-level splat would lose the shell).

The snapshot list is owned by the `_shell` layout's loader and is not re-fetched on child transitions (no loading flicker). There are two refresh triggers, both re-running only the shell loader via `router.invalidate({ filter: _shell })` (background revalidation = stale-while-revalidate, so the list never disappears): after an in-app deletion, and on returning to the tab (`focus` / `visibilitychange`). Creation happens outside the app (CLI / LLM), so there is no in-app trigger; an app left open picks it up via the tab-return refetch. If the list fetch fails, the whole shell falls to the errorComponent (rather than leaving only the body, errors are surfaced together at the point of interaction — a deliberate trade-off).

> The original MVP used full page reloads, premised on "no state carried between pages". Adding stateful chrome (the sidebar) broke that premise, so we deliberately switched to client routing (a reversal of the old "not adopting it" policy; history in `.agent/prd/client-routing/`).

### Component collocation

Implement a component at `<Name>/index.tsx` and colocate its test (`<Name>.test.tsx`) and story (`<Name>.stories.tsx`) in the same dir. Imports point at the dir, like `@/components/PageLayout` (resolves to index.tsx). Gathering related files in one place prevents stragglers during refactors/deletions.

- **Catalog-public** (types LLMs post as JSON) go in `catalogs/<Name>/`; **non-public internal parts** go in `components/<Name>/`
- **Internal-only subparts** (used solely by that component) nest under the parent dir (e.g. the catalog's `Code/CopyButton/`). Once shared by multiple components, promote it one level up. Scope = location
- `components/ui/` is the exception: shadcn's generated flat files (not dir-ified)

## Setup / usage

Setup steps (mise / bun / portless), the `POST /api/snapshots` envelope schema, the source.label spec, and the catalog type list have [README.md](./README.md) as SSOT. CLI commands, in the same spirit as the catalog, have `syokan --help` (machine-readable via `--help --json`) as SSOT — transcribing into md drifts, so the README doesn't carry the list either. To avoid duplication, none of it is written here.

Storybook is the visual review base for catalog components. `<Name>/<Name>.stories.tsx` enumerates prop variants, edge cases, and dark/light; `.storybook/preview.tsx` loads `src/styles.css`. The toolbar's `.dark` toggle verifies theme adherence. `storybook` is registered in `.claude/launch.json`, so it can also be started via preview. See the README for the launch command.

## Tech stack

- **Runtime / bundler / HMR / TS execution**: Bun (consolidated into one; no Vite / Hono / React Router)
- **Frontend**: React + TypeScript (bundled via Bun's HTML import + native JSX/TSX)
- **UI**: shadcn/ui (`base-nova` style) + `@base-ui/react` + Tailwind CSS v4
- **Backend**: `Bun.serve({ routes })` — the frontend is served via the `index.html` import (dev: on-the-fly bundle + HMR; compile: embedded in the binary). `/api/*` cohabits in the same process
- **Validation**: Zod
- **Routing (server)**: `Bun.serve` routes patterns (`/api/snapshots` handler + `/*` SPA fallback)
- **Routing (client)**: TanStack Router (code-based routes, no Vite plugin). Chosen for meeting the loader / scrollRestoration / pending, notFound, error / resident-layout requirements
- **Component catalog**: Storybook (`@storybook/react-vite` + `@tailwindcss/vite`). Catalog components become stories for visual review. The builder is Vite, but it is **a Storybook-only devDep**; the app's "no Vite" policy applies only to the app bundle (there is no Bun-native Storybook builder, so no alternative exists)

## Distribution (compile / dev-global separation)

The global tool is **a single executable** (`bun run compile` → `apps/syokan/dist/syokan`). It runs without bun/node/npm. The split "see the latest while developing / use the pinned build day-to-day" is achieved not at the CLI or server level but by **execution form** (binary vs `bun run dev`).

- **Dual-mode entry**: after compilation, cli + server + frontend live in one binary. [entry.ts](./apps/syokan/entry.ts) branches CLI / server on `SYOKAN_SERVE`. Lazy-spawn works as: "for the single binary, re-exec itself (`process.execPath`) with `SYOKAN_SERVE=1`; in dev, run `bun apps/syokan/server/index.ts`". The dev/compiled distinction is made by `isCompiledBinary()` (whether execPath's basename is `bun`). CLI args are `argv.slice(2)` in both modes (compiled builds also put the embedded entry in argv[1]).
- **The frontend is a static `import index from "../index.html"`**. Dev gets an on-the-fly bundle + HMR; at compile time Bun bundles the frontend and embeds it in the binary (the same static import serves both).
- **tailwind / bun-plugin-tailwind are devDeps**. `bun build --compile` (the CLI) cannot take plugins, so `build.ts` wires them explicitly via `Bun.build({ compile, plugins:[tailwind] })` to expand CSS at compile time.
- **dev / global separation**: global = `5173`; dev = `5273` with the repo-local `.syokan-dev/` (gitignored). The ports differ, so the two lazy-spawned servers never collide. Persistence locations are consolidated in `src/lib/paths.ts` and split across XDG base directories by lifecycle: **settings** (keep; tracked in dotfiles) at `~/.config/syokan/settings.json`; **templates** (keep; user data) at `~/.local/share/syokan/templates/`; **snapshots + runtime pid/port + logs** (machine-local; survive restarts but need no backup) at `~/.local/state/syokan/`. Everything used to be consolidated under config, but machine-local data mixed into the dotfiles-tracked tree (`~/.config`) invited accidentally committing it to git, so they were separated (respecting `XDG_{CONFIG,DATA,STATE}_HOME`). Snapshots go in state, not cache: cache's contract is "a third party may purge without notice", but syokan does not regenerate snapshots automatically (the producer must re-post), so losing them mid-use is unrecoverable. Location overrides carry no bespoke `SYOKAN_*` envs — they are consolidated on `XDG_*_HOME` alone. In dev, the `dev` script in `package.json` points `XDG_{CONFIG,DATA,STATE}_HOME` at `$PWD/.syokan-dev/{config,data,state}` so global settings stay clean. XDG envs affect the whole process, so they are scoped via `env` to the server process (bun) only, to avoid dragging in other pipeline tools like `portless`. To check renderer changes against a local snapshot, post to the dev server: `SYOKAN_BASE_URL=http://localhost:5273 bun apps/syokan/cli/syokan.ts snapshot.json` (bare `syokan` always talks to the global binary = 5173).
- Gatekeeper may block unsigned binaries on macOS. Local builds run as-is, but if a distributed/copied binary is rejected: `codesign --sign - apps/syokan/dist/syokan`.
- **Distribution**: `bun run compile:all` (= `build.ts --release`) cross-compiles each OS/arch and emits `apps/syokan/dist/syokan-<os>-<arch>` (names in a form mise's `github` backend can use to detect OS/arch). Upload to a GitHub Release and install with `mise use -g github:wwwyo/syokan@latest`. Cross-compilation downloads the target bun runtime each time.

## Known pitfalls

### Catalog `Code` / `Diff` collapse in dev (StrictMode)

`@pierre/diffs`' `File` (the catalog's `Code` / `Diff`, plus the code fences of `MarkdownDoc`, which delegates to `Code`) **collapses to height 0 on first render in `bun run dev` (React StrictMode) when the grammar is cold**. Easy to hit inside tabs or on client transitions (the home "usage" tab is deterministic; ViewPage is intermittent).

- **Cause**: on a cold first render, File emits an empty placeholder (height 0) and swaps in the body via a re-render callback when async highlighting completes. Under StrictMode's mount→unmount→remount, that callback lands on the old instance, already `cleanUp`'d (`enabled=false`) at unmount, becoming a no-op — so it stays collapsed.
- **Dev-only impact**. Warm (grammar cached) renders and production builds (StrictMode disabled) render fine. `disableWorkerPool` / delayed mount / removing the ResizeObserver patch / changing the default tab all fail (the core is async callback × lifecycle).
- **Policy**: for static code fragments that need no highlighting, use `components/CodeSnippet` (a bare `<pre>`; independent of initial measurement, never collapses). Docs that need highlighting stay on catalog `Code` (accept the dev-time appearance; it renders in production). Details in the comment in `src/catalogs/Code/index.tsx`.
- **Upstream**: a robustness bug on pierre's side — after a StrictMode remount, the async highlight completion callback is not re-attached to the new instance. Candidate for an upstream issue.

### Bun (macOS) `fs.watch`: watching a parent directory does not fire on content changes inside it

Hit while implementing `FileDoc`'s change watching (`server/fileSource.ts`).

- **The pitfall**: a "write temp → rename" save (editors' common atomic save) swaps the target file's inode, so a naive `fs.watch(path)` loses track of changes after the swap. The textbook fix is "watch the parent directory and filter by basename", but on **Bun (macOS), `fs.watch(dir)` does not fire on content changes of files inside it** — verified on a real machine (dir watch is unusable).
- **Policy**: watch the file itself; on a `rename` event (the signal for inode swap/deletion), re-arm a watch on the same path. If the replacement hasn't appeared yet, retry with a cap. This follows "rename save → subsequent in-place writes".
- **Remaining limit**: if a file is deleted and re-created at the same path only after a while, live updates stop once the re-arm retry cap is exceeded (the view shows not_found via GET). Accepted for MVP. Details in `.agent/prd/file-source-sync/decision.log` #7.

## Communication policy

- Docs and product copy are English-first (Japanese versions live in `*.ja.md`, e.g. `README.ja.md`). Use "syokan" as a bare transitive verb in both languages — EN "syokan your notes", JA 「今日の RSS を syokan」 — never "do syokan" / 「syokan する」; "syokan" stands on its own
- No flattery. Point out problems and risks bluntly
- Write comments only to explain "why"
- Uphold the "no data persistence" principle. When persistence becomes tempting, think about a promotion path to a separate persistence layer

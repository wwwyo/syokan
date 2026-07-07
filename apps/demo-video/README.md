# @syokan/demo-video

The README / X demo video, built with [Remotion](https://www.remotion.dev/). This package **is** the reproducible shooting script (PRD US-003): the storyline, the request text, the fixture data, and every animation live in code, so re-shooting after a product change is `bun run render`.

## Storyline (29s, 1920x1080, 30fps, English, dark)

| Scene | Time | What happens |
|---|---|---|
| Terminal | 0:00–0:10.7 | A Claude Code session. The user types "Show my PR review queue in syokan". Claude fetches reviews, then speaks the incantation: a snapshot envelope (JSON tree) streams by, `POST /api/snapshots` returns `201`, a view URL appears. |
| Browser | 0:10–0:24 | The browser materializes over the terminal: the syokan shell (sidebar + view header) and the PR review queue view summon in. The first PR card carries a real `Diff` (with an inline review comment) and a role-colored dependency `Graph`; the camera scrolls the view top-to-bottom so the rich catalog components read at a glance, landing on the remaining cards. |
| End card | 0:23.7–0:29 | The `{ ✦ }` logo traces in (the product's summon animation), wordmark, tagline, install command, repo URL. |

## Where things live

- [src/fixture.ts](./src/fixture.ts) — the demo data (request text, PR list, envelope lines, install command). Synthetic but plausible; no real third-party info.
- [src/theme.ts](./src/theme.ts) — brand tokens mirrored from `apps/syokan/src/styles.css` (dark) + the timeline. If the product's look changes, update this file.
- [src/scenes/](./src/scenes/) — one file per scene.

## Re-shooting

```bash
bun run studio          # preview / tweak
bun run render          # HQ master → demo-master.mp4 (committed; use for X)
bun run render:readme   # smaller cut → demo.mp4 (committed; linked from the root README)
```

Both mp4s are committed at this package root (they are the same 30s cut at two encodes: `demo.mp4` ~4 MB crf 26, `demo-master.mp4` ~9 MB crf 17). The root `README.md` links to `apps/demo-video/demo.mp4`; GitHub's blob page renders an inline `<video>` player, so a click on the link plays it. Each render command overwrites its file in place, so re-shooting is: tweak → `bun run render` / `render:readme` → commit the updated mp4s.

> This is a click-through link, not an autoplaying inline embed. An inline embed would instead need a user-attachments URL (drag the mp4 into a GitHub comment box) — deliberately not used here so the asset stays version-controlled and re-shootable.

For X: post `demo-master.mp4` (the HQ encode) directly; put the repo URL and install command in the post text.

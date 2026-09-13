# Risk / status panels

Guidance for composing any panel whose verdict a reader trusts without re-checking it — a PR risk panel, a deploy status board, an incident dashboard. This is not a review methodology; detection methodology is the caller's job. The panel structure is not fixed: pick the aspects below that apply to your data, order them for the reader, and skip the rest. For a minimal working shape, see [examples.md](examples.md) Example 5. Do not transcribe props from here — `syokan catalog` is the SSOT.

## Principles

**No false green.** A cell reading "None" or "OK" needs a `Probe` with a measured `result`, or a `Text` naming the verification method. "Unknown" is a separate state from "verified none" — never merge them.

**Severity and confidence are separate axes.** Keep severity as measured; put confidence in the `Badge` text instead ("High (suspected)", not a demotion to Medium).

**The reader has zero prior context.** Every High finding explains why it matters from first principles in a `Text`. `Diff.comments` supplement that `Text`, never replace it.

**Working memory is tiny.** Show only what changes the decision; fold the rest into `Collapsible` instead of deleting it. No emoji, no decorative separators.

## Aspects and how to express them

| Aspect | Include when | Express as | Must-have |
| --- | --- | --- | --- |
| Architecture overview of the changed area | changes span 2+ modules, or the reader has not touched this code recently | `Graph` (nodes = modules/files, `groups` for module boundaries, `sub` for a one-line change note, `role: changed` for touched-but-clean, `hotspot` + `href:"#<finding id>"` where findings concentrate, `added`/`removed` for new/gone, `direction:"LR"` when the graph is wide), first thing after the heading | caption states the conclusion ("changes concentrate in routes + store"), not a label |
| Verdict | always | `Badge` + one `Text` in a horizontal `Stack` | confidence qualifier in the Badge text |
| Counts | 3+ findings | horizontal `Stack` of `Stat` | separate "None (verified)" and "Unknown" stats |
| Cockpit (finding index) | 2+ findings | `Table`; one column is a `Link` with `href:"#<id>"` to the finding | cells are strings or inline nodes (`Text`/`Link`/`Badge`/`Time`), never markdown |
| Finding detail | per finding | `Heading` (level 2 or 3) carrying the `id`, followed by the body nodes in the same `Stack`; `Card` only when findings must read as separate units side by side | High findings carry a why-it-matters `Text` |
| Shape change (type / interface / dependency) | the shape of a public model, API, or dependency graph changed | `Diff` cut down to the definition, or two `Graph`s side by side in a horizontal `Stack` for before/after | `Graph` caption is the conclusion sentence; `Diff.patch` is the definition only, not the whole file |
| Literal values (new schema, auth branch) | the reader must see the exact text | `Code` with `filename` | — |
| Evidence / detection method | per finding | `Collapsible` (`defaultOpen:false`) holding `Code` (command) + muted `Text` (result) | has an `id` |
| "No findings" claims | whenever the panel says something is clean | `Probe` with `check` + measured `result` (run `POST /api/probes/run`), or `Text` naming the method when no check kind fits | has an `id`; on public shares set `shareVisible:true` if the args may be shown |
| Unknown / not traced | anything you could not verify | `Heading` "Unknown — …" + `Text` with why it could not be traced and where a human should look | never rendered as green / None |
| Panel vocabulary | panel-specific terms exist | small `Table` near the top | general terms excluded |
| Complete list behind a summary | the panel summarizes a set (files, hosts, alerts) | `Collapsible` holding a `Code` block with the full list | — |
| Reader progress | the reader will return to the panel | `Checklist` with `id`; `children[i]` is one node (wrap several in a `Stack`) holding the detail for `items[i]` | — |
| Comments / discussion | there are review comments | `Stack` of `Text`, or `Diff.comments` on the relevant hunk | — |

## Cross-cutting rules

- Cross-references are `Link` with `href:"#<id>"`, never "→ §N" prose.
- Prefer `Graph` over `Mermaid` for a plain node/edge sketch: `Mermaid` can fail to parse, `Graph` cannot. `Graph` `role` is meaning only — color/stroke are renderer-fixed. It pans and zooms, so 15+ nodes stay legible instead of shrinking to fit.
- There is no `TagFilter` node and no node-level `tags` field. Do not carry them over from older templates.

## Before posting

Check three things a schema validator cannot catch: every "None / OK" is backed by a `Probe` result or a stated verification method, and anything unverified is shown as Unknown instead. Severity is not downgraded for low confidence. Each High finding is readable by someone with zero context.

`jq empty` checks syntax only — the real validation is `syokan catalog` for props and an actual post (the server returns 400 with the offending path). Once a composition earns reuse across more than one panel, save it with `syokan templates add` (see SKILL.md "Templates for reproducibility").

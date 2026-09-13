# Risk / status panels

Guidance for composing any panel whose verdict a reader trusts without re-checking it — a PR risk panel, a deploy status board, an incident dashboard. This is not a review methodology; detection methodology is the caller's job. The panel structure is not fixed: pick the aspects below that apply to your data and skip the rest. What is fixed is the direction of the reading order — the reader must be given enough to understand the change before the panel asks them to accept a judgment about it (see "Reading order"). For a minimal working shape, see [examples.md](examples.md) Example 5. Do not transcribe props from here — `syokan catalog` is the SSOT.

## Principles

**No false green.** A cell reading "None" or "OK" needs a `Probe` with a measured `result`, or a `Text` naming the verification method. "Unknown" is a separate state from "verified none" — never merge them.

**Severity and confidence are separate axes.** Keep severity as measured; put confidence in the `Badge` text instead ("High (suspected)", not a demotion to Medium).

**The reader has zero prior context.** Every High finding explains why it matters from first principles in a `Text`. `Diff.comments` supplement that `Text`, never replace it.

**Working memory is tiny.** Show only what changes the decision; fold the rest into `Collapsible` instead of deleting it. No emoji, no decorative separators.

## Reading order: understanding before judgment

A reviewer cannot judge risk in code they do not yet understand, and a verdict shown first anchors everything read afterwards into "confirming the verdict". So the panel pays down comprehension debt first and asks for judgment last. Default order (drop a step when it has nothing to say; do not move a later step ahead of an earlier one):

1. **Identification** — what am I looking at (repo, target, state).
2. **Context** — the problem the change exists to solve, the constraint that shaped it, the alternative that was rejected. Two or three sentences in a `Text`; no implementation, no verdict.
3. **Map of the change** — the architecture overview `Graph`, and, when a public API / type / schema changed, its `Diff` cut to the definition. Public contracts come before internals: they are where blast radius lives.
4. **Reading guide** — the author's tour: which files to read first (the ones carrying the logic), which tests state the intended behavior, and why that order. A short numbered `Markdown` list with `Link`s. This is the step most panels skip; it is the one that turns a diff into something a reader can follow.
5. **Risk signals** — the concrete facts a reviewer weighs: public-contract changes, schema / migration, auth or security surface, hot paths, new dependencies, size, missing tests, reversibility. State each as a fact with its evidence, not yet as a score.
6. **Verdict and counts** — only now: the `Badge` + `Text` verdict, and the severity counts if there are enough findings to count. Placed here they summarize what the reader has just understood instead of pre-empting it.
7. **Findings** — cockpit `Table`, then each finding's detail, probes for verified-none claims, Unknowns, the complete lists, reader progress.

Sources this order is drawn from: Google's CL-description and reviewer-navigation guides (why in the description; read the main files and the tests first), ADR structure (context → decision → consequences), CodeTour (author-written reading order), review-ordering studies showing file presentation order changes what reviewers find, and risk-based review checklists (blast radius, contracts, schema, security, reversibility).

## Aspects and how to express them

| Aspect | Include when | Express as | Must-have |
| --- | --- | --- | --- |
| Identification (what am I looking at) | always | horizontal `Stack` of `Badge`s (repo / branch as `outline`, state such as CI or deploy as `success` / `destructive`, size as `secondary`) plus a `Link` to the source | never a single muted `Text` line — the reader must be able to tell repo, target, and status at a glance |
| Context (why the change exists) | always | `Heading` "Why" + one `Text`: the problem, the constraint, the rejected alternative | no implementation detail, no verdict; if a design doc exists, `Link` it |
| Architecture overview of the changed area | changes span 2+ modules, or the reader has not touched this code recently | `Graph` (nodes = modules/files, `groups` for module boundaries, `sub` for a one-line change note, `role: changed` for touched-but-clean, `hotspot` + `href:"#<finding id>"` where findings concentrate, `added`/`removed` for new/gone, `direction:"LR"` when the graph is wide), introduced by a `Heading` "What changed, where" | caption states the conclusion ("changes concentrate in routes + store"), not a label |
| Reading guide (author's tour) | the reader will open the diff | `Heading` "How to read this" + numbered `Markdown` list: main files first, then the tests that state intended behavior, then the rest; one clause per item saying why it is in that position | `Link`s to files or `#id`s; never "see the diff" |
| Risk signals | always, before the verdict | `Table` with columns Signal / Present? / Evidence, rows for public-contract change, schema or migration, auth / security surface, hot path, new dependency, size, test coverage, reversibility | each row is a fact with evidence (`Link` or `Probe`), not a score; "not present" rows stay visible so absence is a checked claim |
| Verdict | always, after the risk signals | `Heading` "Verdict", then a `Badge` (`variant` by severity: `success` / `warning` / `destructive`) and a `Text` stacked vertically | confidence qualifier in the Badge text; the `Text` says what the reader has to decide, not a restatement of the chip |
| Counts | 3+ findings, directly under the verdict | lead `Text` naming what is counted ("Findings by severity"), then a horizontal `Stack` of `Stat` whose labels are self-describing ("High findings", "Verified none") | `Stat.tone` maps severity (High=danger, Med=warning, None (verified)=success, Unknown untoned); separate "None (verified)" and "Unknown" stats |
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
- A horizontal `Stack` of chips or `Stat`s is never bare: a `Heading` or lead `Text` above it says what the row is. A row of numbers or badges with no referent is the most common "what is this" complaint.
- Color is meaning: `Badge.variant` and `Stat.tone` carry the verdict; do not reach for muted `Text` where a colored chip says it faster, and do not color decoratively.

## Before posting

Check four things a schema validator cannot catch: the verdict and counts come after context, map, reading guide, and risk signals, never before them. every "None / OK" is backed by a `Probe` result or a stated verification method, and anything unverified is shown as Unknown instead. Severity is not downgraded for low confidence. Each High finding is readable by someone with zero context.

`jq empty` checks syntax only — the real validation is `syokan catalog` for props and an actual post (the server returns 400 with the offending path). Once a composition earns reuse across more than one panel, save it with `syokan templates add` (see SKILL.md "Templates for reproducibility").

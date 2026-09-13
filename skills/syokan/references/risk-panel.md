# Risk / status panels

Guidance for composing any panel whose verdict a reader trusts without re-checking it — a PR risk panel, a deploy status board, an incident dashboard. This is not a review methodology; detection methodology is the caller's job. The panel structure is not fixed: pick the aspects below that apply to your data and skip the rest. What is fixed is the direction of the reading order: the PR description first, in its own section order, then the review layer (see "Reading order"). For a minimal working shape, see [examples.md](examples.md) Example 5. Do not transcribe props from here — `syokan catalog` is the SSOT.

## Principles

**No false green.** A cell reading "None" or "OK" needs a `Probe` with a measured `result`, or a `Text` naming the verification method. "Unknown" is a separate state from "verified none" — never merge them.

**Severity and confidence are separate axes.** Keep severity as measured; put confidence in the `Badge` text instead ("High (suspected)", not a demotion to Medium).

**The reader has zero prior context.** Every High finding explains why it matters from first principles in a `Text`. `Diff.comments` supplement that `Text`, never replace it.

**Self-similar at every depth.** The panel has the same shape at every zoom level, so the reader can stop at any depth and still hold a complete, consistent picture. The title is the whole panel in one line: `<subject>: <what changed>`, short enough to stay on one line; the verdict is the first Badge under it, not part of the title. Each section heading is `<section name>: <its conclusion>` ("Issue: the old Graph could not draw an overview"), never a label alone ("Background") and never a conclusion alone. The conclusion is one clause with no sentence-final punctuation; a heading that needs a second sentence is carrying body text, so move the second sentence to the first line of the body. Description sections use the PR section names (Background, Issue, What, Testing, Summary); review-layer sections use one short word in the reader's language (risks, verdict, findings, unconfirmed, progress). No dashes as separators. The PR section names are the reader's own vocabulary from writing PRs, which is why they may appear where node names may not. Each finding repeats the panel's own order — what and where → why it matters → evidence → what to decide — and its heading is that finding in one line (`<severity> — <what> in <where>`). A cockpit `Table` row is the finding's heading split into cells. If a heading could be moved to a different body without becoming wrong, it is a label; rewrite it as the conclusion.

**Working memory is tiny.** Show only what changes the decision; fold the rest into `Collapsible` instead of deleting it. No emoji, no decorative separators.

## Reading order: the PR description, rendered rich, then the review layer

A review panel is not a second document. Its first half is the PR description's sections expressed with nodes instead of markdown, with two adjustments: Background is split into Background (pre-change state, terms) and Issue (the problem), and both come before What, so the reader holds the state and the terms before the diagram uses them; its second half is the review layer that a PR description does not carry. If a PR description exists, build the first half from it — same facts, same order — and do not restate them differently. Understanding comes before judgment: the review layer is placed after the description, never before it, because a verdict shown first anchors everything read afterwards into confirming it.

| PR section | Panel expression | What it buys over markdown |
| --- | --- | --- |
| Title | `Heading` level 1 = `<subject>: <what changed>`, `href` to the PR; a `Badge` row whose first chip is the verdict, then target, CI / deploy state, size; then the Overview list | verdict and state as color, the whole panel in five lines before any section |
| Overview (TL;DR) | right under the title row: a `Markdown` list of three to five lines, one per section below, each that section's conclusion; the reader who stops here has the whole panel at one zoom level below the title | the middle level of the self-similar structure; nothing here that a section below does not expand |
| Background | "Before this change": a `Table` item / before / after for the touched code, a `Markdown` list for the pre-change state of documents, a `Table` term / meaning for every term used later, at the depth this reader lacks | terms defined before use; no forward references; never prose with slash-separated lists |
| Issue | the problem the change exists to solve, the constraint that shaped it, the alternative that was rejected; two or three sentences, no implementation, no verdict | why before what |
| What | the structure diagram as `Graph` (modules / files, `groups` for boundaries, `sub` for the one-line change, `hotspot` + `href` where findings are), plus the public-contract change as `Code` or `Diff` cut to the definition | a diagram the reader can pan, hover, and click into findings |
| Screenshots / Videos | `Code` / `Diff` for textual before-after; images are not a catalog node, so `Link` to them | — |
| Testing | `Probe` per verified claim with the measured `result`; `Text` naming the method where no check kind fits | claims the reader can re-run instead of trust |
| Summary | the reading guide: numbered `Markdown` list of change chunks in the order to read them, main logic first, then the tests that state intended behavior, with `Link`s | tells the reader where to start |
| (review layer) Risk signals | `Table` Signal / Present? / Evidence; "not present" rows stay visible | absence as a checked claim |
| (review layer) Verdict and counts | `Heading` "Verdict", `Badge` by severity, `Text` saying what to decide; then a lead `Text` and toned `Stat`s | severity as color, after the reader can judge it |
| (review layer) Findings | cockpit `Table` → each finding (`Heading` with `id`: what and where → why → `Link` to the place → evidence → decide) → Unknowns → complete lists → reader `Checklist` | jump targets, folds, progress that survives reload |

Drop a row when it has nothing to say; do not move a review-layer row above the description. Sources: Google's CL-description and reviewer-navigation guides, ADR structure (context → decision → consequences), CodeTour, review-ordering studies, risk-based review checklists.

## Aspects and how to express them

| Aspect | Include when | Express as | Must-have |
| --- | --- | --- | --- |
| Identification (what am I looking at) | always | `Heading` level 1 as the one-line panel (`<subject> — <what changed> · <verdict>`, `href` to the source), then a horizontal `Stack` of `Badge`s: only facts that change what the reader does next (target as `outline`, CI / deploy state as `success` / `destructive`, size as `secondary`) | never a single muted `Text` line; no chip the reader would see anyway on the linked page (draft, author), and no second `Link` to the source the heading already links |
| Background (what the reader must already hold) | always; depth set by the reader | `Heading` "Before this change" + `Text` per item: the pre-change state of the touched code, one line per term used later (node type, library, rule) | nothing the reader already knows, nothing unused later; a term that first appears in Why or a finding is a defect |
| Why (the change exists) | always | `Heading` "Why" + one `Text`: the problem, the constraint, the rejected alternative | no implementation detail, no verdict; if a design doc exists, `Link` it |
| Architecture overview of the changed area | changes span 2+ modules, or the reader has not touched this code recently | `Graph` (nodes = modules/files, `groups` for module boundaries, `sub` for a one-line change note, `role: changed` for touched-but-clean, `hotspot` + `href:"#<finding id>"` where findings concentrate, `added`/`removed` for new/gone, `direction:"LR"` when the graph is wide), introduced by a `Heading` "What changed, where" | caption states the conclusion ("changes concentrate in routes + store"), not a label |
| Reading guide (author's tour) | the reader will open the diff | `Heading` "How to read this" + numbered `Markdown` list: main files first, then the tests that state intended behavior, then the rest; one clause per item saying why it is in that position | `Link`s to files or `#id`s; never "see the diff" |
| Risk signals | always, before the verdict | `Table` with columns Signal / Present? / Evidence, rows for public-contract change, schema or migration, auth / security surface, hot path, new dependency, size, test coverage, reversibility | each row is a fact with evidence (`Link` or `Probe`), not a score; "not present" rows stay visible so absence is a checked claim |
| Verdict | always, after the risk signals | `Heading` "Verdict", then a `Badge` (`variant` by severity: `success` / `warning` / `destructive`) and a `Text` stacked vertically | confidence qualifier in the Badge text; the `Text` says what the reader has to decide, not a restatement of the chip |
| Counts | 3+ findings, directly under the verdict | lead `Text` naming what is counted ("Findings by severity"), then a horizontal `Stack` of `Stat` whose labels are self-describing ("High findings", "Verified none") | `Stat.tone` maps severity (High=danger, Med=warning, None (verified)=success, Unknown untoned); separate "None (verified)" and "Unknown" stats |
| Cockpit (finding index) | 2+ findings | `Table`; one column is a `Link` with `href:"#<id>"` to the finding | cells are strings or inline nodes (`Text`/`Link`/`Badge`/`Time`), never markdown |
| Finding detail | per finding | `Heading` (level 2 or 3) carrying the `id`, text `<severity> — <what> in <where>`, then in order: `Text` why it matters, `Link` to where it lives, `Collapsible` evidence, `Text` "Decide: …"; `Card` only when findings must read as separate units side by side | the same order as the panel itself; High findings explain why from first principles |
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
- The panel's own vocabulary stays out of the reader's text. Node names (`Probe`, `Stat`, `Badge`), role names (`hotspot`), and severity codes (High / Med / None / Unknown) are for the producer; the reader sees the claim in their own language ("verified clean, re-checkable here", "could not confirm"). A file or type that the change itself touches is the subject and may be named.
- Each section is a `Heading` followed by one `Stack` holding the section body, and each finding inside it is again `Heading` + `Stack`. `Stack` spacing tightens with nesting depth, so this is what makes section gaps wide and paragraph gaps narrow; a flat root with every paragraph as a direct child spaces paragraphs like sections.
- Parallel facts are never a sentence with slashes or commas: three or more items of the same kind go in a `Markdown` list, and items with two or more attributes (before / after, term / meaning, file / role) go in a `Table`. Prose is for one line of reasoning at a time.
- Color is meaning: `Badge.variant` and `Stat.tone` carry the verdict; do not reach for muted `Text` where a colored chip says it faster, and do not color decoratively.

## Before posting

Check five things a schema validator cannot catch: the title alone states subject and change (the verdict goes in the first Badge, not the title); no heading contains a full stop; every heading is a conclusion that would be wrong above a different body; no term is used before Background introduces it; the review layer (risk signals, verdict, counts, findings) comes after the description sections, never before them. every "None / OK" is backed by a `Probe` result or a stated verification method, and anything unverified is shown as Unknown instead. Severity is not downgraded for low confidence. Each High finding is readable by someone with zero context.

`jq empty` checks syntax only — the real validation is `syokan catalog` for props and an actual post (the server returns 400 with the offending path). Once a composition earns reuse across more than one panel, save it with `syokan templates add` (see SKILL.md "Templates for reproducibility").

# Risk / status panels

View-composition guidance for any panel that renders a verdict a reader will trust without re-checking it themselves — a PR risk panel, a build/deploy status board, an incident dashboard. This is about how to *compose the panel*, not how to review a PR; detection methodology (what to grep, how to classify severity) is the caller's job and lives outside this skill.

## Principles

**No false green.** A cell that reads "verified none" or "OK" must carry a `Probe` (with the `result` you measured) or, when no `Probe.check` kind fits, a `Text` naming the verification method. "Not traced / unknown" is a distinct state from "checked and clean" — never collapse it into OK. Make the distinction visible in the `Stat` labels (`"None (verified)"` vs `"Unknown"`, not one combined count) and in `Badge` text (don't silently drop an unknown into a green badge).

**Severity and confidence are separate axes.** Don't downgrade severity because you're unsure — render confidence in the `Badge` text instead (`"High (suspected)"`, not a demotion to Medium). A high-impact finding you can't fully confirm stays High with a confidence qualifier, not Med.

**The reader has zero prior context.** Define panel-specific vocabulary in a small `Table` near the top (skip general terms). Every High finding carries a `Text` explaining why it matters from first principles — a professional in the domain can skip it, a first-time reader can't work without it. `Diff.comments` are a supplement to that `Text`, never a replacement for it.

**Working memory is tiny.** Write only what changes the reader's decision. Fold low-priority detail into `Collapsible` instead of deleting it — evidence, verified-clean detail, generated-file notes all belong there. Always keep one complete list (e.g. every changed file) inside a `Collapsible` `Code` block so summarizing the rest never loses coverage. No emoji, no decorative separators — severity emphasis is the `Badge`'s job, not typography's.

## Node-usage rules

These are the reusable composition rules, checked against `syokan catalog` (run it — do not trust this list over the live schema):

- Give `id` to every `Checklist` / `Collapsible` / `Probe` (their state is viewer-local and needs an anchor to survive a reload) and to any node that is a jump target.
- Cross-references are `Link` with `href:"#<id>"`, never "→ §N" prose — prose references go stale the moment a section moves.
- `Graph` for a plain node/edge before/after contrast, two side by side in a horizontal `Stack`. Write `caption` as the conclusion sentence ("6 call sites collapse to 1"), not a bare label ("Before" / "After"). Use `role` for meaning only (`hotspot` = where the problem concentrates, `added`/`removed` = new/gone, `neutral` = unrelated) — color/stroke are renderer-fixed, don't fight them.
- Reach for `Mermaid` only when branching or nested subgraphs are actually needed; a plain sketch in `Graph` can't fail to parse, `Mermaid` can.
- A shape change to a public model or interface goes in a `Diff` whose `patch` is a hand-cut unified diff of just the type definition — not the whole file, and not prose describing the change.
- Literal values (new schema, an auth branch) go in `Code` with `filename` set so the reader sees provenance at a glance.
- `Table` cells are plain strings or one of the inline nodes (`Text`/`Link`/`Badge`/`Time`) — never markdown syntax; it renders literally, not parsed.
- `Checklist` items double as reviewer progress when `children[i]` holds the foldable detail for `items[i]` (why to check, a jump `Link`) — checking an item folds it to one line. Each `children[i]` is one node, not an array; wrap several in a `Stack`.

There is no `TagFilter` node and node-level `tags` are not a real field in this catalog (`syokan catalog` has neither) — don't carry either over from an older template. A cockpit `Table` stays fully visible; it isn't filterable.

## Section skeleton

A bare catalog tree (no envelope — write it to a file and `syokan <path>` for a live-synced `TreeDoc`, or wrap it in `{"root": ...}` to POST once). One instance of each pattern; duplicate the finding-`Card` block per finding and drop sections with no signal. Fill in every `{{PLACEHOLDER}}`, validate with `jq empty`, and eyeball props against `syokan catalog` before shipping — do not transcribe props from this file, it drifts.

```json
{
  "type": "Stack",
  "props": {},
  "children": [
    { "type": "Heading", "props": { "text": "{{TITLE}}", "level": 1, "href": "{{PR_URL}}" } },
    { "type": "Text", "props": { "body": "{{REPO}} · branch {{BRANCH}} · {{DIFFSTAT}}", "muted": true } },
    {
      "type": "Stack",
      "props": { "direction": "horizontal" },
      "children": [
        { "type": "Badge", "props": { "text": "{{VERDICT_LABEL}}", "variant": "{{VERDICT_VARIANT}}" } },
        { "type": "Text", "props": { "body": "{{VERDICT_SUMMARY}}" } }
      ]
    },
    {
      "type": "Stack",
      "props": { "direction": "horizontal" },
      "children": [
        { "type": "Stat", "props": { "label": "High", "value": "{{N_HIGH}}" } },
        { "type": "Stat", "props": { "label": "Med", "value": "{{N_MED}}" } },
        { "type": "Stat", "props": { "label": "None (verified)", "value": "{{N_NONE}}" } },
        { "type": "Stat", "props": { "label": "Unknown", "value": "{{N_UNKNOWN}}" } }
      ]
    },
    {
      "type": "Table",
      "props": {
        "columns": ["Aspect", "Verdict", "What & why", "Detail"],
        "rows": [
          [
            "{{ASPECT}}",
            { "type": "Badge", "props": { "text": "{{VERDICT}}", "variant": "{{VARIANT}}" } },
            "{{ONE_LINE_WHY}}",
            { "type": "Link", "props": { "href": "#{{FINDING_ID}}", "text": "details" } }
          ]
        ]
      }
    },
    {
      "type": "Checklist",
      "id": "priority-checklist",
      "props": { "items": [ { "label": "{{IF_SHORT_ON_TIME_ITEM}}" } ] },
      "children": [ { "type": "Link", "props": { "href": "#{{FINDING_ID}}", "text": "jump" } } ]
    },
    {
      "type": "Table",
      "props": {
        "columns": ["File", "Why look", "Detail"],
        "rows": [ [ "{{PATH}}", "{{WHY}}", { "type": "Link", "props": { "href": "#{{FINDING_ID}}", "text": "details" } } ] ]
      }
    },
    {
      "type": "Collapsible",
      "id": "files-full-list",
      "props": { "summary": "All changed files ({{N}})", "defaultOpen": false },
      "children": [ { "type": "Code", "props": { "lang": "text", "code": "{{PATH_LIST}}" } } ]
    },
    {
      "type": "Card",
      "id": "{{FINDING_ID}}",
      "props": { "title": "{{FINDING_TITLE}}" },
      "children": [
        {
          "type": "Stack",
          "props": {},
          "children": [
            { "type": "Heading", "props": { "text": "{{FINDING_HEADLINE}}", "level": 3 } },
            { "type": "Text", "props": { "body": "{{FINDING_SUMMARY}}" } },
            {
              "type": "Stack",
              "props": { "direction": "horizontal" },
              "children": [
                { "type": "Graph", "props": { "caption": "{{BEFORE_CONCLUSION}}", "nodes": [ { "id": "n1", "label": "{{NODE}}", "role": "neutral" }, { "id": "hot", "label": "{{HOTSPOT}}", "role": "hotspot" } ], "edges": [ { "from": "n1", "to": "hot" } ] } },
                { "type": "Graph", "props": { "caption": "{{AFTER_CONCLUSION}}", "nodes": [ { "id": "n1", "label": "{{NODE}}", "role": "neutral" }, { "id": "new1", "label": "{{NEW}}", "role": "added" } ], "edges": [ { "from": "n1", "to": "new1", "role": "added" } ] } }
              ]
            },
            { "type": "Diff", "props": { "diffStyle": "unified", "patch": "{{SHAPE_DIFF_PATCH}}" } },
            { "type": "Text", "props": { "body": "Why this matters (from first principles): {{WHY_FROM_PREMISE}}" } },
            {
              "type": "Collapsible",
              "id": "{{FINDING_ID}}-evidence",
              "props": { "summary": "Detection method", "defaultOpen": false },
              "children": [
                { "type": "Code", "props": { "lang": "bash", "code": "{{DETECTION_COMMAND}}" } },
                { "type": "Text", "props": { "body": "{{DETECTION_RESULT}}", "muted": true } }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "Probe",
      "id": "{{NONE_ID}}",
      "props": {
        "label": "{{NONE_CLAIM}}",
        "check": { "kind": "search_count", "path": "{{ABS_PATH}}", "pattern": "{{PATTERN}}", "expected": 0, "op": "max" },
        "result": { "status": "pass", "detail": "{{RESULT_DETAIL}}", "ranAt": "{{ISO_DATETIME}}" }
      }
    },
    {
      "type": "Card",
      "id": "unknown-note",
      "props": { "title": "Unknown — {{UNKNOWN_TITLE}}" },
      "children": [
        {
          "type": "Stack",
          "props": {},
          "children": [
            { "type": "Text", "props": { "body": "{{WHY_NOT_TRACEABLE}}" } },
            { "type": "Text", "props": { "body": "Where to look instead: {{WHERE_TO_EYEBALL}}", "muted": true } }
          ]
        }
      ]
    },
    {
      "type": "Stack",
      "id": "review-comments",
      "props": {},
      "children": [ { "type": "Text", "props": { "body": "No comments yet.", "muted": true } } ]
    }
  ]
}
```

Once a skeleton like this earns its keep across more than one panel, save it with `syokan templates add` (see SKILL.md "Templates for reproducibility") instead of rebuilding from scratch next time.

## Self-check before shipping

1. Does every "None / OK" cell carry a `Probe` with a measured `result`, or a `Text` naming the verification method? Is anything actually unconfirmed being shown as None instead of Unknown?
2. Is severity kept separate from confidence — no high-impact finding silently downgraded to Med because it's unconfirmed?
3. Can a reader with zero context follow it — is panel-specific vocabulary defined up top, does each High finding have a `Text` explaining why it matters (not just a `Diff.comment`)?
4. Does every `Checklist` / `Collapsible` / `Probe` have an `id`? Does every cross-reference use `Link href="#<id>"` instead of "→ §N" prose?
5. Do all `Graph.nodes[].id` values match the `from`/`to` used in `Graph.edges[]`?
6. Is coverage preserved — is there a `Collapsible` `Code` block with the complete list of everything summarized elsewhere (files, items)?
7. Does the tree validate — `jq empty` passes, and every `type`/prop matches `syokan catalog` exactly (no leftover `tags`, `TagFilter`, or other props that no longer exist in this catalog)?
8. Are all `{{PLACEHOLDER}}` markers gone and unused sections removed, rather than left with stale sample values?

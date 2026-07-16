# Coding Skill Governance

- Read `SKILL.md`, then only the routed reference needed for the runtime area being changed.
- Keep `references/*.md` as one-line bullets with observable rules and rationale; do not record one-off task history.
- For snapshot envelope or store behavior changes, add or update regression tests around old on-disk data and dedup responses.
- Prefer checks that exercise public behavior over tests that only prove an internal helper's shape.

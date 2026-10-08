# `hono` / `mermaid` の security update は cooldown 明けまで待つ

- Status: Accepted
- Date: 2026-08-07

`bunfig.toml` の `minimumReleaseAge = 604800` により、`hono@4.12.34` は 2026-08-10、`mermaid@11.16.1` は 2026-08-11 まで install できない（`bun install --dry-run` で実測）。**CI が赤いのは構造上のもの**で、直せる不具合ではない。急がない根拠として advisory の到達性を確認した — hono の CORS middleware ReDoS は repo 内に `cors()` が存在せず**到達不能**、mermaid は localhost 描画用途。**待っている間に `hono` の latest は 4.13.1 へ進んでいる**ので、cooldown 明けに 4.12.34 を入れても即座に minor 差がつく。`apps/syokan` と `apps/share` の3箇所を1本の PR でまとめる

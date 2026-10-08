# `goreleaser` を採用しない判断

- Status: Accepted
- Date: 2026-07-26

配布の定型化として検討したが、syokan は `bun build --compile` に Tailwind プラグインを差し込む必要があり、prebuilt builder の制約と噛み合わない。**置き換えメリットより、現行の build 正しさと smoke gate を壊すリスクが勝つ**。formula 生成は release 側の script が tap repo へ一方向 push する構成を維持した（双方向にすると運用が増える）。`TAP_GITHUB_TOKEN` は別 repo への push 権限を最小化するため fine-grained PAT + contents:write のみに絞った

# Stack の gap は「nest 深さで自動決定 + 段階指定で上書き」の二層にした

- Status: Accepted
- Date: 2026-08-09

（[#61](https://github.com/wwwyo/syokan/pull/61) merged）— 生の px を LLM に渡す案は却下し `gap: none/sm/md/lg` の段階のみ許可。catalog 全体の「JSX を書かせない」設計思想とデザイン一貫性を優先した。深さのカウント対象は `Stack` のみに限定（`Card` が挟まってもスケールがリセットされない）。あわせて**横方向 Stack が `overflow-x-auto` 無しでページごと突き抜ける**問題を修正 — 子（`Stat` の `min-w-32` や `Card` の `min-content`）が縮小限界に達すると外側 flex の overflow 制御が効かなくなるのが原因で、`Table` / `Mermaid` / `Graph` と同じくコンポーネントローカルに持たせた（共通ラッパーへの一般化は見送り）。`Checklist` / `Collapsible` は `StackDepthContext` を読んでいないので深いネストでは間隔が揃わない

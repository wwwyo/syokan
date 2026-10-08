# `anchorId`（公開アンカー）と `stateKey`（UI state 識別子）を分ける

- Status: Accepted
- Date: 2026-08-02

node の `id` が「`Link href="#..."` の飛び先」と「`Checklist` / `Collapsible` / `Probe` の localStorage キー」を兼ねていたため、「対話するノードには必ず `id` を付けろ」という運用規約が必要になっていた。**本質的な問題は state の失効条件** — state は「保存されない」だけでなく**内容が変わると hash 不一致で捨てられる**設計なので、`Checklist` の項目を 1 つ直しただけで無関係な UI state まで飛ぶ。分離すると失効条件を facet ごとに変えられる。却下したのは `item.key` を stateKey へ流用する案（`TreeDoc` 境界で namespace を切らないと衝突する）。`Collapsible` の reveal 永続化は互換挙動として残し、旧 localStorage state は捨てる方針。PRD は `syokan/.agent/prd/node-identity/prd.md`。**codex に 2 段レビューさせて 5 件の指摘が返っており未確定**（Problem の誇張・明示 `id` と見出し変更時の挙動の矛盾・reveal 永続化を Non-Goal に置いた誤り・旧 state 破棄の受入条件の弱さ・`storage` が使えない環境の前提欠落）

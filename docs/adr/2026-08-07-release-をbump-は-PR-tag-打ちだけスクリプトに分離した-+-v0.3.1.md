# release を「bump は PR / tag 打ちだけスクリプト」に分離した + v0.3.1

- Status: Accepted
- Date: 2026-08-07

（[#52](https://github.com/wwwyo/syokan/pull/52) / [#55](https://github.com/wwwyo/syokan/pull/55) / [#57](https://github.com/wwwyo/syokan/pull/57) merged）— 07-26 に自分で入れた `main-required-checks` ruleset のせいで、`bun run release` の「bump commit を main へ直 push」が **`GH013` で必ず失敗する**構造になっていた。**自動化が branch protection と噛み合わないときは、通るように protection を緩めるのではなく自動化の責務を削る** — `release.ts` から bump を外し、「現在の main がリリース可能かを検査して tag を打つ」だけに絞った（tag push は ruleset の対象外なので通る）。README / AGENTS.md の「`bun run release` だけで配布できる」も実態とずれていたので同時に直した。あわせて **既定ポートを Vite の 5173 から 5773（global）/ 5873（dev）へ分離** — 5173 を掴むと dev サーバーと衝突する。ポート値は `src/lib/port.ts` を SSOT にして server と CLI の二重定義をやめた。**旧 global バイナリは 5173 を掴んだまま残る**ので、`syokan stop` してから `mise up -g` で入れ替える

# StrictMode remount 時の `Code` / `Diff` 潰れを `onPostRender` の cleanup で根治

- Status: Accepted
- Date: 2026-07-25

（[#39](https://github.com/wwwyo/syokan/pull/39) merged）。真因は `pierre`（`<pre>` を先に DOM へ置いてから非同期に中身を流し込む設計）の `shouldRenderCode()` が完成済み code node に付く `[data-code]` を見ておらず、未完成の `<pre>` と区別できないこと。upstream の判定関数には割り込めないため、公開 option の `onPostRender` で unmount 時に未完成 `<pre>` を掃除し、remount 側が通常 render に戻れるようにした。`CodeSnippet` へ退避する案は却下し、JSON source と Home usage の両方を `pierre` に統一（表示品質と一貫性を優先し、内部 DOM 構造への依存はトレードオフとして受容）。述語単位のテストは足したが、**StrictMode remount 全体を再現する browser ベースの回帰テストは無い**（既存テスト基盤に DOM 実行環境がなく、導入コストが対象の小ささに見合わない）

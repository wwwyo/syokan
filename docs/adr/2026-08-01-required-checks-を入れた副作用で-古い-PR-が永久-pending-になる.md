# required checks を入れた副作用で、古い PR が永久 pending になる

- Status: Accepted
- Date: 2026-08-01

[#37](https://github.com/wwwyo/syokan/pull/37) が `mergeable: MERGEABLE` なのに `mergeStateStatus: BLOCKED` のまま動かなかった。原因は **`pull_request` workflow が実行時に head ブランチ側の workflow 定義を参照する**こと — 分岐点が `.github/workflows/ci.yml` 追加より前だと CI が一度も起動せず、必須チェック `test (linux)` / `test (macos)` が永久に pending になる。**コンフリクト有無と merge 可否は別問題**なので、`mergeable` だけ見ると原因を見誤る。直し方は rebase でなく **main を merge**（過去のコンフリクト解消の残骸があると rebase は再コンフリクトしやすい。docs 変更なら履歴の直線性より安全性を優先してよい）。**required checks を後から入れた repo では、分岐点がそれ以前の open PR が全部同じ状態になっている**

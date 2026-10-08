# snapshot の tab title を `<view title> | syokan` にする

- Status: Accepted
- Date: 2026-07-25

[#38](https://github.com/wwwyo/syokan/pull/38) merged。`document.title` は unmount 時に既定へ戻さないと前の view の title が残る。ただし title 変更のたびに cleanup が走る構成だと**一瞬 `syokan` に戻す無駄な書き込み**が発生するため、Copilot 指摘を受けて **set 用 effect と reset 用 effect を分けた**。実装は純関数 + hook + テストに分解し、`useDocumentTitle` の effect 全体を DOM テストで固める案は見送った（テスト基盤の導入コストに対して対象が小さすぎるので、純関数の unit test と実機確認に切り分けた）

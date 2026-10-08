# snapshot の DELETE を destroy から archive へ変え v0.5.0 を release

- Status: Accepted
- Date: 2026-09-29

（[#105](https://github.com/wwwyo/syokan/pull/105) / [#106](https://github.com/wwwyo/syokan/pull/106) merged）— [#98](https://github.com/wwwyo/syokan/pull/98) の PRD どおり「削除を不可逆にしない」設計が実装側に着地し、archived snapshot は id ごと最新1件のみ保持・`GET /:id` がそのまま返す

# view の Checklist 操作を snapshot store へ書き戻す実装が着地

- Status: Accepted
- Date: 2026-09-27

（[#97](https://github.com/wwwyo/syokan/pull/97) merged）— 08-09 に再検討していた「UI state の書き戻し」が v1 として入った。あわせて snapshot-archive の PRD 群を確定（[#96](https://github.com/wwwyo/syokan/pull/96) writeback PRD / [#98](https://github.com/wwwyo/syokan/pull/98) delete を archive に変え記録を queryable に残す / [#99](https://github.com/wwwyo/syokan/pull/99) archived-generation selector は持たない / [#101](https://github.com/wwwyo/syokan/pull/101) `GET /:id` は archived snapshot をそのまま返す・[#100](https://github.com/wwwyo/syokan/pull/100) は close して出し直し / [#102](https://github.com/wwwyo/syokan/pull/102) archive は id ごと最新1件のみ）と、[source ファイルは SSOT でない記録](https://github.com/wwwyo/syokan/pull/103)（[#103](https://github.com/wwwyo/syokan/pull/103) merged）

# darwin バイナリの不正署名を「CI 上で再署名する sign job」で直し v0.4.1 として出し直した

- Status: Accepted
- Date: 2026-09-23

（[#85](https://github.com/wwwyo/syokan/pull/85) / [#86](https://github.com/wwwyo/syokan/pull/86) merged）— 署名を直すだけの [#85](https://github.com/wwwyo/syokan/pull/85) では足りず、release workflow 側に macOS 上で再署名する job を追加する [#86](https://github.com/wwwyo/syokan/pull/86) までが修正本体。**バイナリ配布の不具合は「作り直した artifact」でなく「artifact を作る job」側を直す**。あわせて同日にスクロール復元系（[#78](https://github.com/wwwyo/syokan/pull/78) snapshot 単位の復元・[#82](https://github.com/wwwyo/syokan/pull/82) 復元キーを pathname に揃え配線ごとテスト化）と PRD 文書の追跡対象化（[#84](https://github.com/wwwyo/syokan/pull/84)）が merge された

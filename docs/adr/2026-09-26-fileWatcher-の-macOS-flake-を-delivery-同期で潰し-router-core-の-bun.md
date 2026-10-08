# fileWatcher の macOS flake を delivery 同期で潰し、router-core の bun patch bump 追従を 1 コマンド化した

- Status: Accepted
- Date: 2026-09-26

（[#93](https://github.com/wwwyo/syokan/pull/93) / [#94](https://github.com/wwwyo/syokan/pull/94) merged）— watcher テストの学び: 通知を待つための mutation 反復では、遅れて届いたイベントを後続 mutation に誤帰属しうる。通知数の基準は静穏状態になってから各段階で取る。観測仕様は「新 inode への再 attach」ではなく「置換後も path を追って通知されること」（Linux の親 dir watch では inode 単位の再 attach を検証できない）。#94 側の残課題: `bun patch <pkg>` は編集用コピー準備時に登録済み patch を再適用しうるため、準備後に lazy wrap 済みか再確認して適用済みなら変換を飛ばす、Windows の `bun.exe` 解決 — この pitfall は [#95](https://github.com/wwwyo/syokan/pull/95)（2026-09-28 merged）で coding skill へ追記済み

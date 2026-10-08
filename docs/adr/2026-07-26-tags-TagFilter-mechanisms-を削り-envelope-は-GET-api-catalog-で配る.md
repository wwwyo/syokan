# `tags` / `TagFilter` / `mechanisms` を削り、envelope は `GET /api/catalog` で配る

- Status: Accepted
- Date: 2026-07-26

[#41](https://github.com/wwwyo/syokan/pull/41) merged（0.x なので破壊的変更だが minor 扱い。1.0.0 を勝手に宣言しない）。`tags` は review パネルの絞り込みで実際に使われていたが、**利便性より実装依存の見通しの悪さと説明負荷が勝った**。`mechanisms.probe.kinds` は `items[Probe].props.check` の完全重複だったので、SSOT を濁すだけとして削除。envelope の説明を README や skill へ転記していたのをやめ、**型契約を1回の fetch で取れる形（API 側が SSOT）**へ寄せた — README から AGENTS.md へ移す案は「転記先が変わるだけで重複は解消しない」ため撤回した。ただし item union を丸ごと再展開するとレスポンスが肥大するので、不透明な schema に逃がした

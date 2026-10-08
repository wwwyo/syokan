# envelope から `metadata.source` を仕様ごと削除 + v0.2.0

- Status: Accepted
- Date: 2026-07-16

[#32](https://github.com/wwwyo/syokan/pull/32) merged。出所ラベルは view の識別子として機能が弱く、ephemeral な snapshot では「いつ召喚した view か」の方が識別に直結する。`metadata`（唯一のフィールドが `source`）ごと envelope から除いて仕様を縮め、sidebar は `createdAt` 表示へ。schema は strict なので `metadata` 入り POST は `400 validation_failed`

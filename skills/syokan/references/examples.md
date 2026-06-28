# envelope の例

実際に POST できる完成形の envelope を示す。組み合わせの参考。
type と props の正確な定義は `syokan catalog` が SSOT（下の DiffComment 表も含め、最終的にはそちらで確認する）。
いずれも `id` と `createdAt` を含まない（server が採番する）。

## DiffComment の形

`Diff` の `comments[]` の各要素は次の形を取る。

| key | 型 | 必須 | 備考 |
| --- | --- | --- | --- |
| `side` | `"old" \| "new"` | 必須 | 旧側（削除行）か新側（追加行）か |
| `line` | 正の整数 | 必須 | その side の gutter 行番号。patch に含まれる行のみ |
| `body` | string | 必須 | コメント本文 |
| `file` | 非空 string | 任意 | 複数ファイル patch で対象を指定する。新ファイル名（rename なら旧名も可）。単一ファイルなら省略できる |
| `author` | string | 任意 | コメント主 |

## 例 1: RSS や記事の一覧

見出しリンク、取得時刻、要約を Card で積む。
`source` に `url` を相乗りさせている。

```json
{
  "title": "Today's RSS",
  "metadata": { "source": { "label": "daily-rss", "fetchedAt": "2026-06-28T08:00:00Z" } },
  "idempotencyKey": "daily-rss-2026-06-28",
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      { "type": "Heading", "props": { "text": "2026-06-28 のフィード", "level": 1 } },
      {
        "type": "Card",
        "props": {},
        "children": [
          { "type": "Heading", "props": { "text": "記事タイトル", "level": 3, "href": "https://example.com/article" } },
          { "type": "Time", "props": { "datetime": "2026-06-28T06:30:00Z", "muted": true } },
          { "type": "Text", "props": { "body": "記事の要約をここに置く。", "clamp": true } }
        ]
      }
    ]
  }
}
```

## 例 2: PR review（diff と行コメント）

`Badge` で状態を示し、`Diff` に unified patch と行コメントを載せる。

```json
{
  "title": "review: feature branch",
  "metadata": { "source": { "label": "gh-review", "url": "https://example.com/owner/repo/pull/42" } },
  "root": {
    "type": "Stack",
    "props": { "direction": "vertical" },
    "children": [
      {
        "type": "Stack",
        "props": { "direction": "horizontal" },
        "children": [
          { "type": "Heading", "props": { "text": "#42 タイトル", "level": 2 } },
          { "type": "Badge", "props": { "text": "changes requested", "variant": "destructive" } }
        ]
      },
      {
        "type": "Diff",
        "props": {
          "diffStyle": "unified",
          "patch": "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,4 @@\n const a = 1;\n+const b = 2;\n export { a };\n",
          "comments": [
            { "side": "new", "line": 2, "body": "この値はどこから来る？定数化したい", "author": "reviewer" }
          ]
        }
      }
    ]
  }
}
```

## 例 3: 議事録や記事本文（markdown）

長文は `MarkdownDoc` の 1 node に包む。
markdown を envelope の外に置いてそのまま投げることはできない。

```json
{
  "title": "1on1 メモ 2026-06-28",
  "metadata": { "source": { "label": "meeting" } },
  "root": {
    "type": "Stack",
    "props": {},
    "children": [
      { "type": "MarkdownDoc", "props": { "body": "## アジェンダ\n\n- 今期の優先度\n- 次の打ち手\n\n## 決定事項\n\n1. A を進める\n2. B は保留\n" } }
    ]
  }
}
```

投げる。

```bash
syokan meeting.json
# dev renderer で確認するなら次を使う
SYOKAN_BASE_URL=http://localhost:5273 bun cli/syokan.ts meeting.json
```

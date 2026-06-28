---
name: syokan
description: "syokan (個人用 view layer) にデータを表示するための JSON snapshot envelope を組み立てて POST する。RSS フィード、進行中の PR review、議事録 markdown、今日の TODO、任意の集計結果などを『ブラウザで見たい』『syokan に出して/表示して/投げて』『snapshot を作って/送って』と言われたとき、または手元のデータを構造化 UI で一覧・確認したいときに使う。catalog component (Stack, Card, Heading, Link, Text, Time, MarkdownDoc, PlainText, Diff, Code, Badge) だけで tree を組み、syokan CLI もしくは POST /api/snapshots に送る。JSX は書かない。syokan という語が出たら、明示的に snapshot と言われなくてもこの skill を使う。"
---

# syokan

syokan は schema 駆動の view layer。
JSX を書かず、catalog component に対応する JSON tree を投げると、syokan が事前定義の React component で描画する。
あなたの仕事は、見せたいデータを envelope に組み立てて syokan に POST すること。

## 守るべき前提

- **ephemeral**：syokan は何も永続化しない。再構築できる一時的なデータ（今日の RSS、進行中の review など）だけを置く。
- **JSON only**：server は JSON envelope しか受け取らない。markdown やプレーンテキストをそのまま投げると弾かれる。文章を見せたいときは `MarkdownDoc` か `PlainText` の node に包む。
- **strict schema**：すべての component の props は strict で検証される。スキーマに無いキーを足すと検証に失敗して 400 になるので、props を勝手に増やさない。
- **leaf は children を持てない**：children を受け取るのは `Stack` と `Card` だけ。leaf node に children を付けると ingest 時に弾かれる。

## 作成から表示までの手順

1. `syokan catalog` で使える type と props を確認する（SSOT。下の「catalog」を参照）。
2. 見せたいデータをその組み合わせに落とす。最上位は container（`Stack` など）で縦に積むのが基本。
3. envelope を JSON にする（下の「envelope の形」を参照）。`root` だけが必須。
4. CLI で投げる（下の「投げ方」を参照）。成功すると view URL が表示される。

似た view を以前に作っているなら、0 から組まず保存済みテンプレを土台にする（下の「テンプレートで再現性を持たせる」）。

## envelope の形

POST body に入れてよいのは次だけ。
`id`、`createdAt`、`url` は server が採番するので入れない。

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // 必須。view tree
  "title": "Today's RSS",                                // 任意。一覧と view header に出る
  "metadata": { "source": { "label": "daily-rss" } },   // 任意。出所ラベル
  "schemaVersion": 1,                                    // 任意。server が補完する
  "idempotencyKey": "rss-2026-06-28"                     // 任意。同一キーの再 POST を dedupe
}
```

`metadata.source` は loose なので、`label` に加えて `url` や `fetchedAt` を足しても保持される（例 `{ "label": "gh-review", "url": "https://example.com/..." }`）。
毎日や定期的に同じものを出す用途では、日付などを混ぜた `idempotencyKey` を付けて重複を防ぐ。

## catalog

使える `type` と各 props の定義は **`syokan catalog` で取得する**。
これが SSOT で、`src/catalogs` から生成される。md に転記すると古くなるので、毎回ここから引く。

出力は `{ "items": [{ "type", "props", "childrenTypes" }] }`。

- `props`: その type の props を JSON Schema で表したもの。`required` / `enum` / `format`（httpUrl は `uri`、`Time.datetime` は `date-time`）/ `additionalProperties:false`（未定義キーを弾く）をそのまま満たすように組む。
- `childrenTypes`: `null` は子を取れる container、`[]` は子を取れない leaf、`[..]` は許可された type のみ子に置けることを表す。

各 component を組み合わせた完成形の例は [references/examples.md](references/examples.md) を参照する。

## 投げ方

成功時、CLI は view URL を stdout に出す。

| 状況 | コマンド |
| --- | --- |
| コマンド一覧を確認（機械可読は `--json`） | `syokan --help` / `syokan --help --json` |
| global install（常用。port 5173、`~/.config/syokan`） | `syokan snapshot.json` または `cat snapshot.json \| syokan` |
| パイプで直接 | `claude -p '…JSON…' \| syokan` |
| catalog 定義を取得 | `syokan catalog` |
| テンプレ一覧 / 取得 | `syokan templates` / `syokan templates get <id>` |
| テンプレ保存 / 削除 | `syokan templates add --title <t> [--description <d>] <file\|->` / `syokan templates rm <id>` |
| dev server に出す（port 5273。リポジトリで `bun run dev` 中） | `SYOKAN_BASE_URL=http://localhost:5273 bun cli/syokan.ts snapshot.json` |
| snapshot か home を開く | `syokan open [id]` |
| lazy-spawn した server を止める | `syokan stop` |

リポジトリの開発中に動作確認するときは dev server（5273）に投げると、手元の最新 renderer で見られる。
bare の `syokan` は常に global install（5173）を見る。

コマンドや props がうろ覚えなら、md ではなく CLI 自身に問い合わせる。`syokan --help --json` でコマンド・env・exit code の manifest が、`syokan catalog` で type と props の定義が、いずれも機械可読で返る。

## テンプレートで再現性を持たせる

気に入った view は毎回 0 から組まず、テンプレとして syokan に保存して使い回す。
テンプレは「保存した envelope そのもの」で、syokan は中身を解釈せず保管・一覧するだけ。

1. `syokan templates` で既存テンプレ（title / description / id）を一覧する。
2. 使いたいものを `syokan templates get <id>` で取得する（json 込み）。
3. その json を土台にデータを差し替えて envelope を組む。雛形に `{{...}}` のような目印を書いておき、それを埋める運用にしてもよい（置換は自分で行う。syokan は介在しない）。
4. 組んだ envelope を投げる（上の「投げ方」）。
5. 新しく気に入った view ができたら `syokan templates add --title <t> [--description <d>] <file>` で保存し、次回から再現する。

## 検証に失敗したとき

- `400 {"error":"invalid_json"}`：body が JSON になっていない。
- `400 {"error":"validation_failed","issues":[...]}`：schema 違反。`issues` のパスを見て、未定義の props、leaf への children、必須欠落、型不一致（httpUrl、ISO datetime、非空 string）を直す。

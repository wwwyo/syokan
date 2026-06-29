# syokan

個人用の schema 駆動 **view layer**。JSX を書く代わりに、LLM（Claude Code / scheduled agent / CLI）が **JSON tree** を投げ、syokan が事前定義した React component で描画する。snapshot は **ephemeral** — 残し続ける前提のデータは置かない。

設計の意図・ディレクトリ構成・開発規約は [AGENTS.md](./AGENTS.md)。この README は **使い方**。

## 仕組み

snapshot は `{ type, props, children? }` のノードからなる JSON tree。`type` は catalog component を指し、受信時に Zod が検証して registry が React component に対応付ける:

```
{ "type": "Heading", "props": { "text": "Today" } }  →  <Heading text="Today" />
```

client-side routing（TanStack Router）の CSR app。`/` が home、`/snapshots/:id` が個別 snapshot。API 以外のパスには SPA HTML を返すので deep link / reload が成立する。

## はじめに

普段使いの `syokan` は **単体バイナリ**（Bun/Node 不要、server も自動 lazy-spawn）。

```bash
mise use -g github:wwwyo/syokan@latest   # github backend で install
syokan --help                         # コマンド確認（機械可読は --help --json）
```

> 他の install: [Releases](https://github.com/wwwyo/syokan/releases) から `syokan-<os>-<arch>` を直接 download、または source build（[ビルド](#ビルド-単体バイナリ)）。macOS で Gatekeeper に弾かれたら `codesign --sign - <path>`。

最初の snapshot を投げる（server は自動で立ち上がり、view URL が返る）:

```bash
echo '{"root":{"type":"Heading","props":{"text":"🎉 syokan のセットアップ完了"}}}' | syokan
syokan open   # home を開く
```

props は `syokan catalog` で確認して組む。あとは自分のデータを投げるだけ。

## 開発

```bash
mise install && bun install
bun run dev    # Bun.serve + HMR（portless 経由で https://syokan.localhost）
```

dev は global install（port `5173` / `~/.config/syokan/`）とは別に port `5273` / repo ローカルの `./.syokan-dev/` を使うので衝突しない。dev server へ投げるには `SYOKAN_BASE_URL=http://localhost:5273` を付ける。portless を介さないなら `PORTLESS=0 bun run dev`（default port `5173`）。

## envelope

`POST /api/snapshots` の body は snapshot **envelope**（**JSON** のみ。Markdown/plain-text は `MarkdownDoc` / `PlainText` ノードに包む）:

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // 必須: view tree
  "title": "Today's RSS",                              // 任意
  "metadata": { "source": { "label": "daily-rss" } }, // 任意: 出所ラベル。sidebar と header に出る
  "idempotencyKey": "rss-2026-06-20"                   // 任意: 重複投稿を dedupe
}
```

成功すると `201` で `{ id, url, snapshot }`、検証エラーは `400`（`invalid_json` / `validation_failed`）。CLI コマンドは `syokan --help`。

## catalog

`type` の SSOT は catalog（`src/catalogs`）。manifest を取得して props 契約を引く:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes }] }
```

現在の type — container: `Stack` `Card` / leaf: `Heading` `Link` `Text` `Time` `MarkdownDoc` `PlainText` `Diff` `Code` `Badge`。Storybook（`bun run storybook`）で視覚的に確認できる。

## テンプレート

気に入った layout は **テンプレート**（保存した envelope + `title`）として `~/.config/syokan/templates/` に残せる。snapshot と違い永続する。syokan は保管・一覧するだけで中身は解釈しない（`GET/POST/DELETE /api/templates`）。

## 設定

テーマ・フォントの表示設定は singleton リソースとして `~/.config/syokan/settings.json` に永続する（snapshot と違い残す）。ブラウザの localStorage が即時反映用キャッシュ、サーバーが正本で、起動時に同期するので複数ブラウザ間で設定を共有できる。

```
GET /api/settings              # { theme, font }（未設定なら既定値）
PUT /api/settings              # 部分更新（送ったキーだけ上書き）。未知キー / 不正値は 400
```

`theme`: `system` `light` `dark`（SSOT: `src/schema/setting.ts`）。`font`: Google Fonts プリセットの識別子（既定 `system`）。一覧と追加は `src/lib/fonts.ts` が SSOT で、ここに 1 エントリ足すだけでフォントが増える（実フォントは選択時に `<link>` を動的読込し、`--app-font-*` を書き換える。`styles.css` / `index.html` は触らない）。

## ビルド (単体バイナリ)

```bash
bun run compile       # → dist/syokan（CLI+server+frontend を 1 バイナリに）
bun run compile:all   # → dist/syokan-<os>-<arch>（cross-compile、Release 配布用）
```

dual-mode（[entry.ts](./entry.ts)）: 通常起動は CLI、server は `SYOKAN_SERVE=1` で自分自身を re-exec する。global バイナリは port `5173` / `~/.config/syokan/`（`XDG_CONFIG_HOME` で上書き可）。配布は Release に asset を上げて `mise use -g github:wwwyo/syokan@latest`。

## その他

- 設計の意図・ディレクトリ構成・開発規約: [AGENTS.md](./AGENTS.md)

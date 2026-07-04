# syokan

**syokan — LLM が rich UI を召喚する。**

**syokan（召喚）は動詞。** 見たいものの名前を唱えると view が現れる:

```bash
syokan notes.md   # notes.md を syokan
```

LLM が JSON の呪文を唱えると、rich で生きた interface が立ち現れる — JSX は書かず、build も無い。散らばったデータ — 今日の RSS、進行中の PR review、共有された議事録、手元の markdown — が、必要なときだけ構造化された UI として現れる。view は ephemeral — 召喚された view はやがて消える前提で、何も溜め込まない。そして唱えるのは誰でもいい: Claude Code、scheduled agent、CLI ワンライナー、webhook。

English: [README.md](./README.md)

設計の意図・ディレクトリ構成・開発規約は [AGENTS.md](./AGENTS.md)。この README は **使い方**。

## 仕組み

実体は個人用の schema 駆動 view layer。JSX を書く代わりに、LLM（Claude Code / scheduled agent / CLI）が **JSON tree** を投げ、syokan が事前定義した React component で描画する。snapshot は **ephemeral** — 召喚した view は残らない前提。残し続けるデータは置かない。

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

最初の召喚（server は自動で立ち上がり、view URL が返る）:

```bash
echo '{"root":{"type":"Heading","props":{"text":"🎉 syokan のセットアップ完了"}}}' | syokan
syokan open   # home を開く
```

props は `syokan catalog` で確認して組む。あとは見たいものを syokan。

手元のファイルはそのまま syokan（envelope を組む必要はない）。envelope JSON ならそのまま post、それ以外（markdown / log / txt / 設定 json など）は live な `FileDoc` に自動で包まれ、元ファイルの編集が view に追従する:

```bash
syokan notes.md   # markdown を整形表示。保存するたびに view が最新化される
syokan app.log    # 追記される log を等幅で表示
```

## 開発

```bash
mise install && bun install
bun run dev    # Bun.serve + HMR（portless 経由で https://syokan.localhost）
```

dev は global install（port `5173` / XDG 標準ディレクトリ配下）とは別に port `5273` / repo ローカルの `./.syokan-dev/` を使うので衝突しない。dev server へ投げるには `SYOKAN_BASE_URL=http://localhost:5273` を付ける。portless を介さないなら `PORTLESS=0 bun run dev`（default port `5173`）。

## envelope

`POST /api/snapshots` の body は snapshot **envelope**（**JSON** のみ。Markdown/plain-text は `MarkdownDoc` / `PlainText` ノードに包む）:

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // 必須: view tree
  "title": "Today's RSS",                              // 任意
  "metadata": { "source": { "label": "daily-rss" } }, // 任意: 出所ラベル。sidebar と header に出る
  "idempotencyKey": "rss-2026-06-20",                  // 任意: 名前付き view を指す。指定時はこの POST は update (AIP-134) として扱われる: 一致すれば root/title/metadata を置き換え (id/url は同じ、createdAt は初回のまま)、一致が無ければ `allowMissing` を付けない限り 404 (`not_found`)
  "allowMissing": true                                 // 任意 (既定 false): idempotencyKey に一致が無いとき、404 にせず新規作成する
}
```

`idempotencyKey` 無しの POST は常に新規作成(`201`)。`idempotencyKey` ありは、一致すれば `200`(その場で更新)、一致が無ければ `allowMissing` 指定時は `201`、それ以外は `404`(`not_found`)。

成功すると `201` で `{ id, url, snapshot }`、検証エラーは `400`（`invalid_json` / `validation_failed`）。CLI コマンドは `syokan --help`。

## catalog

`type` の SSOT は catalog（`src/catalogs`）。manifest を取得して props 契約を引く:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes }] }
```

現在の type — container: `Stack` `Card` / leaf: `Heading` `Link` `Text` `Time` `MarkdownDoc` `PlainText` `Diff` `Code` `Badge` `FileDoc`。Storybook（`bun run storybook`）で視覚的に確認できる。

`FileDoc`（props: `path`、**絶対パスのみ**）はファイルパスを参照する catalog ノード。サーバが内容を読んで拡張子から描画形式を推論し（`.md`/`.markdown`→markdown、`.json`→code、その他→text）、ファイルの変更を view に追従させる（forward sync）。サーバは localhost のみに bind し、監視は view を開いている間だけの一時状態（永続しない）。

## テンプレート

気に入った layout は **テンプレート**（保存した envelope + `title`）として `~/.local/share/syokan/templates/` に残せる。snapshot と違い永続する。syokan は保管・一覧するだけで中身は解釈しない（`GET/POST/DELETE /api/templates`）。

## 設定

テーマ・フォントの表示設定は singleton リソースとして `~/.config/syokan/settings.json` に永続する（snapshot と違い残す）。ブラウザの localStorage が即時反映用キャッシュ、サーバーが正本で、起動時に同期するので複数ブラウザ間で設定を共有できる。

```
GET /api/settings              # { theme, font }（未設定なら既定値）
PUT /api/settings              # 部分更新（送ったキーだけ上書き）。未知キー / 不正値は 400
```

`theme`: `system` `light` `dark`（SSOT: `src/schema/setting.ts`）。`font`: フォントプリセットの識別子（既定 `system`）。ほとんどは Google Fonts から読み込むが、`system`/`moralerspace` はそうではない。一覧と追加は `src/lib/fonts.ts` が SSOT で、ここに 1 エントリ足すだけでフォントが増える（実フォントは選択時に `<link>` を動的読込し、`--app-font-*` を書き換える。`styles.css` / `index.html` は触らない）。

## ビルド (単体バイナリ)

```bash
bun run compile       # → dist/syokan（CLI+server+frontend を 1 バイナリに）
bun run compile:all   # → dist/syokan-<os>-<arch>（cross-compile、Release 配布用）
```

dual-mode（[entry.ts](./entry.ts)）: 通常起動は CLI、server は `SYOKAN_SERVE=1` で自分自身を re-exec する。global バイナリは port `5173`、永続先は XDG base directory に従い分散する（settings=`~/.config/syokan/`、templates=`~/.local/share/syokan/`、snapshot+runtime/log=`~/.local/state/syokan/`。場所の上書きは `XDG_{CONFIG,DATA,STATE}_HOME` で行う（絶対パスのみ、相対値は無視）。旧レイアウトからの upgrade では templates を起動時に新 location へ自動移行する）。配布は Release に asset を上げて `mise use -g github:wwwyo/syokan@latest`。

## その他

- 設計の意図・ディレクトリ構成・開発規約: [AGENTS.md](./AGENTS.md)

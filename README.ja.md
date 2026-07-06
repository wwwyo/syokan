# syokan

**syokan — LLM が rich UI を召喚する。**

**syokan（召喚）は動詞。** 見たいものの名前を唱えると view が現れる:

```bash
syokan dashboard.json   # dashboard.json を syokan
```

LLM が JSON の呪文を唱えると、rich で生きた interface が立ち現れる — JSX は書かず、build も無い。散らばったデータ — 今日の RSS、進行中の PR review、共有された議事録、生きた status board — が、必要なときだけ構造化された UI として現れる。view は ephemeral — 召喚された view はやがて消える前提で、何も溜め込まない。そして唱えるのは誰でもいい: Claude Code、scheduled agent、CLI ワンライナー、webhook。

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

tree ファイルはそのまま syokan（envelope を組む必要はない）。envelope JSON なら単発で post、裸の catalog tree なら live な `TreeDoc` に自動で包まれ、ファイルの編集が view に追従する（LLM がファイルを書き換え続ければ view が追いかける）。非 JSON は拒否される — syokan が話すのは catalog tree だけ:

```bash
syokan dashboard.json   # tree を召喚。保存するたびに view が再描画される
```

## 開発

```bash
mise install && bun install
bun run dev    # 2 つの app: syokan サーバー（Bun.serve + HMR）と share Worker（wrangler dev）
```

root の `dev` は全 workspace app に fan-out し（`bun --filter '@syokan/*' --parallel dev`）、各 app が自分の `dev` を持つ。2 プロセスが立ち上がる:

- **`@syokan/app`** … port `5273`（portless 経由で `https://syokan.localhost`）。repo ローカルの `./.syokan-dev/` に書くので global install（port `5173` / XDG 標準ディレクトリ配下）と衝突しない。
- **`@syokan/share`** … port `8787`（`wrangler dev`、miniflare のローカル KV）。viewer は起動時に一度だけバンドルされ、worker コードは hot-reload するが viewer の編集は再起動が必要（viewer HMR は無い）。

dev では syokan サーバーの `SYOKAN_SHARE_API` がローカル Worker（`http://localhost:8787`）を向くので、publish/共有はローカル KV に対して検証され、本番 `syokan.dev` の共有サービスには触れない。repo 内では mise `[shell_alias]` も `syokan` CLI を dev server（`SYOKAN_BASE_URL=http://localhost:5273`）に向けるので、`syokan <file>` は本番ではなく dev に post される。repo の外では `syokan` は global install。portless を介さないなら `PORTLESS=0 bun run dev`（default port `5173`）。個々の app だけ動かすには各自の `dev`（例 `bun --filter @syokan/app dev`）を使う。ただし `@syokan/app` 単独でも share は `8787` のローカルを向くので、publish には share Worker の起動が要る。

## envelope

snapshot **envelope**（**JSON** のみ。markdown は描画されない — 文章は catalog ノードに構造化するか、生テキストは `PlainText` に包む）は `POST /api/snapshots` で作成し、`PUT /api/snapshots` でその場を更新する:

```jsonc
{
  "root": { "type": "Stack", "props": {}, "children": [ /* ... */ ] }, // 必須: view tree
  "title": "Today's RSS",                              // 任意
  "metadata": { "source": { "label": "daily-rss" } }, // 任意: 出所ラベル。sidebar と header に出る
  "idempotencyKey": "rss-2026-06-20"                   // POST では任意・PUT では必須: view に名前を付け、後から狙い撃てるようにする
}
```

`POST` は常に新規作成(`201`)し、`idempotencyKey` は以後の `PUT` の的として登録するだけ。`PUT` は `idempotencyKey` 必須で既存の view を狙い撃つ: 一致すれば `root`/`title`/`metadata` をその場で置き換え(id/url は同じ、`createdAt` は初回のまま)`200`、一致が無ければ `404`(`not_found`)——`PUT` は新規作成しない(`allowMissing` のような逃げ道は無い。作りたいときは `POST` を使う)。検証エラーは `400`（`invalid_json` / `validation_failed`）。CLI コマンドは `syokan --help`。

## catalog

`type` の SSOT は catalog（`apps/syokan/src/catalogs`）。manifest を取得して props 契約を引く:

```
GET /api/catalog   # { items: [{ type, props (JSON Schema), childrenTypes, notes }], mechanisms: { node, uiState, probe } }
```

現在の type — container: `Stack` `Card` `Checklist` `Collapsible` `TagFilter` / leaf: `Heading` `Link` `Text` `Time` `PlainText` `Diff` `Code` `Badge` `Mermaid` `TreeDoc` `Table` `Stat` `Graph` `Probe`。Storybook（`bun run storybook`）で視覚的に確認できる。

すべての node は横断フィールド `id`（view 内 anchor。`Link href:"#<id>"` で移動でき、操作を持つ node が閲覧端末ローカルの状態を保持するための identity にもなる）と `tags`（祖先 `TagFilter` による絞り込み対象化）を受け付ける。操作状態（チェック・開閉・絞り込み選択・Probe 再実行）は閲覧側ブラウザに留まり、snapshot 本体は不変のまま。`Probe` は `mechanisms.probe.kinds` に公開された事前定義の読み取り専用 check だけを実行でき（`POST /api/probes/run`）、公開共有では再実行が無効化され、`shareVisible: true` を指定しない限り publish 時に引数と結果が envelope から削除される。

`TreeDoc`（props: `path`、**絶対パスのみ**、URL 不可）は catalog tree JSON ファイルを参照する catalog ノード。サーバが内容を読み、クライアントが検証して live な subtree として描画し、ファイルの変更を view に追従させる（forward sync）。書きかけの不正な保存で view は消えない: ファイルが正常に戻るまで、直前の正常な描画を保ったまま控えめなエラーを添える。sync 対象の tree の中に `TreeDoc` は置けない（入れ子を拒否することで循環を仕組みごと排除）。サーバは localhost のみに bind し、監視は view を開いている間だけの一時状態（永続しない）。publish 時は各 `TreeDoc` がその時点の subtree に凍結され、公開 payload がファイルを参照することはない。

## テンプレート

気に入った layout は **テンプレート**（保存した envelope + `title`）として `~/.local/share/syokan/templates/` に残せる。snapshot と違い永続する。syokan は保管・一覧するだけで中身は解釈しない（`GET/POST/DELETE /api/templates`）。

## 設定

テーマ・フォントの表示設定は singleton リソースとして `~/.config/syokan/settings.json` に永続する（snapshot と違い残す）。ブラウザの localStorage が即時反映用キャッシュ、サーバーが正本で、起動時に同期するので複数ブラウザ間で設定を共有できる。

```
GET /api/settings              # { theme, font }（未設定なら既定値）
PUT /api/settings              # 部分更新（送ったキーだけ上書き）。未知キー / 不正値は 400
```

`theme`: `system` `light` `dark`（SSOT: `apps/syokan/src/schema/setting.ts`）。`font`: フォントプリセットの識別子（既定 `system`）。ほとんどは Google Fonts から読み込むが、`system`/`moralerspace` はそうではない。一覧と追加は `apps/syokan/src/lib/fonts.ts` が SSOT で、ここに 1 エントリ足すだけでフォントが増える（実フォントは選択時に `<link>` を動的読込し、`--app-font-*` を書き換える。`styles.css` / `index.html` は触らない）。

## ビルド (単体バイナリ)

```bash
bun run compile       # → apps/syokan/dist/syokan（CLI+server+frontend を 1 バイナリに）
bun run compile:all   # → apps/syokan/dist/syokan-<os>-<arch>（cross-compile、Release 配布用）
```

dual-mode（[entry.ts](./apps/syokan/entry.ts)）: 通常起動は CLI、server は `SYOKAN_SERVE=1` で自分自身を re-exec する。global バイナリは port `5173`、永続先は XDG base directory に従い分散する（settings=`~/.config/syokan/`、templates=`~/.local/share/syokan/`、snapshot+runtime/log=`~/.local/state/syokan/`。場所の上書きは `XDG_{CONFIG,DATA,STATE}_HOME` で行う（絶対パスのみ、相対値は無視）。旧レイアウトからの upgrade では templates を起動時に新 location へ自動移行する）。配布は Release に asset を上げて `mise use -g github:wwwyo/syokan@latest`。

## その他

- 設計の意図・ディレクトリ構成・開発規約: [AGENTS.md](./AGENTS.md)

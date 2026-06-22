# syokan

個人用の view layer。複数リポジトリ・外部API・ファイルシステムから取得したデータを、事前定義した React component で人間が見る形に描画する。LLM (Claude Code / scheduled agent / CLI) は **JSON tree を投げるだけ**で、JSX を毎回生成しない。

「**照鑑 / 抄観**」— 自分の周りで何が起きているかを、抄して観るための場所。

> **セットアップ・使い方 (CLI / `POST /api/snapshots` の envelope schema / source.label 仕様 / catalog type 一覧) は [README.md](./README.md) が SSOT。** この AGENTS.md は設計判断 (なぜ) と開発規約 (どういじるか) を扱う。

## なぜ作るか

### 解きたい問題

普段、自分の周りには見たいデータが分散している:

- 今日のRSSフィード（`wwwyo/me/daily/<date>/input.md`）
- 進行中の code review（`gh` で取れる diff + 自分のコメント）
- 仕事で共有された議事録 markdown（その場で開いて見たいだけ）
- 今日のCalendar / TODO（[wwwyo/me](https://github.com/wwwyo/me) `daily/<date>/start.md` 由来）
- meml に保存した記事の読み返し

これらを **1つの URL で、構造化されたUIで、必要なときだけ** 見たい。Markdownファイルを次々開く運用も、Notionに溜め込む運用も、要件と噛み合わない。

### Claude Code に毎回JSXを書かせる選択肢の限界

Claude Code でviewを作ることは可能だが、毎回 JSX を生成させると:

- **Token cost** が嵩む（数百行のJSX × 表示頻度）
- **生成速度** が遅い（数秒〜数十秒のラグ）
- **正確性** が揺れる（props間違い、型不一致、import漏れ）
- **デザイン一貫性** が崩れる（同じCardが日ごとに微妙に違う）
- **Refactor不能** — 各pageが snowflake になり、共通変更ができない

LLM の本来の強みは「データを構造化する」ことで、「描画」ではない。**描画は事前に1度設計すれば再利用できる**。この分業を構造化したい。

### 永続化層と分けたい理由

データを残すべき場所と、見たいだけの場所はライフサイクルが違う:

| | 残す（meml） | 見るだけ（syokan） |
|---|---|---|
| 例 | 「3ヶ月前に学んだ概念」 | 「今日のRSS」「進行中のreview」 |
| 削除すると失う | 知識 | 何も（再構築可能） |
| バックアップ | 必須 | 不要 |
| schema 安定性 | 高 | 緩い |

これを同じstoreに混ぜると:
- 一時的な review state が長期メモリを汚染する
- 「今日のRSS」が3年後の検索に出てくる
- 削除/cleanup ポリシーが噛み合わず、結局 retention で別テーブル切る → なら最初から分けろという話

なので **syokan はデータを永続化しない**。残したいものは明示的に [meml](https://github.com/wwwyo/meml) へ昇格させる（promotion path）。

### Interface を固定したくない理由

入力経路を MCP に縛ると、CLI や webhook や paste が二級市民になる。実際の使い方は:

- Claude Code がファイル編集ベースで投げる
- CLI で手元の内容 (共有された議事録など) をその場で envelope に包んで投げて見たい
- 将来的に scheduled agent が定期push する可能性
- gh webhook で PR review トリガーする可能性

これら全てを `POST /api/snapshots` の同一 JSON envelope に流せれば、入力経路が増えても renderer は不変。

## 設計の核

### 役割の分離

| 層 | 役割 | このプロジェクト |
|----|------|----------------|
| Memory layer (LLM用) | 長期メモリ・wiki・知識query | **対象外**（[wwwyo/meml](https://github.com/wwwyo/meml) が担当） |
| View layer (人間用) | 一時的なdashboard、進行中の review、今日のRSS | **これ（syokan）** |

syokan は **データを永続化しない**（ephemeral）。長期保存が必要な情報は明示的に meml に昇格する。

### Schema-driven view

LLM に「JSXを書かせる」のではなく、**schema を満たす JSON tree を出力させる**。Zod で validation、catalog で React component に対応付け。

```
{ type: "Heading", props: { text, href } }
                ↓
        catalog["Heading"] → <Heading {...props} />
```

利点: LLM token 削減、生成速度、型安全、デザイン一貫性、refactor 容易。

### Interface フリー

入力経路を MCP / CLI / HTTP / paste のいずれかに固定しない。すべて `POST /api/snapshots` の同一 JSON envelope に統一 (envelope schema は README が SSOT)。

```
[Claude Code]      ──┐
[CLI]              ──┤
[scheduled agent]  ──┼──→ JSON tree → catalog → React render
[gh webhook]       ──┘
```

## ディレクトリ構造

```
syokan/
├── entry.ts             # 単体バイナリの dual-mode entry (SYOKAN_SERVE で cli/server 分岐)
├── cli/syokan.ts        # CLI (post / open / stop)。server を lazy-spawn (compiled は自分自身)
├── build.ts             # compile script (Bun.build({compile}) + tailwind → dist/syokan バイナリ)
├── src/
│   ├── frontend.tsx     # RouterProvider mount
│   ├── router.tsx       # TanStack Router の route tree (root=AppShell)
│   ├── Home.tsx / ViewPage.tsx / Render.tsx  # 各 route の本文 + JSON tree 再帰 renderer
│   ├── schema/          # Zod schema (catalog Item / envelope / validation 整形)
│   ├── lib/             # 横断 util (cn / date / code / snapshots / url / theme / font ...)
│   ├── catalogs/        # ★ LLM が JSON で投げる公開 type。index.ts が registry
│   └── components/      # catalog 非登録の内部 UI (ui=shadcn / AppShell / AppSidebar / PageLayout ...)
├── server/             # Bun.serve。routes.ts=/api/snapshots、store.ts=~/.syokan/data (ephemeral)
└── .storybook/         # catalog 視覚レビュー基盤
```

クライアント側ルーティングは **TanStack Router** で行う (code-based route、Vite プラグインは使わず Bun の bundler に載せる)。常駐 shell (AppShell) が sidebar と本文の置き場を 1 度だけ mount し、route 遷移では `<Outlet />` の中身だけ差し替える。これにより sidebar の開閉・スクロール位置・取得済み一覧が遷移をまたいで残り、本文の読書位置は router の `scrollRestoration` が復元する。直接 URL / reload / 戻る進む は server の SPA fallback (`/*` → HTML) で成立する。どの route にも一致しないパスは root の `notFoundComponent` で受ける。

snapshot 一覧は常駐 provider が保持し、遷移ごとには取り直さない (loading のちらつきを出さない)。最新化の契機は 2 つ: in-app の削除後 (`refresh()`) と、tab への復帰 (`focus` / `visibilitychange`)。作成は外 (CLI / LLM) で起きるため in-app の契機が無く、開いたままのアプリには tab 復帰時の取り直しで反映する。

> MVP 当初は「ページ間で引き継ぐ状態が無い」前提でフルリロードを採用していた。状態を持つ chrome (sidebar) の追加でその前提が崩れたため、意図的に client routing へ転換した (旧方針「採用しない」からの変更。経緯は `.agent/prd/client-routing/`)。

### Component collocation

component は `<Name>/index.tsx` に実装し、同じ dir に test (`<Name>.test.tsx`) と story (`<Name>.stories.tsx`) を同居させる。import は `@/components/PageLayout` のように dir を指す (index.tsx に解決)。関連ファイルを 1 箇所に集め、refactor / 削除時の追従漏れを防ぐ。

- **catalog 公開** (LLM が JSON で投げる type) は `catalogs/<Name>/`、**非公開の内部部品**は `components/<Name>/`
- **内部専用サブパーツ** (その component からのみ使う部品) は親の dir 配下にネストする (例: catalog の `Code/CopyButton/`)。複数 component で共有するようになったら 1 つ上の直下へ昇格させる。スコープ = 置き場所
- `components/ui/` は例外: shadcn が生成するフラットファイル群 (dir 化しない)

## セットアップ / 使い方

セットアップ手順 (mise / bun / portless)、CLI コマンド、`POST /api/snapshots` の envelope schema、source.label 仕様、catalog type 一覧は [README.md](./README.md) が SSOT。重複させないためここには書かない。

Storybook は catalog component の視覚レビュー基盤。`<Name>/<Name>.stories.tsx` で props の variant・edge case・dark/light を一覧化し、`.storybook/preview.tsx` が `src/styles.css` を読み込む。toolbar の `.dark` トグルでテーマ追従を確認できる。`.claude/launch.json` に `storybook` を登録済みなので preview 経由でも起動可能。起動コマンドは README 参照。

## 技術スタック

- **Runtime / Bundler / HMR / TS 実行**: Bun (1 つに集約。Vite / Hono / React Router は使わない)
- **Frontend**: React + TypeScript (Bun の HTML import + JSX/TSX ネイティブで bundle)
- **UI**: shadcn/ui (`base-nova` style) + `@base-ui/react` + Tailwind CSS v4
- **Backend**: `Bun.serve({ routes })` — frontend は `index.html` の import で供給 (dev は on-the-fly bundle + HMR、compile 時はバイナリへ埋め込み)。`/api/*` は同一プロセス内で同居
- **Validation**: Zod
- **Routing (server)**: `Bun.serve` の routes patterns (`/api/snapshots` ハンドラ + `/*` SPA fallback)
- **Routing (client)**: TanStack Router (code-based route、Vite プラグイン不使用)。loader / scrollRestoration / pending・notFound・error / 常駐レイアウトの要求を満たす選定
- **Component catalog**: Storybook (`@storybook/react-vite` + `@tailwindcss/vite`)。catalog を story 化して視覚レビュー。builder は Vite だが **Storybook 専用の devDep** で、アプリ本体の「Vite を使わない」方針はアプリ bundle に限った話（Bun ネイティブの Storybook builder が無いため代替なし）

## 配布 (compile / dev・global 分離)

global ツールは **単体実行ファイル** (`bun run compile` → `dist/syokan`)。bun/node/npm 無しで動く。「開発中は最新を見たい / 普段使いは確定版」という分離を、CLI でも server でもなく **実行形態** (バイナリ vs `bun run dev`) で成立させている。

- **dual-mode entry**: compile 後は cli + server + frontend が 1 バイナリに同居する。[entry.ts](./entry.ts) が `SYOKAN_SERVE` で CLI / server を分岐。lazy-spawn は「単体バイナリなら自分自身 (`process.execPath`) を `SYOKAN_SERVE=1` で再 exec、dev なら `bun server/index.ts`」する。dev/compiled の判定は `isCompiledBinary()`(execPath の basename が `bun` か) で行う。CLI 引数は両モードとも `argv.slice(2)` (compiled も argv[1] に embedded entry が入る)。
- **frontend は static `import index from "../index.html"`**。dev は on-the-fly bundle + HMR、compile 時は Bun が frontend を bundle してバイナリへ埋め込む (同一の静的 import で両立)。
- **tailwind / bun-plugin-tailwind は devDep**。`bun build --compile` (CLI) は plugin を受け取れないため、`build.ts` が `Bun.build({ compile, plugins:[tailwind] })` で明示配線して compile 時に CSS を展開する。
- **dev / global 分離**: global = `5173` / `~/.syokan`、dev = `5273` / repo ローカルの `.syokan-dev/` (gitignore 済み)。port が別なので両者の lazy-spawn server は衝突しない。
- macOS の未署名バイナリは Gatekeeper が止めることがある。ローカルビルドはそのまま動くが、配布/コピー後に弾かれたら `codesign --sign - dist/syokan`。

## 既知の落とし穴

### catalog `Code` / `Diff` は dev (StrictMode) で潰れる

`@pierre/diffs` の `File`（catalog の `Code` / `Diff`、および `Code` に委譲する `MarkdownDoc` のコードフェンス）は、**`bun run dev`（React StrictMode）で grammar が cold の初回描画時に高さ0に潰れる**。tab 内や client 遷移で踏みやすい（home「使い方」tab は決定的、ViewPage は時々）。

- **原因**: File は cold 初回に空プレースホルダ（高さ0）を出し、非同期ハイライト完了時の再描画 callback で本文に差し替える。StrictMode の mount→unmount→remount で、その callback が unmount 時に `cleanUp` 済み（`enabled=false`）の旧インスタンスに届き no-op になるため、潰れたまま固まる。
- **影響は dev のみ**。warm（grammar キャッシュ済）や本番ビルド（StrictMode 無効）では正常に描画される。`disableWorkerPool` / mount 遅延 / ResizeObserver パッチ除去 / default tab 変更はいずれも効かない（核心は非同期 callback × ライフサイクルのため）。
- **方針**: ハイライト不要な静的コード片は `components/CodeSnippet`（素の `<pre>`、初回計測に依存せず潰れない）を使う。ハイライトが要る doc は catalog `Code` のまま（dev での見え方は割り切り、本番で出る）。詳細は `src/catalogs/Code/index.tsx` のコメント参照。
- **上流**: pierre 側が StrictMode 再マウント後に非同期ハイライトの完了 callback を新インスタンスへ張り直さない堅牢性バグ。upstream issue 候補。

## コミュニケーション方針

- 忖度しない。問題点やリスクがあれば率直に指摘する
- コメントは「なぜ」を説明する場合にのみ書く
- 「データを永続化しない」原則を守る。永続化したくなったら meml への昇格 path を考える

## 関連リポジトリ

- [wwwyo/meml](https://github.com/wwwyo/meml) — long-term memory layer
- [wwwyo/me](https://github.com/wwwyo/me) — personal knowledge repo

# syokan

個人用の view layer。複数リポジトリ・外部API・ファイルシステムから取得したデータを、事前定義した React component で人間が見る形に描画する。LLM (Claude Code / scheduled agent / CLI) は **JSON tree を投げるだけ**で、JSX を毎回生成しない。

「**照鑑 / 抄観**」— 自分の周りで何が起きているかを、抄して観るための場所。

> **セットアップ・使い方 (CLI / `POST /api/items` の envelope schema / source.label 仕様 / catalog type 一覧) は [README.md](./README.md) が SSOT。** この AGENTS.md は設計判断 (なぜ) と開発規約 (どういじるか) を扱う。

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

これら全てを `POST /api/items` の同一 JSON envelope に流せれば、入力経路が増えても renderer は不変。

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

入力経路を MCP / CLI / HTTP / paste のいずれかに固定しない。すべて `POST /api/items` の同一 JSON envelope に統一 (envelope schema は README が SSOT)。

```
[Claude Code]      ──┐
[CLI]              ──┤
[scheduled agent]  ──┼──→ JSON tree → catalog → React render
[gh webhook]       ──┘
```

## ディレクトリ構造

```
syokan/
├── index.html               # Bun.serve の HTML import entry
├── cli/
│   └── syokan.ts            # CLI。第一引数で分岐 (file/pipe=post / open / stop)、server を lazy-spawn。同居 test
├── src/
│   ├── frontend.tsx         # createRoot mount
│   ├── App.tsx              # pathname を見て Home / ViewPage を出し分け (client routing なし)
│   ├── Home.tsx             # home (snapshot 一覧)
│   ├── ViewPage.tsx         # 1 snapshot の表示 (presentational)
│   ├── ViewPageContainer.tsx #  ViewPage の取得 / 削除 / 遷移 (data 層)
│   ├── Render.tsx           # JSON tree → React 再帰 renderer
│   ├── styles.css           # Tailwind v4 + shadcn CSS variables
│   ├── schema/             # ★ schema layer: catalog.ts (Item / createCatalog) / snapshot.ts (envelope) / error.ts (validation 整形) / index.ts (barrel)
│   ├── lib/                 # utils.ts (cn) / date.ts / code.ts (Shiki lang allowlist) / route.ts (path→id) / url.ts (href 検証) / theme.ts / font.ts / views.ts / useColorScheme.ts / useScrollRestore.ts
│   ├── catalogs/            # ★ catalog 公開 component (LLM が JSON で投げられる type)
│   │   ├── index.ts         #   registry: type 名 → (props schema, component) + itemSchema
│   │   ├── Card/            #   各 component は <Name>/index.tsx + 同居 test/story
│   │   │   ├── index.tsx
│   │   │   ├── Card.test.tsx
│   │   │   └── Card.stories.tsx  # Storybook (catalog の視覚レビュー用)
│   │   ├── Code/            #   @pierre/diffs ベースの code 表示。内部専用 CopyButton/ を配下にネスト
│   │   └── ...              #   Stack / Heading / Link / Text / Time / Badge / MarkdownDoc / PlainText / Diff
│   └── components/          # catalog 非登録の UI (LLM が JSON で投げられない内部部品)
│       ├── ui/              #   shadcn primitives (CLI 経由で生成・更新。Dir 化しない)
│       ├── AppSidebar/      #   snapshot 一覧 sidebar (header のトグルで開閉)
│       ├── PageLayout/      #   root に常に適用する共通レイアウト (背景/幅/余白/title。旧 Page の器)
│       ├── ViewHeader/      #   viewer chrome (snapshot メタ帯 / source label)
│       ├── ThemeSelect/     #   テーマ切り替え (→ lib/theme.ts)
│       ├── FontSelect/      #   フォント切り替え (→ lib/font.ts)
│       ├── CodeSnippet/     #   素の pre による静的 code 片 (tab 内でも潰れない)
│       ├── ErrorBoundary/   #   描画時例外の握り
│       └── UnknownComponent/ #  Render が未知 type に出すフォールバック
├── .storybook/              # Storybook 設定 (main.ts / preview.tsx) — catalog レビュー基盤
├── server/
│   ├── index.ts             # Bun.serve({ routes }) — / は HTML import、/api/* はハンドラ。store を ~/.syokan/data に配線
│   ├── routes.ts            #   /api/* ハンドラ (envelope validation → store)
│   └── store.ts             #   snapshot を snapshots.json に保存 (ephemeral 前提の disposable。O_EXCL lock で書き込み排他)
├── bunfig.toml              # bun-plugin-tailwind + install policy
├── components.json          # shadcn config (style: base-nova)
├── mise.toml                # Bun version 固定
└── package.json
```

クライアント側ルーティングは採用しない。`window.location.pathname` から id を抽出する単一ページで対応する (PRD `Technical Considerations` 参照)。

### Component collocation

component は `<Name>/index.tsx` に実装し、同じ dir に test (`<Name>.test.tsx`) と story (`<Name>.stories.tsx`) を同居させる。import は `@/components/PageLayout` のように dir を指す (index.tsx に解決)。関連ファイルを 1 箇所に集め、refactor / 削除時の追従漏れを防ぐ。

- **catalog 公開** (LLM が JSON で投げる type) は `catalogs/<Name>/`、**非公開の内部部品**は `components/<Name>/`
- **内部専用サブパーツ** (その component からのみ使う部品) は親の dir 配下にネストする (例: catalog の `Code/CopyButton/`)。複数 component で共有するようになったら 1 つ上の直下へ昇格させる。スコープ = 置き場所
- `components/ui/` は例外: shadcn が生成するフラットファイル群 (dir 化しない)

## セットアップ / 使い方

セットアップ手順 (mise / bun / portless)、CLI コマンド、`POST /api/items` の envelope schema、source.label 仕様、catalog type 一覧は [README.md](./README.md) が SSOT。重複させないためここには書かない。

Storybook は catalog component の視覚レビュー基盤。`<Name>/<Name>.stories.tsx` で props の variant・edge case・dark/light を一覧化し、`.storybook/preview.tsx` が `src/styles.css` を読み込む。toolbar の `.dark` トグルでテーマ追従を確認できる。`.claude/launch.json` に `storybook` を登録済みなので preview 経由でも起動可能。起動コマンドは README 参照。

## 技術スタック

- **Runtime / Bundler / HMR / TS 実行**: Bun (1 つに集約。Vite / Hono / React Router は使わない)
- **Frontend**: React + TypeScript (Bun の HTML import + JSX/TSX ネイティブで bundle)
- **UI**: shadcn/ui (`base-nova` style) + `@base-ui/react` + Tailwind CSS v4
- **Backend**: `Bun.serve({ routes })` — `/` は HTML import、`/api/*` は同一プロセス内で同居
- **Validation**: Zod
- **Routing (server)**: `Bun.serve` の routes patterns
- **Routing (client)**: React Router 等は採用しない
- **Component catalog**: Storybook (`@storybook/react-vite` + `@tailwindcss/vite`)。catalog を story 化して視覚レビュー。builder は Vite だが **Storybook 専用の devDep** で、アプリ本体の「Vite を使わない」方針はアプリ bundle に限った話（Bun ネイティブの Storybook builder が無いため代替なし）

## コミュニケーション方針

- 忖度しない。問題点やリスクがあれば率直に指摘する
- コメントは「なぜ」を説明する場合にのみ書く
- 「データを永続化しない」原則を守る。永続化したくなったら meml への昇格 path を考える

## 関連リポジトリ

- [wwwyo/meml](https://github.com/wwwyo/meml) — long-term memory layer
- [wwwyo/me](https://github.com/wwwyo/me) — personal knowledge repo

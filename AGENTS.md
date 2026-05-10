# syokan

個人用の view layer。複数リポジトリ・外部API・ファイルシステムから取得したデータを、事前定義した React component で人間が見る形に描画する。LLM (Claude Code / scheduled agent / CLI) は **JSON tree を投げるだけ**で、JSX を毎回生成しない。

「**照鑑 / 抄観**」— 自分の周りで何が起きているかを、抄して観るための場所。

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
- **デザイン一貫性** が崩れる（同じArticleCardが日ごとに微妙に違う）
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
- CLI で「共有された .md ファイル → 開いて見たい」が頻発する
- 将来的に scheduled agent が定期push する可能性
- gh webhook で PR review トリガーする可能性

これら全てを `POST /api/items { type, props, children? }` の同一 schema に流せれば、入力経路が増えても renderer は不変。

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
{ type: "ArticleCard", props: { title, url, summary } }
                ↓
        catalog["ArticleCard"] → <ArticleCard {...props} />
```

利点: LLM token 削減、生成速度、型安全、デザイン一貫性、refactor 容易。

### Interface フリー

入力経路を MCP / CLI / HTTP / paste のいずれかに固定しない。すべて `POST /api/items { type, props, children? }` の同一 schema に統一。

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
├── src/
│   ├── catalog.ts           # component catalog 定義
│   ├── Render.tsx           # JSON tree → React 再帰 renderer
│   ├── frontend.tsx         # createRoot mount
│   ├── App.tsx
│   ├── styles.css           # Tailwind v4 + shadcn CSS variables
│   ├── lib/utils.ts         # cn() (clsx + tailwind-merge)
│   └── components/
│       ├── ui/              # shadcn primitives (CLI 経由で生成)
│       └── ...              # composite component (ArticleCard / MarkdownDoc 等)
├── server/
│   └── index.ts             # Bun.serve({ routes }) — / は HTML import、/api/* はハンドラ
├── bunfig.toml              # bun-plugin-tailwind + install policy
├── components.json          # shadcn config (style: base-nova)
├── mise.toml                # Bun version 固定
└── package.json
```

クライアント側ルーティングは採用しない。`window.location.pathname` から id を抽出する単一ページで対応する (PRD `Technical Considerations` 参照)。

## セットアップ

```bash
mise install     # Bun を mise.toml の固定バージョンで導入
bun install
bun run dev      # Bun.serve + HMR (http://localhost:5173)
```

ブラウザで `http://localhost:5173` を開く。

### portless で起動 (推奨)

[portless](https://github.com/vercel-labs/portless) を使うと named `.localhost` URL でアクセスできる。

```bash
bun run dev:portless   # https://syokan.localhost (app は port 5173)
```

`dev:portless` は `PORTLESS_APP_PORT=5173` で app の port を固定しているので、`bun run dev` と同じ 5173 番。bookmark / CORS / `.env` の URL は両方の起動経路で互換。ただし port を共有するため **`dev` と `dev:portless` の同時起動はできない**（先勝ち）。

初回は HTTPS proxy 起動で sudo (port 443) と CA 信頼ストア登録が走る。proxy はバックグラウンド daemon として常駐し、停止は `portless proxy stop`。bypass したい場合は `PORTLESS=0 bun run dev:portless`。

## 技術スタック

- **Runtime / Bundler / HMR / TS 実行**: Bun (1 つに集約。Vite / Hono / React Router は使わない)
- **Frontend**: React + TypeScript (Bun の HTML import + JSX/TSX ネイティブで bundle)
- **UI**: shadcn/ui (`base-nova` style) + `@base-ui/react` + Tailwind CSS v4
- **Backend**: `Bun.serve({ routes })` — `/` は HTML import、`/api/*` は同一プロセス内で同居
- **Validation**: Zod
- **Routing (server)**: `Bun.serve` の routes patterns
- **Routing (client)**: React Router 等は採用しない

## コミュニケーション方針

- 忖度しない。問題点やリスクがあれば率直に指摘する
- コメントは「なぜ」を説明する場合にのみ書く
- 「データを永続化しない」原則を守る。永続化したくなったら meml への昇格 path を考える

## 関連リポジトリ

- [wwwyo/meml](https://github.com/wwwyo/meml) — long-term memory layer
- [wwwyo/me](https://github.com/wwwyo/me) — personal knowledge repo

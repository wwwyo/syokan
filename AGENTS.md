# syokan

個人用の view layer。複数リポジトリ・外部API・ファイルシステムから取得したデータを、事前定義した React component で人間が見る形に描画する。LLM (Claude Code / scheduled agent / CLI) は **JSON tree を投げるだけ**で、JSX を毎回生成しない。

「**照鑑 / 抄観**」— 自分の周りで何が起きているかを、抄して観るための場所。

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
├── src/
│   ├── catalog.ts           # component catalog 定義
│   ├── Render.tsx           # JSON tree → React 再帰 renderer
│   ├── components/          # 自前 component (shadcn/ui 合成)
│   │   ├── ArticleCard.tsx
│   │   ├── DiffViewer.tsx
│   │   ├── MarkdownDoc.tsx
│   │   └── Layout.tsx
│   ├── pages/               # file-based routing (import.meta.glob)
│   │   ├── Calendar.tsx
│   │   └── TODO.tsx
│   └── App.tsx
├── server/
│   ├── index.ts             # Hono on Bun
│   └── routes.ts            # /api/items, /api/views/:id, /api/repos/*
└── package.json
```

## セットアップ

```bash
bun install
bun run dev      # Vite + Hono 同時起動
```

ブラウザで `http://localhost:5173` を開く。

## 技術スタック

- **Runtime**: Bun
- **Frontend**: Vite + React + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Hono (Vite middleware として同居)
- **Validation**: Zod
- **Routing**: React Router (file-based via `import.meta.glob`)

## コミュニケーション方針

- 忖度しない。問題点やリスクがあれば率直に指摘する
- コメントは「なぜ」を説明する場合にのみ書く
- 「データを永続化しない」原則を守る。永続化したくなったら meml への昇格 path を考える

## 関連リポジトリ

- [wwwyo/meml](https://github.com/wwwyo/meml) — long-term memory layer
- [wwwyo/me](https://github.com/wwwyo/me) — personal knowledge repo

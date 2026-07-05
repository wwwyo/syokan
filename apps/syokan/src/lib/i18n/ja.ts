import type { Messages } from "./en";

const FENCE = "```";

export const ja: Messages = {
  common: {
    delete: "削除",
    backToHome: "ホームへ戻る",
    copy: "コピー",
    copied: "コピーしました",
    copyCode: "コードをコピー",
    loading: "読み込み中…",
  },
  home: {
    introLead: "review や日々のメモを、シームレスに syokan（召喚）。",
    introBody: "LLM が生成した catalog JSON を、そのままリッチな UI として表示。",
    tabSettings: "設定",
    tabUsage: "使い方",
    theme: "テーマ",
    themeDescription: "システム設定に従うか、ライト / ダークを固定するか選べる。",
    font: "フォント",
    fontDescription: "表示フォントをプリセットから検索して選べる。",
    usageDoc: `## 1. snapshot を作る — \`POST /api/snapshots\`

\`root\` に catalog の type で組んだ tree を渡す。応答に \`id\` が返る。

${FENCE}bash
curl -X POST http://localhost:5173/api/snapshots \\
  -H "content-type: application/json" \\
  -d '{
    "title": "今日のRSS",
    "metadata": { "source": { "label": "rss" } },
    "root": {
      "type": "Stack",
      "props": {},
      "children": [
        { "type": "Heading", "props": { "text": "今日のRSS" } },
        { "type": "Text", "props": { "body": "気になった記事をここに並べる" } }
      ]
    }
  }'
${FENCE}

応答:

${FENCE}json
{
  "id": "k3f9q2",
  "url": "/snapshots/k3f9q2",
  "snapshot": { "schemaVersion": 1, "id": "k3f9q2", ... }
}
${FENCE}

## 2. 開く — \`syokan open <id>\`

返ってきた \`id\` を渡すとブラウザで開く（server が無ければ自動起動）。作った
snapshot は左上の **メニュー** からも辿れる。

${FENCE}bash
syokan open k3f9q2
${FENCE}

## 投げられる type

\`Stack\` / \`Card\` / \`Heading\` / \`Text\` / \`Link\` / \`Badge\` / \`Time\` /
\`Code\` / \`Diff\` / \`MarkdownDoc\` / \`PlainText\` / \`FileDoc\`。各 type の props は
\`syokan catalog\`（\`GET /api/catalog\`）で確認できる。schema に合わない tree は
400 で弾かれる。`,
  },
  shell: {
    listError: "一覧の取得に失敗しました。",
    reload: "再読み込み",
    pageNotFound: "ページが見つかりません。",
    sidebarLabel: "ページ一覧",
    close: "閉じる",
    emptyList: "まだ snapshot がありません",
  },
  view: {
    notFoundBefore: "404 — snapshot ",
    notFoundAfter: " は見つかりません。",
    moreActions: "その他の操作",
    deleteFailed: "削除に失敗しました",
    renderError: "このコンテンツは表示できませんでした。",
  },
  themeSelect: {
    label: "テーマ",
    system: "システム",
    light: "ライト",
    dark: "ダーク",
  },
  fontSelect: {
    search: "フォントを検索",
    listLabel: "フォント",
    noMatches: "該当なし",
  },
  fileDoc: {
    errors: {
      not_found: "ファイルが見つかりません（削除された可能性があります）。",
      not_regular_file: "通常ファイルではないため表示できません。",
      permission_denied: "読み取り権限がありません。",
      too_large: "ファイルが大きすぎるため表示できません（上限 2 MiB）。",
      not_text: "テキストとして表示できません（バイナリ / 非 UTF-8）。",
      missing_path: "パスが指定されていません。",
      network: "読み込みに失敗しました（サーバに接続できません）。",
      error: "読み込みに失敗しました。",
    },
  },
  diff: {
    unparsable: "diff を表示できませんでした (patch を解釈できません)。",
    fileFailed: "この diff を表示できませんでした。",
    unassignedComments: (count: number) =>
      `${count} 件のコメントを表示できませんでした (file 未指定、または patch 内のファイル名と不一致)。`,
  },
  share: {
    share: "共有",
    sharing: "共有中…",
    shared: "公開中",
    successTitle: "公開リンクを作成しました",
    loginTitle: "ログインが必要です",
    loginBefore: "ターミナルで ",
    loginAfter: " を実行してから、もう一度お試しください。",
    errorTitle: "共有できませんでした",
    expires: (dateTime: string) => `${dateTime} まで有効`,
    unpublish: "公開停止",
    activeShares: "公開中のリンク",
    copyUrl: "URL をコピー",
    errors: {
      materializeFailed: (path: string) =>
        `参照ファイルを読めなかったため公開を中止しました: ${path}`,
      unreachable: "共有サービスに接続できません。",
      network: "サーバに接続できません。",
      generic: "共有に失敗しました。",
    },
  },
};

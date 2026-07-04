// 依存を増やさない最小の typed i18n。表示言語は起動時に 1 度だけ解決し、
// 以後は変えない (切替 UI は持たず、ブラウザ言語に従う)。
export type Lang = "en" | "ja";

/** 言語タグ列から表示言語を決める。"ja" で始まるタグが 1 つでもあれば ja、無ければ en。 */
export function detectLang(languages: readonly string[]): Lang {
  return languages.some((tag) => tag.toLowerCase().startsWith("ja"))
    ? "ja"
    : "en";
}

// 非ブラウザ (test / SSR) では navigator が無い・不完全なので空にして en へ落とす
function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

const FENCE = "```";

const en = {
  common: {
    delete: "Delete",
    backToHome: "Back to home",
    copy: "Copy",
    copied: "Copied",
    copyCode: "Copy code",
    loading: "Loading…",
  },
  home: {
    intro:
      "syokan (召喚) is a verb. LLMs summon rich UI — speak a JSON incantation, and a living interface appears: today's RSS, an in-flight review, a local markdown file, called up only when you need them. No JSX, ephemeral by design.",
    tabSettings: "Settings",
    tabUsage: "Usage",
    theme: "Theme",
    themeDescription: "Follow the system setting, or pin light / dark.",
    font: "Font",
    fontDescription:
      "Search the Google Fonts presets and pick the display font.",
    usageDoc: `## 1. Create a snapshot — \`POST /api/snapshots\`

Pass a tree of catalog types as \`root\`. The response returns an \`id\`.

${FENCE}bash
curl -X POST http://localhost:5173/api/snapshots \\
  -H "content-type: application/json" \\
  -d '{
    "title": "Daily RSS",
    "metadata": { "source": { "label": "rss" } },
    "root": {
      "type": "Stack",
      "children": [
        { "type": "Heading", "props": { "text": "Daily RSS" } },
        { "type": "Text", "props": { "text": "Articles that caught my eye" } }
      ]
    }
  }'
${FENCE}

Response:

${FENCE}json
{
  "id": "k3f9q2",
  "url": "/snapshots/k3f9q2",
  "snapshot": { "schemaVersion": 1, "id": "k3f9q2", ... }
}
${FENCE}

## 2. Open it — \`syokan open <id>\`

Pass the returned \`id\` to open it in the browser (the server starts
automatically if it is not running). Summoned snapshots are also reachable
from the **menu** at the top left.

${FENCE}bash
syokan open k3f9q2
${FENCE}

## Available types

\`Stack\` / \`Card\` / \`Heading\` / \`Text\` / \`Link\` / \`Badge\` / \`Time\` /
\`Code\` / \`Diff\` / \`MarkdownDoc\` / \`PlainText\`. Each type's props are listed
in Storybook. Trees that do not match the schema are rejected with 400.`,
  },
  shell: {
    listError: "Failed to load the snapshot list.",
    reload: "Reload",
    pageNotFound: "Page not found.",
    sidebarLabel: "Snapshots",
    close: "Close",
    emptyList: "No snapshots yet",
  },
  view: {
    notFoundBefore: "404 — Snapshot ",
    notFoundAfter: " not found.",
    moreActions: "More actions",
    deleteFailed: "Failed to delete the snapshot",
    renderError: "This content could not be displayed.",
  },
  themeSelect: {
    label: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  fontSelect: {
    search: "Search fonts",
    listLabel: "Fonts",
    noMatches: "No matches",
    systemPreset: "System",
  },
  fileDoc: {
    errors: {
      not_found: "File not found (it may have been deleted).",
      not_regular_file: "Not a regular file, so it cannot be displayed.",
      permission_denied: "No permission to read the file.",
      too_large: "File is too large to display (limit: 2 MiB).",
      not_text: "Cannot be displayed as text (binary / non-UTF-8).",
      missing_path: "No path specified.",
      network: "Failed to load (cannot reach the server).",
      error: "Failed to load.",
    },
  },
  diff: {
    unparsable: "The diff could not be displayed (the patch could not be parsed).",
    fileFailed: "This diff could not be displayed.",
    unassignedComments: (count: number) =>
      `${count} comment${count === 1 ? "" : "s"} could not be displayed (no file given, or the filename does not match the patch).`,
  },
};

export type Messages = typeof en;

const ja: Messages = {
  common: {
    delete: "削除",
    backToHome: "ホームへ戻る",
    copy: "コピー",
    copied: "コピーしました",
    copyCode: "コードをコピー",
    loading: "読み込み中…",
  },
  home: {
    intro:
      "syokan（召喚）は動詞。LLM がリッチな UI を召喚する — JSON を唱えると、構造化された view が現れる。今日の RSS、進行中の review、手元の markdown を、必要なときだけ呼び出す。JSX は書かない。view は ephemeral。",
    tabSettings: "設定",
    tabUsage: "使い方",
    theme: "テーマ",
    themeDescription: "システム設定に従うか、ライト / ダークを固定するか選べる。",
    font: "フォント",
    fontDescription: "表示フォントを Google Fonts のプリセットから検索して選べる。",
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
      "children": [
        { "type": "Heading", "props": { "text": "今日のRSS" } },
        { "type": "Text", "props": { "text": "気になった記事をここに並べる" } }
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
\`Code\` / \`Diff\` / \`MarkdownDoc\` / \`PlainText\`。各 type の props は Storybook
で確認できる。schema に合わない tree は 400 で弾かれる。`,
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
    systemPreset: "システム",
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
};

/** 起動時に 1 度だけ解決した表示言語。 */
export const lang: Lang = detectLang(browserLanguages());

export const t: Messages = lang === "ja" ? ja : en;

const FENCE = "```";

export const en = {
  common: {
    delete: "Delete",
    backToHome: "Back to home",
    copy: "Copy",
    copied: "Copied",
    copyCode: "Copy code",
    loading: "Loading…",
  },
  home: {
    introLead: "Syokan (summon) UI on the spot, without writing code.",
    introBody: "LLM-generated catalog JSON renders straight into a rich UI.",
    tabSettings: "Settings",
    tabUsage: "Usage",
    theme: "Theme",
    themeDescription: "Follow the system setting, or pin light / dark.",
    font: "Font",
    fontDescription: "Search the font presets and pick the display font.",
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
      "props": {},
      "children": [
        { "type": "Heading", "props": { "text": "Daily RSS" } },
        { "type": "Text", "props": { "body": "Articles that caught my eye" } }
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
\`Code\` / \`Diff\` / \`MarkdownDoc\` / \`PlainText\` / \`FileDoc\`. Each type's
props are listed by \`syokan catalog\` (\`GET /api/catalog\`). Trees that do not
match the schema are rejected with 400.`,
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
  share: {
    share: "Share",
    sharing: "Sharing…",
    shared: "Shared",
    successTitle: "Public link created",
    loginTitle: "Login required",
    loginBefore: "Run ",
    loginAfter: " in your terminal, then try again.",
    errorTitle: "Could not share",
    expires: (dateTime: string) => `Expires ${dateTime}`,
    unpublish: "Unpublish",
    activeShares: "Active shares",
    copyUrl: "Copy URL",
    errors: {
      materializeFailed: (path: string) =>
        `A referenced file could not be read, so nothing was published: ${path}`,
      unreachable: "Could not reach the share service.",
      network: "Could not reach the local server.",
      generic: "Failed to share.",
    },
  },
};

export type Messages = typeof en;

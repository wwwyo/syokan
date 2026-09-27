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
    usage: {
      step1Title: "1. Create a snapshot — POST /api/snapshots",
      step1Body:
        "Pass a tree of catalog types as root. The response returns an id.",
      step1Code: `curl -X POST http://localhost:5773/api/snapshots \\
  -H "content-type: application/json" \\
  -d '{
    "title": "Daily RSS",
    "root": {
      "type": "Stack",
      "props": {},
      "children": [
        { "type": "Heading", "props": { "text": "Daily RSS" } },
        { "type": "Text", "props": { "body": "Articles that caught my eye" } }
      ]
    }
  }'`,
      responseLabel: "Response:",
      responseCode: `{
  "id": "k3f9q2",
  "url": "/snapshots/k3f9q2",
  "snapshot": { "schemaVersion": 1, "id": "k3f9q2", ... }
}`,
      step2Title: "2. Open it — syokan open <id>",
      step2Body:
        "Pass the returned id to open it in the browser (the server starts automatically if it is not running). Summoned snapshots are also reachable from the menu at the top left.",
      step2Code: "syokan open k3f9q2",
      step3Title: "3. Post a tree file — syokan <tree.json>",
      step3Body:
        "A file holding a bare catalog tree is posted as a self-contained snapshot. Re-run the same command after editing the file to update the same view in place — an open view follows without a reload.",
      step3Code: "syokan ./dashboard.json",
      typesTitle: "Available types",
      typesBody:
        "Stack / Card / Heading / Text / Link / Badge / Time / Code / Diff / Mermaid. Each type's props are listed by syokan catalog (GET /api/catalog). Trees that do not match the schema are rejected with 400.",
    },
  },
  shell: {
    listError: "Failed to load the snapshot list.",
    reload: "Reload",
    pageNotFound: "Page not found.",
    sidebarLabel: "Snapshots",
    settings: "Settings",
    close: "Close",
    emptyList: "No snapshots yet",
  },
  view: {
    notFoundBefore: "404 — Snapshot ",
    notFoundAfter: " not found.",
    moreActions: "More actions",
    deleteFailed: "Failed to delete the snapshot",
    renderError: "This content could not be displayed.",
    showJson: "Show source JSON",
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
  headingMinimap: {
    label: "Page outline",
  },
  checklist: {
    writebackFailed:
      "Could not save the check — the snapshot may have been updated or deleted. The change was reverted.",
  },
  mermaid: {
    renderFailed: "This diagram could not be rendered.",
    expand: "Expand diagram",
  },
  graph: {
    added: "added",
    removed: "removed",
    // kept for backward compatibility with already-posted envelopes; unused as a legend
    // entry (hotspot renders and reads as "changed" — see catalogs/Graph/index.tsx).
    hotspot: "changed",
    changed: "changed",
    neutral: "unchanged",
    group: "boundary",
    edge: "arrow: dependent → dependency",
    clickable: "↗ opens its detail",
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
      unreachable: "Could not reach the share service.",
      network: "Could not reach the local server.",
      generic: "Failed to share.",
    },
  },
};

export type Messages = typeof en;

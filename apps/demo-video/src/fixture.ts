/**
 * Synthetic-but-plausible demo data (PRD constraint: no Lorem ipsum, no real
 * third-party info). One source of truth for both the terminal JSON stream
 * and the browser view, so the incantation visibly matches what appears.
 */

export const userPrompt = "Show my PR review queue in syokan";

export type DemoPr = {
  title: string;
  repoLine: string;
  badge: { text: string; variant: "default" | "destructive" | "outline" };
  summary: string;
};

export const prs: DemoPr[] = [
  {
    title: "feat(api): cursor-based pagination for /events",
    repoLine: "acme/edge-gateway #482 · opened 2 days ago",
    badge: { text: "changes requested", variant: "destructive" },
    summary:
      "Replaces offset pagination with opaque cursors. Two comments on cursor invalidation are waiting for your reply.",
  },
  {
    title: "fix(worker): drain retry queue before deploy swap",
    repoLine: "acme/edge-gateway #479 · opened 3 days ago",
    badge: { text: "approved", variant: "default" },
    summary:
      "Deploys no longer drop in-flight retries. Approved by two reviewers — ready to merge after CI.",
  },
  {
    title: "docs(runbook): rotate on-call onboarding steps",
    repoLine: "acme/platform-docs #91 · opened 5 hours ago",
    badge: { text: "waiting on you", variant: "outline" },
    summary:
      "Small diff, but it changes the escalation order. You are the only requested reviewer.",
  },
];

export const viewTitle = "PR review queue — Jul 7";

/** Diff shown inside the first PR card (catalog `Diff`, unified). */
export const diff = {
  fileName: "src/api/pagination.ts",
  hunkHeader: "@@ -41,7 +41,9 @@ export async function listEvents(query: EventQuery) {",
  lines: [
    { kind: "context", oldNo: 41, newNo: 41, text: "  const limit = clampLimit(query.limit);" },
    { kind: "removed", oldNo: 42, text: "  const offset = query.page * limit;" },
    { kind: "removed", oldNo: 43, text: "  const rows = await db.events.range(offset, limit);" },
    { kind: "added", newNo: 42, text: "  const cursor = decodeCursor(query.cursor);" },
    { kind: "added", newNo: 43, text: "  const rows = await db.events.after(cursor, limit);" },
    { kind: "added", newNo: 44, text: "  const next = rows.length === limit ? encodeCursor(rows.at(-1)) : null;" },
    { kind: "context", oldNo: 44, newNo: 45, text: "  return { rows, next };" },
  ],
  comment: {
    author: "wwwyo",
    body: "Cursor must survive log compaction — encode the event id, not the raw position.",
    afterLineIndex: 3, // rendered under the first added line
  },
} as const;

/** Dependency sketch shown inside the first PR card (catalog `Graph`). */
export const graph = {
  caption: "pagination path — offset scan replaced by cursor codec",
  // Positions are precomputed for the video (the real component lays out automatically).
  nodes: [
    { id: "client-sdk", label: "client-sdk", role: "neutral" },
    { id: "events-api", label: "events-api", role: "hotspot" },
    { id: "offset-paginator", label: "offset-paginator", role: "removed" },
    { id: "cursor-codec", label: "cursor-codec", role: "added" },
  ],
  edges: [
    { from: "client-sdk", to: "events-api", role: "neutral" },
    { from: "events-api", to: "offset-paginator", role: "removed" },
    { from: "events-api", to: "cursor-codec", role: "added" },
  ],
} as const;

/** The envelope streamed in the terminal scene, abridged to stay legible on a phone. */
export const envelopeLines: string[] = [
  `{`,
  `  "title": "${viewTitle}",`,
  `  "root": {`,
  `    "type": "Stack",`,
  `    "children": [`,
  `      { "type": "Heading", "props": { "text": "${viewTitle}", "level": 1 } },`,
  `      { "type": "Card", "children": [`,
  `        { "type": "Heading", "props": { "text": "${prs[0]!.title}", "level": 3 } },`,
  `        { "type": "Badge", "props": { "text": "changes requested", "variant": "destructive" } },`,
  `        { "type": "Diff", "props": { "patch": "diff --git a/${diff.fileName} …", "comments": [`,
  `          { "side": "new", "line": 42, "body": "${diff.comment.body}", "author": "wwwyo" } ] } },`,
  `        { "type": "Graph", "props": { "nodes": [ { "id": "events-api", "role": "hotspot" },`,
  `          { "id": "cursor-codec", "role": "added" }, { "id": "offset-paginator", "role": "removed" } … ] } },`,
  `      ] },`,
  `      { "type": "Card", "children": [`,
  `        { "type": "Heading", "props": { "text": "${prs[1]!.title}", "level": 3 } },`,
  `        { "type": "Badge", "props": { "text": "approved" } },`,
  `      ] },`,
  `    ]`,
  `  }`,
  `}`,
];

export const viewUrl = "http://localhost:5173/view/pr-review-queue";
export const installCommand = "mise use -g github:wwwyo/syokan@latest";
export const repoUrl = "github.com/wwwyo/syokan";

// Per-device UI state (collapse, checks, probe results) kept apart from snapshot data.
// The ephemeral principle forbids persisting snapshot *data*; interaction state is
// endpoint-local, so losing it loses only progress marks, never data.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

type ViewStateContextValue = {
  // null = no persistence scope (e.g. Storybook, previews): state stays in memory only
  scopeKey: string | null;
  // true when rendered on the public share viewer (read-only capabilities like Probe rerun are gated)
  shared: boolean;
};

const ViewStateContext = createContext<ViewStateContextValue>({
  scopeKey: null,
  shared: false,
});

export function ViewStateProvider({
  scopeKey,
  shared = false,
  children,
}: {
  scopeKey: string;
  shared?: boolean;
  children?: ReactNode;
}) {
  return (
    <ViewStateContext.Provider value={{ scopeKey, shared }}>
      {children}
    </ViewStateContext.Provider>
  );
}

export function useSharedView(): boolean {
  return useContext(ViewStateContext).shared;
}

// djb2. Identity of persisted state is (node id, content hash): when content under the
// same id changes, stale progress marks must not carry over.
export function hashContent(value: unknown): string {
  const s = JSON.stringify(value) ?? "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// identity of the node currently being rendered (set by Render for nodes carrying an id).
// hash covers the whole item (props + children) so any content change invalidates state.
type NodeMeta = { id: string; hash: string };

const NodeMetaContext = createContext<NodeMeta | null>(null);

export function NodeMetaProvider({
  meta,
  children,
}: {
  meta: NodeMeta;
  children?: ReactNode;
}) {
  return (
    <NodeMetaContext.Provider value={meta}>{children}</NodeMetaContext.Provider>
  );
}

type StoredEntry = { h: string; v: unknown };

// facet separates state kinds sharing one node id (e.g. "open" vs "checks")
function storageKey(scopeKey: string, nodeId: string, facet: string): string {
  return `syokan:ui:${scopeKey}:${nodeId}:${facet}`;
}

function readStored(key: string, contentHash: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    const entry = JSON.parse(raw) as StoredEntry;
    if (entry.h !== contentHash) return undefined;
    return entry.v;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, contentHash: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ h: contentHash, v: value }));
  } catch {
    // quota / privacy mode: silently degrade to in-memory state
  }
}

/**
 * UI state for the enclosing catalog node, persisted per device+view. Nodes without
 * an id (or outside a ViewStateProvider) still work but the state does not survive
 * a reload — persistence requires an addressable identity.
 */
export function useNodeUiState<T>(
  facet: string,
  initial: T,
): [T, (value: T) => void] {
  const { scopeKey } = useContext(ViewStateContext);
  const meta = useContext(NodeMetaContext);
  const key =
    scopeKey !== null && meta !== null
      ? storageKey(scopeKey, meta.id, facet)
      : null;
  const hash = meta?.hash ?? "";
  const [value, setValue] = useState<T>(() => {
    if (key === null) return initial;
    const stored = readStored(key, hash);
    return stored === undefined ? initial : (stored as T);
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (key !== null) writeStored(key, hash, next);
    },
    [key, hash],
  );
  return [value, update];
}

// In-view anchor navigation. Nodes carrying an id render a [data-node-id] wrapper
// (see Render). Ancestors that can hide a node (Collapsible, checked-collapsed
// Checklist items, TagFilter-hidden wrappers) register a reveal callback here and
// mark their DOM wrapper with [data-reveal=<uid>]; navigation walks the ancestor
// chain and reveals outermost-first, so the target becomes visible without
// changing persistent settings (the filter selection itself is untouched —
// hidden wrappers reveal via a transient force-show).

const revealRegistry = new Map<string, () => void>();

export function registerReveal(uid: string, reveal: () => void): () => void {
  revealRegistry.set(uid, reveal);
  return () => {
    revealRegistry.delete(uid);
  };
}

export const ANCHOR_FLASH_CLASS = "anchor-flash";
const FLASH_DURATION_MS = 1600;
// after reveals trigger React re-renders; a frame is not enough for state flushes
const SETTLE_MS = 80;

function flash(el: Element): void {
  el.classList.remove(ANCHOR_FLASH_CLASS);
  // restart the animation when navigating to the same node twice
  void (el as HTMLElement).offsetWidth;
  el.classList.add(ANCHOR_FLASH_CLASS);
  window.setTimeout(
    () => el.classList.remove(ANCHOR_FLASH_CLASS),
    FLASH_DURATION_MS,
  );
}

function scrollAndFlash(wrapper: Element): void {
  // the [data-node-id] wrapper is display:contents (no box); use its first child's box
  const box = wrapper.firstElementChild ?? wrapper;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  flash(box);
}

/** Navigate to the node carrying the given id. Returns false when no such node exists. */
export function navigateToNode(nodeId: string): boolean {
  const target = document.querySelector(
    `[data-node-id="${CSS.escape(nodeId)}"]`,
  );
  if (target === null) return false;
  const reveals: string[] = [];
  for (let el: Element | null = target; el !== null; el = el.parentElement) {
    const uid = el.getAttribute("data-reveal");
    if (uid !== null) reveals.push(uid);
  }
  if (reveals.length === 0) {
    scrollAndFlash(target);
    return true;
  }
  for (const uid of reveals.reverse()) {
    revealRegistry.get(uid)?.();
  }
  window.setTimeout(() => scrollAndFlash(target), SETTLE_MS);
  return true;
}

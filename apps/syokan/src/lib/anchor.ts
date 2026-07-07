// In-view anchor navigation. Nodes carrying an id render a [data-node-id] wrapper
// (see Render). Ancestors that can hide a node (Collapsible, checked-collapsed
// Checklist items, TagFilter-hidden wrappers) register a reveal callback here and
// mark their DOM wrapper with [data-reveal=<uid>]; navigation walks the ancestor
// chain and reveals outermost-first, so the target becomes visible without
// changing persistent settings (the filter selection itself is untouched —
// hidden wrappers reveal via a transient force-show).

import { useEffect, useId, useRef } from "react";

const revealRegistry = new Map<string, () => void>();

export function registerReveal(uid: string, reveal: () => void): () => void {
  revealRegistry.set(uid, reveal);
  return () => {
    revealRegistry.delete(uid);
  };
}

/**
 * Register `onReveal` to run when anchor navigation reaches a node hidden inside this
 * container, and return the id to spread as `data-reveal` on the wrapper (or undefined
 * when not hidden). One place for the subscribe-while-hidden lifecycle shared by every
 * container that can hide a descendant (Collapsible, Checklist, TagFilter wrapper).
 */
export function useReveal(
  hidden: boolean,
  onReveal: () => void,
): string | undefined {
  const uid = useId();
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  useEffect(() => {
    if (!hidden) return;
    return registerReveal(uid, () => onRevealRef.current());
  }, [hidden, uid]);
  return hidden ? uid : undefined;
}

export const ANCHOR_FLASH_CLASS = "anchor-flash";
const FLASH_DURATION_MS = 1600;

// Run after the reveals' React commit has painted, so the target is laid out before we
// scroll. Two rAFs: the first lands after React flushes the state updates, the second
// after the browser has laid the revealed subtree out. Robust to render depth, unlike a
// fixed delay.
function afterReveal(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

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
  afterReveal(() => scrollAndFlash(target));
  return true;
}

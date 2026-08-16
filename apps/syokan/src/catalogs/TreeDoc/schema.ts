import { z } from "zod";
import { absoluteLocalPath } from "../../lib/path";

/**
 * Kept in its own leaf module, apart from the component, to survive an import cycle.
 *
 * TreeDoc is the one catalog component that renders a subtree, so it imports `Render`, which
 * imports the catalog registry, which imports TreeDoc: `catalogs/index → TreeDoc → Render →
 * catalogs/index`. Whichever module the bundler enters first finishes last, so entering through
 * TreeDoc (a story, a test, a lazy chunk) runs the registry's top-level `entries` array while
 * TreeDoc's own body is still mid-evaluation.
 *
 * `TreeDoc` itself is a function declaration and is hoisted, so reading it mid-cycle is fine.
 * A `const` schema is not — it sits in the temporal dead zone and throws "Cannot access
 * 'treeDocPropsSchema' before initialization". This module imports nothing from the cycle, so it
 * is always fully evaluated by the time the registry reads it.
 *
 * The corollary: `TreeDoc` must stay a function declaration. Rewriting it as `const TreeDoc = ...`
 * puts the component back in the dead zone and breaks the same way — the "import cycle" test in
 * TreeDoc.test.tsx fails on exactly that, so the constraint is checked rather than merely written
 * down here.
 *
 * A second catalog component that renders a subtree would import `Render` and close the same cycle,
 * and would need the same split. If a third shows up, stop repeating this and make the registry
 * build its entries lazily instead, so module evaluation order stops mattering at all.
 */
export const treeDocPropsSchema = z
  .object({
    // The CLI resolves this to an absolute local path before passing it. The server reads and
    // watches this path as-is; relative paths and URLs are rejected at ingest.
    path: absoluteLocalPath,
  })
  .strict();

export type TreeDocProps = z.infer<typeof treeDocPropsSchema>;

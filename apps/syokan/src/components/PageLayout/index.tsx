import type { ReactNode } from "react";

export type PageLayoutProps = {
  /**
   * Viewer chrome placed outside the body (e.g. ViewHeader).
   * Not part of the schema-driven render tree; injected from the viewer side.
   */
  header?: ReactNode;
  /**
   * Drop the width constraint (max-w-4xl) and expand to the full viewport.
   * Set to true from the viewer side when the root uses the whole screen, like a resizable Stack.
   */
  fullBleed?: boolean;
  children?: ReactNode;
};

/**
 * The per-route layout wrapping the body of snapshot / home. Rendered inside the content column
 * of the resident shell (AppShell), it composes the header and the body main. Background,
 * sidebar, and open/closed state are the shell's responsibility. The container carries no
 * heading (the root markdown etc. brings its own, so a duplicate heading is avoided).
 *
 * Normal pages defer to document(window) scrolling. The header sticks to the top edge so the
 * sidebar toggle stays reachable after scrolling.
 * fullBleed (resizable Stack etc.) is pinned to the viewport height and passes the height down
 * to the inner panel, killing document scrolling.
 */
export function PageLayout({
  header,
  fullBleed = false,
  children,
}: PageLayoutProps) {
  if (fullBleed) {
    return (
      <div data-slot="page-layout" className="flex h-svh flex-col">
        {header}
        <main
          data-slot="page-main"
          className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4"
        >
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div data-slot="page-layout" className="flex flex-1 flex-col">
      {header ? <div className="sticky top-0 z-20">{header}</div> : null}
      <main data-slot="page-main" className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-6 py-12">{children}</div>
      </main>
    </div>
  );
}

import { useEffect } from "react";

// Duplicated in index.html's <title> on purpose: that one must render before any JS loads,
// and the HTML entry cannot import from here. Rename both together.
const APP_NAME = "syokan";

/** "<view title> | syokan"; an absent / blank title falls back to the bare app name. */
export function formatDocumentTitle(title?: string): string {
  const trimmed = title?.trim();
  return trimmed ? `${trimmed} | ${APP_NAME}` : APP_NAME;
}

/**
 * Reflects a view's title in the tab title, restoring the bare app name on unmount so
 * routes that set no title (home / error) never inherit the previous view's title.
 */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);
  // Reset is a separate mount-scoped effect so a title change does not run it: keeping it in the
  // [title] effect's cleanup would write the app name on every update just to overwrite it again.
  useEffect(() => {
    return () => {
      document.title = APP_NAME;
    };
  }, []);
}

import { useEffect } from "react";

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
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}

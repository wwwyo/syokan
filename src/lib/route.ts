const VIEW_PATH = /^\/views\/([^/]+)\/?$/;

export function matchViewId(pathname: string): string | null {
  const match = VIEW_PATH.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // malformed percent-encoding (例: /views/%E0%A4) は URIError を投げる。
    // crash させず「該当なし」にフォールバックする。
    return null;
  }
}

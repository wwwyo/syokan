// The localhost server is only hit by the same-origin app and by Origin-less CLI/curl.
// Any page living on another origin — including another localhost port — must not be
// able to drive a mutation from a browser (CSRF), so compare the Origin's authority
// against the request's own URL authority (same origin means same host:port).
// A malformed Origin ("null" etc.) counts as foreign.
export function crossOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  try {
    return (
      new URL(origin).host.toLowerCase() !== new URL(req.url).host.toLowerCase()
    );
  } catch {
    return true;
  }
}

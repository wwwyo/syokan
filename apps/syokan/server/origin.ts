// The localhost server is only hit by the same-origin app and by header-less
// CLI/curl. Any page living on another origin — including another localhost port —
// must not be able to drive a mutation from a browser (CSRF), so compare the
// Origin/Referer authority against the request's own URL authority (same origin
// means same host:port). The judgment applies only when one of those headers
// exists — CLI/curl send neither, and rejecting header-less requests would break
// the ingest path. A malformed value ("null" etc.) counts as foreign.
export function crossOrigin(req: Request): boolean {
  const authority = new URL(req.url).host.toLowerCase();
  for (const name of ["origin", "referer"] as const) {
    const value = req.headers.get(name);
    if (value === null) continue;
    try {
      if (new URL(value).host.toLowerCase() !== authority) return true;
    } catch {
      return true;
    }
  }
  return false;
}

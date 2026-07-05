// Format to "YYYY-MM-DD HH:mm" in the viewer's local TZ.
// The machine-readable UTC is assumed to stay in the caller's <time dateTime>.
//
// Build via Intl.formatToParts to pin separators, digits, and the time system
// locale-independently (delegating TZ/DST conversion to Intl rather than
// hand-rolled getHours()+padStart). en-CA emits year/month/day as 2-digit
// cleanly, and hourCycle "h23" pins to 00–23 (avoiding locales where midnight
// becomes "24:xx"). The formatter has a creation cost, so it is built once at
// module scope.
const dateTimeFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts: Record<string, string> = {};
  for (const { type, value } of dateTimeFormat.formatToParts(date)) {
    parts[type] = value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

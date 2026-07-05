// 閲覧者のローカル TZ で "YYYY-MM-DD HH:mm" に整形する。
// 機械可読な UTC は呼び出し側の <time dateTime> に残す前提。
//
// 区切り・桁・時刻系を locale 非依存に固定したいので Intl.formatToParts で
// 組み立てる (手書きの getHours()+padStart より TZ/DST 変換を Intl に委ねられる)。
// en-CA は year/month/day を 2-digit で素直に出し、hourCycle "h23" で 00–23 に
// 固定する (midnight が "24:xx" になる locale 差を避ける)。formatter は生成コスト
// があるので module スコープで 1 度だけ作る。
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

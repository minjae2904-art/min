// Night-shift day: wake 13:00, sleep 05:00. Anything before ROLLOVER_HOUR belongs to the previous day,
// so 02:30 gym and 04:00 meal count toward "today" instead of tomorrow.
export const ROLLOVER_HOUR = 8;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function logicalDate(now = new Date()): string {
  return ymd(new Date(now.getTime() - ROLLOVER_HOUR * 3600_000));
}

// Minutes since 00:00 of the logical day; after midnight continues past 1440 (02:00 -> 1560).
export function logicalMinutes(now = new Date()): number {
  const m = now.getHours() * 60 + now.getMinutes();
  return now.getHours() < ROLLOVER_HOUR ? m + 1440 : m;
}

export const hm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const at = (h: number, m = 0) => (h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m;

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export const THAI_DATE = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });

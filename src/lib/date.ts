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

// Server routes run in UTC; build a Date whose local fields read as Bangkok wall-clock time.
export const TZ = "Asia/Bangkok";
export const wallClock = (tz = TZ) => new Date(new Date().toLocaleString("en-US", { timeZone: tz }));

// Minutes the zone is ahead of UTC at noon UTC of `date` (America/New_York: EDT -240, EST -300).
function zoneOffset(date: string, tz: string): number {
  const u = new Date(date + "T12:00:00Z");
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(u).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - u.getTime()) / 60000);
}
// 0 while New York is on EDT, 60 on EST. Pure; identical on the UTC server and the phone. Missing date or Intl failure -> 0.
export function sessionDelta(date: string | undefined, s: "ny"): number {
  if (!date) return 0;
  try { const d = -240 - zoneOffset(date, { ny: "America/New_York" }[s]); return d === 0 || d === 60 ? d : 0; } catch { return 0; }
}

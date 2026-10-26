// Step cadence: one compact string evaluated on the logical date (pure, no model import).
// d = daily, h = hot/outdoor days, w:1,3,5 = weekdays (0 = Sunday), e:N@start = every N days, r@start = ramp (retinoid start).
import { fmt, msgs } from "../../i18n";
import * as M from "../../i18n/msg/lib-care";

const m = msgs(M);
export const CAD_RE = /^(d|h|w:[0-6](,[0-6]){0,6}|e:([2-9]|[1-9]\d)@\d{4}-\d{2}-\d{2}|r@\d{4}-\d{2}-\d{2})$/;
export type Cad = { t: "d" } | { t: "h" } | { t: "w"; days: number[] } | { t: "e"; n: number; from: string } | { t: "r"; from: string };

export function parseCad(s?: string): Cad {
  if (!s || !CAD_RE.test(s)) return { t: "d" };
  if (s === "d") return { t: "d" };
  if (s === "h") return { t: "h" };
  if (s.startsWith("w:")) return { t: "w", days: [...new Set(s.slice(2).split(",").map(Number))].sort((a, b) => a - b) };
  if (s.startsWith("e:")) { const [n, from] = s.slice(2).split("@"); return { t: "e", n: Number(n), from }; }
  return { t: "r", from: s.slice(2) };
}

// Whole days from a to b; noon UTC on both sides (same rule as taperShift), so phone and server agree.
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

// Ramp: every 3rd night for 2 weeks, every 2nd night for 2 more weeks, then nightly. 0 = not started yet.
export function rampStage(from: string, date: string): 0 | 1 | 2 | 3 {
  const k = daysBetween(from, date);
  return k < 0 ? 0 : k < 14 ? 1 : k < 28 ? 2 : 3;
}

export function cadDue(cad: string | undefined, date: string, hot: boolean): boolean {
  const c = parseCad(cad);
  switch (c.t) {
    case "d": return true;
    case "h": return hot;
    case "w": return c.days.includes(new Date(date + "T12:00:00").getDay());
    case "e": { const k = daysBetween(c.from, date); return k >= 0 && k % c.n === 0; }
    case "r": {
      const k = daysBetween(c.from, date);
      if (k < 0) return false;
      if (k < 14) return k % 3 === 0;
      if (k < 28) return (k - 14) % 2 === 0;
      return true;
    }
  }
}

export function cadLabel(cad?: string): string {
  const c = parseCad(cad);
  switch (c.t) {
    case "d": return m("cadence.daily");
    case "h": return m("cadence.hot");
    case "w": return c.days.length === 7 ? m("cadence.daily") : c.days.map((d) => fmt.dowShort(d)).join("/");
    case "e": return c.n === 2 ? m("cadence.alt") : m("cadence.everyN", { n: c.n });
    case "r": return m("cadence.ramp");
  }
}

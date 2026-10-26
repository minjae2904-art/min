// v1.8 consistency bands (pure): rolling x/7 and x/28 days per habit/area. A miss never resets anything;
// rest, sick and not-planned days are "off" and do not count. The old streak() stays for badges only.
import { langObj, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-7";
import type { AreaKey } from "./brain/types";
import { kgAtFn } from "./brain/signals";
import { addDays } from "./date";
import type { DayLog, State } from "./model";
import { itemsFor, type Item } from "./schedule";
import { dayScore, sleepHours, waterGoal } from "./stats";

const m = msgs(M);

export type BandKey = "day" | "sleep" | "water" | "gym" | "live" | "voice";
export type Cell = "hit" | "miss" | "off" | "none" | "today";
export type Band = { key: BandKey; cells: Cell[] /* oldest first, last = today */; hit: number; elig: number };
export const BAND_KEYS: BandKey[] = ["day", "sleep", "water", "gym", "live", "voice"];
export const BAND_LABEL: Record<BandKey, string> = langObj(() => ({
  day: m("bands.label.day"), sleep: m("bands.label.sleep"), water: m("bands.label.water"),
  gym: m("bands.label.gym"), live: m("bands.label.live"), voice: m("bands.label.voice"),
}));
export const BAND_AREA: Record<BandKey, AreaKey | "water"> = { day: "consistency", sleep: "sleep", water: "water", gym: "training", live: "leisure", voice: "voice" };
export const AREA_BAND: Partial<Record<AreaKey, BandKey>> = { sleep: "sleep", nutrition: "water", training: "gym", voice: "voice", leisure: "live", consistency: "day" };

type Ctx = { s: State; first: string | undefined; kgAt: (date: string) => number };
const ctxOf = (s: State): Ctx => ({ s, first: Object.keys(s.days).sort()[0], kgAt: kgAtFn(s) });

// One key of one logged past (or today's) day. `items` is computed lazily, at most once per date.
function cellOf(c: Ctx, date: string, d: DayLog, key: BandKey, items: () => Item[]): Cell {
  const s = c.s;
  if (Array.isArray(d.sym) && d.sym.includes("sick")) return "off";
  const why = (id: string) => (d.skipWhy && typeof d.skipWhy === "object" ? d.skipWhy[id] : undefined);
  switch (key) {
    case "day": return dayScore(s, d) >= s.settings.goodDay ? "hit" : "miss";
    case "sleep": { const h = sleepHours(s, date); return h === null ? "none" : h >= 7 ? "hit" : "miss"; }
    case "water": return (d.waterMl || 0) >= waterGoal(s, d, c.kgAt(date)) ? "hit" : "miss";
    case "gym": {
      const w = why("gym");
      if (!items().some((i) => i.id === "gym") || w === "rest" || w === "sick" || w === "travel" || w === "na") return "off";
      return d.done?.gym || s.workouts.some((x) => x.date === date && x.code.startsWith("D")) ? "hit" : "miss";
    }
    case "live": {
      const w = why("stream");
      if (!items().some((i) => i.id === "stream") || w === "travel" || w === "na") return "off";
      const lv = d.live && typeof d.live === "object" && typeof d.live.min === "number" && d.live.min > 0;
      return d.done?.stream || lv ? "hit" : "miss";
    }
    case "voice": {
      const sing = items().filter((i) => i.kind === "sing");
      if (!sing.length || d.voiceRest) return "off";
      return sing.some((i) => d.done?.[i.id]) ? "hit" : "miss";
    }
  }
}

function cellsAt(c: Ctx, date: string, today: string, keys: BandKey[]): Record<BandKey, Cell> {
  const out = {} as Record<BandKey, Cell>;
  const d = c.s.days[date];
  const none = !d || !c.first || date < c.first;
  let memo: Item[] | null = null;
  const items = () => (memo ??= itemsFor(c.s.schedule, d!, date));
  for (const k of keys) {
    if (none) { out[k] = date === today ? "today" : "none"; continue; }
    const v = cellOf(c, date, d, k, items);
    // Today: a hit counts right away, anything else is still open (not counted). Off stays off.
    out[k] = date === today && v !== "hit" && v !== "off" ? "today" : v;
  }
  return out;
}

const tally = (key: BandKey, cells: Cell[]): Band => {
  const hit = cells.filter((x) => x === "hit").length;
  return { key, cells, hit, elig: hit + cells.filter((x) => x === "miss").length };
};

// Every key for the last n days, oldest first (itemsFor once per date).
export function bandMatrix(s: State, today: string, n: 7 | 28 = 28): Record<BandKey, Cell[]> {
  const c = ctxOf(s);
  const m = Object.fromEntries(BAND_KEYS.map((k) => [k, [] as Cell[]])) as Record<BandKey, Cell[]>;
  for (let i = n - 1; i >= 0; i--) {
    const row = cellsAt(c, addDays(today, -i), today, BAND_KEYS);
    for (const k of BAND_KEYS) m[k].push(row[k]);
  }
  return m;
}

export function band(s: State, today: string, key: BandKey, n: 7 | 28 = 7): Band {
  const c = ctxOf(s);
  return tally(key, Array.from({ length: n }, (_, i) => cellsAt(c, addDays(today, i - n + 1), today, [key])[key]));
}

// Keys with any eligible day in 28 days, each with its 7- and 28-day band, from one matrix.
export function bandRows(s: State, today: string): { key: BandKey; b7: Band; b28: Band }[] {
  const m = bandMatrix(s, today, 28);
  return BAND_KEYS.map((key) => ({ key, b7: tally(key, m[key].slice(-7)), b28: tally(key, m[key]) })).filter((r) => r.b28.elig > 0);
}

export const bandText = (b: Band) => (b.elig ? m("bands.text", { hit: b.hit, elig: b.elig }) : m("bands.empty"));

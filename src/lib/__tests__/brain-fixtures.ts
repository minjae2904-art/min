// Fixture builder for the brain tests (not collected: no .test.ts suffix). TZ is pinned by tz.ts.
import { addDays } from "../date";
import { normalize, type DayLog, type State, type TradeResult } from "../model";
import { itemsFor } from "../schedule";
import { waterGoal } from "../stats";

export const TODAY = "2026-10-20"; // Tuesday
export const NOJOB = ["rest", "balanced", "game-max", "mc-build", "balanced", "game-max", "mc-build"]; // index = getDay()
export const dowOf = (date: string) => new Date(date + "T12:00:00").getDay();
export const tsAt = (date: string, min: number) => new Date(date + "T00:00:00+07:00").getTime() + min * 60_000;

export type DayOpt = {
  tpl?: string; skip?: boolean; meal2?: "A" | "B" | "C";
  ticks?: "all" | "none" | string[]; // which ring items are done
  untick?: string[]; late?: Record<string, number>; // minutes after the planned time
  sleepH?: number | null; bedLate?: number | null; // bedLate null = no "เข้านอน" press
  checkin?: [number, number, number] | null; // energy, mood, sleep quality
  water?: "goal" | number; trade?: { count: number; result: TradeResult } | null;
  gameOver?: unknown; sing?: unknown; voiceRest?: boolean; gymCode?: string;
};

// n logged days ending `today`; f gives per-day options. Weights rise 0.25 kg/week from 67 kg unless `kg` is given.
export function build(n: number, f: (date: string, i: number) => DayOpt = () => ({}), opt: { today?: string; kg?: ((i: number) => number) | null; extra?: (s: State) => void } = {}): State {
  const today = opt.today ?? TODAY;
  const s = normalize({});
  opt.extra?.(s);
  let gym = 0;
  for (let i = 0; i < n; i++) {
    const date = addDays(today, i - n + 1);
    const o = f(date, i);
    const kgf = opt.kg === undefined ? (k: number) => 67 + (k * 0.25) / 7 : opt.kg;
    if (kgf) s.weights.push({ date, kg: Math.round(kgf(i) * 1000) / 1000 });
    if (o.skip) continue;
    const d: DayLog = { type: o.tpl ?? NOJOB[dowOf(date)], done: {}, waterMl: 0 };
    if (o.meal2) d.meal2 = o.meal2;
    if (o.voiceRest) d.voiceRest = true;
    const items = itemsFor(s.schedule, d, date).filter((x) => x.ring);
    const want = o.ticks ?? "all";
    for (const it of items) {
      if (want === "none" || (Array.isArray(want) && !want.includes(it.id)) || o.untick?.includes(it.id)) continue;
      if (it.kind === "sleep" && o.bedLate === null) continue;
      d.done[it.id] = tsAt(date, it.min + (o.late?.[it.id] ?? 0));
      if (it.id === "gym") s.workouts.push({ date, code: o.gymCode ?? ["D1", "D2", "D3", "D4"][gym++ % 4] });
    }
    const sleepMin = items.find((x) => x.kind === "sleep")?.min;
    if (o.bedLate !== null && sleepMin !== undefined && want !== "none") { d.sleepAt = tsAt(date, sleepMin + (o.bedLate ?? 0)); d.done.sleep = d.sleepAt; }
    const prev = s.days[addDays(date, -1)];
    const wakeMin = items.find((x) => x.id === "weigh")?.min ?? 780;
    if (o.sleepH !== null) d.wakeAt = prev?.sleepAt ? prev.sleepAt + (o.sleepH ?? 8) * 3_600_000 : tsAt(date, wakeMin);
    if (o.checkin !== null) { const c = o.checkin ?? [5, 5, 5]; d.checkin = { energy: c[0], mood: c[1], sleep: c[2] }; }
    if (o.trade !== null && (o.trade || items.some((x) => x.kind === "trade"))) d.trade = o.trade ?? { count: 1, result: "win" };
    if (o.gameOver !== undefined) (d as Record<string, unknown>).gameOver = o.gameOver;
    if (o.sing !== undefined) (d as Record<string, unknown>).sing = o.sing;
    s.days[date] = d;
    d.waterMl = o.water === undefined || o.water === "goal" ? waterGoal(s, d, 70) + 500 : o.water;
  }
  s.settings.weekPlan = [...NOJOB];
  return s;
}

// A good month: nojob week, everything on time, 8 h sleep, top check-ins, water met, 1 trade per trade day.
export const perfect = (n = 35) => build(n);

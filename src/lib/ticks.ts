// Tick timing quality (pure): late-tick detection, batch (back-filled) detection and per-tick trust.
// Same fixed +07:00 rule as signals and stats (Bangkok has no DST), so the server computes the same values.
import type { DayLog, TickSrc } from "./model";

export const LATE_ASK_MIN = 60; // a tick this many minutes after the planned time gets the "when did you do it?" ask
export const BATCH = { gapMs: 120_000, minTicks: 3, spanMin: 120 } as const; // mirrored in brain T
const SRCS: readonly string[] = ["late", "plan", "now", "pick"];

export const planEpoch = (date: string, min: number) => Date.parse(date + "T00:00:00+07:00") + min * 60_000;
export const isLateTick = (date: string, min: number, ts: number) => (ts - planEpoch(date, min)) / 60_000 > LATE_ASK_MIN;
// Kinds whose time comes from their own buttons (bedtime, weigh-in): never asked, never batch-checked.
export const untimedKind = (kind: string) => kind === "sleep" || kind === "weigh";
// A tick right now would get the late-tick ask (tap handlers).
export const isLateNow = (date: string, item: { min: number; kind: string }) => !untimedKind(item.kind) && isLateTick(date, item.min, Date.now());

// The stored source of a tick, valid only while its ts still equals the tick (a newer tick or a rewrite voids it).
export function srcOf(day: Pick<DayLog, "done" | "doneSrc"> | undefined, id: string): TickSrc | null {
  const e = day?.doneSrc?.[id];
  return e && typeof e === "object" && e.ts === day!.done[id] && SRCS.includes(e.src) ? e.src : null;
}

export function clearSrc(d: DayLog, id: string) {
  if (!d.doneSrc) return;
  delete d.doneSrc[id];
  if (!Object.keys(d.doneSrc).length) delete d.doneSrc;
}

// Ids ticked in a burst: at least minTicks ticks within gapMs of each other that cover items planned spanMin+ apart.
// Confirmed ticks (plan/now/pick) are never batch; untimed kinds and ts without a real time are ignored.
// A window member within LATE_ASK_MIN of its own plan is plausible as a live tick: it still counts toward
// the window but is not flagged itself.
export function batchIds(date: string, items: { id: string; min: number; kind: string }[], done: Record<string, number>, doneSrc?: DayLog["doneSrc"]): Set<string> {
  const day = { done, doneSrc };
  const t = items
    .filter((i) => { const ts = done[i.id]; const s = srcOf(day, i.id); return typeof ts === "number" && ts > 1e12 && !untimedKind(i.kind) && (s === null || s === "late"); })
    .map((i) => ({ id: i.id, min: i.min, ts: done[i.id] }))
    .sort((a, b) => a.ts - b.ts);
  const out = new Set<string>();
  for (let a = 0, b = 0; b < t.length; b++) {
    while (t[b].ts - t[a].ts > BATCH.gapMs) a++;
    if (b - a + 1 < BATCH.minTicks) continue;
    const w = t.slice(a, b + 1), ms = w.map((x) => x.min);
    if (Math.max(...ms) - Math.min(...ms) >= BATCH.spanMin)
      for (const x of w) if (Math.abs(x.ts - planEpoch(date, x.min)) > LATE_ASK_MIN * 60_000) out.add(x.id);
  }
  return out;
}

// Trust in a tick's time: null = no real time, 0 = batch, .5 = unconfirmed late, .75 = one-tap "as planned", 1 = live/now/pick.
export function tickQ(ts: number, src: TickSrc | null, batch: boolean): number | null {
  if (!(ts > 1e12)) return null;
  if (batch) return 0;
  return src === "late" ? 0.5 : src === "plan" ? 0.75 : 1;
}

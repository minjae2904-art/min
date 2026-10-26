// "What time is it in my day?" - the current block of the night-shift day, for the big Now banner.
import { msgs } from "../i18n";
import * as M from "../i18n/msg/lib-12";
import type { DayLog, State } from "./model";
import { anchorsFor, blockEnd, fillTimes, itemsFor, resolveTemplate, type Item } from "./schedule";
import { elapsedMs, restLeft, runLabel, staleRun } from "./session";
import { classNow } from "./term";

const m = msgs(M);

export type Phase = { key: string; label: string; tip: string; color: string; start: number; end: number };

const find = (items: Item[], id: string) => items.find((i) => i.id === id)?.min;

export function phases(s: State, d: DayLog, date?: string): Phase[] {
  // Built from the plan, never the today-only reschedule: a snooze never moves the phase windows.
  const items = itemsFor(s.schedule, { type: d.type, meal2: d.meal2, shiftMin: d.shiftMin, voiceRest: d.voiceRest }, date);
  const { def } = resolveTemplate(s.schedule, d.type);
  const wake = find(items, "weigh") ?? items[0]?.min ?? 13 * 60;
  const sleep = find(items, "sleep") ?? 29 * 60;
  const P = (key: string, label: string, tip: string, color: string, start: number, end: number): Phase => ({ key, label, tip, color, start, end });

  if (def.phases) {
    // Template phases: anchored on item ids, dropped when the anchor is missing or outside the waking day,
    // sorted, deduped by start, first stretched back to wake, each ending where the next starts.
    const list: { p: (typeof def.phases)[number]; start: number }[] = [];
    const anchors = anchorsFor(s.schedule, d, date);
    for (const p of def.phases) {
      const [id, off] = typeof p.at === "string" ? [p.at, 0] : p.at;
      const m = find(items, id);
      if (m === undefined || m + off < wake || m + off >= sleep) continue;
      list.push({ p, start: m + off });
    }
    list.sort((a, b) => a.start - b.start);
    const uniq = list.filter((x, i) => i === 0 || x.start !== list[i - 1].start);
    if (uniq.length) uniq[0].start = wake;
    return [
      ...uniq.map(({ p, start }, i) => P(p.key, p.label, fillTimes(p.tip, anchors), p.color, start, uniq[i + 1]?.start ?? sleep)),
      P("sleep", m("phase.sleep.label"), m("phase.sleep.tip"), "var(--ph-sleep)", sleep, wake + 1440),
    ];
  }

  if (def.base === "off") {
    const cardio = find(items, "cardio") ?? 16 * 60;
    const meal3 = find(items, "meal3") ?? 25 * 60;
    return [
      P("morning", m("phase.off.morning.label"), m("phase.off.morning.tip"), "var(--ph-morning)", wake, cardio),
      P("move", m("phase.off.move.label"), m("phase.off.move.tip"), "var(--ph-move)", cardio, cardio + 120),
      P("evening", m("phase.off.evening.label"), m("phase.off.evening.tip"), "var(--ph-food)", cardio + 120, meal3),
      P("winddown", m("phase.off.winddown.label"), m("phase.off.winddown.tip"), "var(--ph-sleep)", meal3, sleep),
      P("sleep", m("phase.sleep.label"), m("phase.off.sleep.tip"), "var(--ph-sleep)", sleep, wake + 1440),
    ];
  }

  const workIn = find(items, "work-in") ?? 16 * 60;
  const workOut = find(items, "work-out") ?? 26 * 60;
  const meal2 = find(items, "meal2") ?? 21 * 60;
  const gym = find(items, "gym") ?? workOut + 30;
  const gymEnd = gym + 75;
  return [
    P("prep", m("phase.work.prep.label"), m("phase.work.prep.tip"), "var(--ph-morning)", wake, workIn),
    P("work1", m("phase.work.work1.label"), m("phase.work.work1.tip"), "var(--ph-work)", workIn, meal2),
    P("break", m("phase.work.break.label"), m("phase.work.break.tip"), "var(--ph-food)", meal2, meal2 + 60),
    P("work2", m("phase.work.work2.label"), m("phase.work.work2.tip"), "var(--ph-work)", meal2 + 60, workOut),
    P("commute", m("phase.work.commute.label"), m("phase.work.commute.tip"), "var(--ph-move)", workOut, gym),
    P("gym", m("phase.work.gym.label"), m("phase.work.gym.tip"), "var(--ph-train)", gym, gymEnd),
    P("recover", m("phase.work.recover.label"), m("phase.work.recover.tip"), "var(--ph-sleep)", gymEnd, sleep),
    P("sleep", m("phase.sleep.label"), m("phase.sleep.tip"), "var(--ph-sleep)", sleep, wake + 1440),
  ];
}

export function currentPhase(s: State, d: DayLog, nowMin: number, date?: string) {
  const list = phases(s, d, date);
  // Before wake-up the logical day hasn't started: treat as the tail of last night's sleep.
  const m = nowMin < list[0].start ? nowMin + 1440 : nowMin;
  const i = Math.max(0, list.findIndex((p) => m >= p.start && m < p.end));
  const p = list[i];
  const next = list[(i + 1) % list.length];
  return { phase: p, next, progress: Math.min(1, Math.max(0, (m - p.start) / Math.max(1, p.end - p.start))), left: p.end - m };
}

// ---- live blocks and the bottom accessory (Round B G3) ----
export const blockColor = (k: "live" | "game") => (k === "live" ? "var(--ph-live)" : "var(--area-leisure)");

// The live or game block running now: id "stream" first, then any kind "game" block (never "game-stop"); end exclusive.
export function liveBlock(items: Item[], nowMin: number): { item: Item; end: number; kind: "live" | "game" } | null {
  const hit = (i: Item) => { const end = blockEnd(items, i); return end !== undefined && i.min <= nowMin && nowMin < end ? end : null; };
  const st = items.find((i) => i.id === "stream");
  const se = st ? hit(st) : null;
  if (st && se !== null) return { item: st, end: se, kind: "live" };
  for (const i of items) {
    if (i.kind !== "game" || i.id === "game-stop") continue;
    const e = hit(i);
    if (e !== null) return { item: i, end: e, kind: "game" };
  }
  return null;
}

export type Accessory = { kind: "rest" | "session" | "live" | "game" | "class" | "phase"; label: string; left: number; color: string; key: string; sec?: number; up?: true; stale?: true };

// Highest-priority live thing for the accessory slot: a running live/game block, else the current phase.
// v1.7: only when nowMs is passed, a gym rest timer and then a running session (Live mode / sing timer) come first;
// without it the result is exactly the v1.6 one.
export function accessoryFor(s: State, d: DayLog, date: string, nowMin: number, nowMs?: number): Accessory {
  if (nowMs !== undefined) {
    const sec = restLeft(s, nowMs);
    if (sec !== null) return { kind: "rest", label: m("phase.acc.rest"), left: Math.ceil(sec / 60), sec, color: "var(--area-training)", key: "rest" };
    // A run left open (yesterday or 12 h+) asks instead of counting; a tap still opens LiveView's stale screen.
    if (s.run && staleRun(s.run, date, nowMs)) return { kind: "session", label: m("phase.acc.stale", { run: runLabel(s.run.k) }), left: 0, stale: true, color: "var(--ph-live)", key: "run" };
    if (s.run) return { kind: "session", label: m("phase.acc.running", { run: runLabel(s.run.k) }), left: Math.floor(elapsedMs(s.run, nowMs) / 60_000), up: true, color: "var(--ph-live)", key: "run" };
  }
  const items = itemsFor(s.schedule, d, date);
  const lb = liveBlock(items, nowMin);
  if (lb) return { kind: lb.kind, label: lb.kind === "live" ? m("phase.acc.live") : m("phase.acc.game"), left: Math.max(0, lb.end - nowMin), color: blockColor(lb.kind), key: lb.item.id };
  const cn = classNow(items, nowMin); // v1.8 term day: a running class beats the phase
  if (cn) return { kind: "class", label: m("phase.acc.class"), left: Math.max(0, cn.end - nowMin), color: "var(--info)", key: cn.item.id };
  const { phase, left } = currentPhase(s, d, nowMin, date);
  return { kind: "phase", label: phase.label, left: Math.max(0, left), color: phase.color, key: phase.key };
}

export const leftText = (m: number) => `${Math.floor(Math.max(0, m) / 60)}:${String(Math.max(0, m) % 60).padStart(2, "0")}`;

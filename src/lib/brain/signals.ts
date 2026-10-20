// Per-day signals the engine reads (pure). Planned items come from itemsFor(dayFor(...)), exactly as Today shows
// them. Never reads trade.note or journal text. Clock minutes are Bangkok logical minutes (bkkMin, fixed +07:00).
import { ROLLOVER_HOUR, addDays } from "../date";
import { trend } from "../health";
import { dayFor, hasCheckin, type State } from "../model";
import { blockEnd, itemsFor, resolveTemplate, type Item } from "../schedule";
import { bkkMin, dayBudget, dayScore, sleepHours, waterGoal } from "../stats";
import { DEFAULT_DUR } from "./math";
import type { DaySig, PlanDay, SigItem } from "./types";

export const LAST = (ROLLOVER_HOUR + 24) * 60 - 1; // 07:59
const scheduledAt = (date: string, min: number) => new Date(date + "T00:00:00+07:00").getTime() + min * 60_000;
export const delayOf = (date: string, min: number, ts: number) => (ts > 1e12 ? Math.round((ts - scheduledAt(date, min)) / 60_000) : null);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Built-in id a template key stands for (user copies -> their `from`).
export const baseOf = (s: State, key: string) => s.schedule.templates?.find((t) => t.id === key)?.from ?? key;
export const plannedWakeOf = (items: Item[]) => items.find((i) => i.id === "weigh")?.min ?? items.find((i) => i.ring)?.min ?? 780;
export const plannedSleepOf = (items: Item[]) => items.find((i) => i.kind === "sleep" && i.ring)?.min ?? null;
const CORE = [["weigh"], ["meal1"], ["meal2", "meal2c"], ["meal3"], ["sleep"]];

export function kgAtFn(s: State) {
  const t = trend(s.weights);
  return (date: string) => [...t].reverse().find((w) => w.date <= date)?.trend ?? s.profile.startKg;
}

export function extractDays(s: State, today: string, n = 28): DaySig[] {
  const kgAt = kgAtFn(s);
  const code = new Map(s.workouts.map((w) => [w.date, w.code]));
  // Deload ranges: the current slot plus every non-undone applied plan_deload, so a later deload never un-excuses past days.
  const dls = [s.brain?.deload, ...(s.brain?.applied ?? []).filter((r) => !r.undoneAt).flatMap((r) => r.actions)
    .flatMap((x) => (x.k === "plan_deload" ? [{ from: x.from, to: addDays(x.from, x.days - 1) }] : []))].filter((x) => !!x);
  return Array.from({ length: n }, (_, k) => {
    const date = addDays(today, k - n + 1);
    const logged = !!s.days[date];
    const d = dayFor(s, date);
    const { key, def } = resolveTemplate(s.schedule, d.type);
    const list = itemsFor(s.schedule, d, date);
    const ring = list.filter((i) => i.ring);
    const done = (id: string) => (logged && fin(d.done[id]) ? d.done[id] : 0);
    const items: SigItem[] = ring.map((i) => {
      const ts = done(i.id);
      return { id: i.id, kind: i.kind, ring: i.ring!, min: i.min, done: ts, delay: ts ? delayOf(date, i.min, ts) : null, custom: !!i.custom, session: !!i.session };
    });
    const rc = (r: string): [number, number] => { const of = items.filter((i) => i.ring === r); return [of.filter((i) => i.done).length, of.length]; };
    const plannedWake = plannedWakeOf(list), plannedSleep = plannedSleepOf(list);
    const sleepH = sleepHours(s, date);
    const bedMin = fin(d.sleepAt) ? bkkMin(d.sleepAt) : null;
    const wakeMin = fin(d.wakeAt) ? bkkMin(d.wakeAt) : null;
    const prev = s.days[addDays(date, -1)];
    const gymI = items.find((i) => i.id === "gym");
    const sings = items.filter((i) => i.kind === "sing");
    const singTs = Math.max(0, ...sings.map((i) => i.done));
    const sg = (d as { sing?: unknown }).sing;
    const sgo = sg && typeof sg === "object" ? (sg as { min?: unknown; strain?: unknown }) : null;
    const go = (d as { gameOver?: unknown }).gameOver;
    const tr = d.trade && typeof d.trade === "object" && fin(d.trade.count) ? { count: d.trade.count, result: d.trade.result } : null;
    const coreP = CORE.map((ids) => items.find((i) => ids.includes(i.id))).filter((i): i is SigItem => !!i);
    const wcode = code.get(date) ?? null;
    const gymPlanned = !!gymI;
    const voiceRest = !!d.voiceRest;
    const base = baseOf(s, key);
    const sig: DaySig = {
      date, logged, tpl: key, base, work: def.work,
      score: logged ? dayScore(s, d) : null,
      ring: { food: rc("food"), body: rc("body"), habit: rc("habit") },
      items, plannedWake, plannedSleep,
      sleepH, bedMin, wakeMin,
      bedLate: bedMin !== null && plannedSleep !== null ? bedMin - plannedSleep : null,
      midSleep: prev && fin(prev.sleepAt) && sleepH !== null ? bkkMin(prev.sleepAt) + sleepH * 30 : null,
      gym: { planned: gymPlanned, done: !!(gymI && gymI.done), code: wcode, delay: gymI?.delay ?? null, ts: gymI?.done ?? 0 },
      sing: {
        planned: sings.length > 0, done: singTs > 0, voiceRest, has: !!sgo, ts: singTs,
        ...(sgo && (sgo.min === 10 || sgo.min === 20 || sgo.min === 30 || sgo.min === 45) ? { min: sgo.min } : {}),
        ...(sgo && typeof sgo.strain === "boolean" ? { strain: sgo.strain } : {}),
      },
      mc: {
        checkPlanned: items.some((i) => i.id === "mc-check"), checkDone: !!done("mc-check"),
        buildPlanned: items.some((i) => i.id === "mc" || i.id === "mc2"), buildDone: !!(done("mc") || done("mc2")),
      },
      trade: { planned: list.some((i) => i.kind === "trade"), log: logged ? tr : null },
      game: {
        planned: list.some((i) => i.id === "game" || i.id === "game1"),
        plannedMin: dayBudget(s.schedule, d, date).game,
        stopMin: list.find((i) => i.id === "game-stop")?.min ?? null,
        ...(go === 0 || go === 30 || go === 60 ? { over: go } : {}),
      },
      water: { ml: fin(d.waterMl) ? d.waterMl : 0, goal: waterGoal(s, d, kgAt(date)) },
      checkin: logged && hasCheckin(d) ? { e: d.checkin.energy, m: d.checkin.mood, sq: d.checkin.sleep } : null,
      core: logged && coreP.length ? coreP.filter((i) => i.done).length / coreP.length : null,
      foodItems: items.filter((i) => i.ring === "food").map((i) => ({ id: i.id, min: i.min, done: i.done })),
      restDay: base === "rest" || !!wcode?.startsWith("R") || voiceRest || !gymPlanned,
      inDeload: dls.some((x) => date >= x.from && date <= x.to),
    };
    return sig;
  });
}

// Personal minutes of a day's ring items outside work hours (gym = its block), game time excluded.
function loadOf(items: Item[], work: boolean) {
  const wake = plannedWakeOf(items), sleep = plannedSleepOf(items) ?? LAST;
  const wi = items.find((i) => i.id === "work-in")?.min, wo = items.find((i) => i.id === "work-out")?.min;
  const inWork = (m: number) => work && wi !== undefined && wo !== undefined && m >= wi && m < wo;
  const personal = items.filter((i) => i.ring && !inWork(i.min))
    .reduce((a, i) => a + (i.kind === "gym" ? (blockEnd(items, i) ?? i.min + 75) - i.min : i.dur ?? DEFAULT_DUR[i.kind] ?? 15), 0);
  const workMin = work && wi !== undefined && wo !== undefined ? wo - wi : 0;
  return { load: (personal + workMin) / Math.max(60, sleep - wake - 60), wake, sleep };
}

export function planDays(s: State, today: string, n = 7): PlanDay[] {
  return Array.from({ length: n }, (_, k) => {
    const date = addDays(today, k);
    const d = dayFor(s, date);
    const { key, def } = resolveTemplate(s.schedule, d.type);
    // The plan without the one-off day shift: a late-wake shift is not a template problem (C9 / load).
    const items = itemsFor(s.schedule, { ...d, shiftMin: 0 }, date);
    const { load, sleep } = loadOf(items, def.work);
    const tom = addDays(date, 1);
    const nextWake = plannedWakeOf(itemsFor(s.schedule, { ...dayFor(s, tom), shiftMin: 0 }, tom));
    const b = dayBudget(s.schedule, d, date);
    return {
      date, tpl: key, base: baseOf(s, key), work: def.work, load, sleepWinH: (nextWake + 1440 - sleep) / 60,
      gameMin: b.game, singMin: b.sing, mcMin: b.mc, gym: b.gym ? 1 : 0, singPlanned: b.singDays > 0, voiceRest: !!d.voiceRest,
    };
  });
}

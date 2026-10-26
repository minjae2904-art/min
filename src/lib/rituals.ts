// v1.7 rituals (spec 7.1): morning plan / overcommit check, evening shutdown / carry to tomorrow, and the Night theme rules.
// Pure: every mutation is (x: State, ...) => void inside update(); nothing changes the plan without a tap.
import { moveItem, skipItem } from "./actions";
import { CORE } from "./brain/actions";
import { DEFAULT_DUR } from "./brain/math";
import { plannedWakeOf } from "./brain/signals";
import { addDays, hm } from "./date";
import { dayFor, type State } from "./model";
import { currentPhase, liveBlock } from "./phase";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { blockEnd, canReschedule, gymItemOf, itemsFor, resolveTemplate, type Item } from "./schedule";
import { staleRun } from "./session";
import { planEpoch } from "./ticks";

export type Fix = { k: "skip" | "unmove" | "unshift"; id?: string; label: string; gain: number };
export type Over = { overBy: number; sleepH: number; bed: number; wakeTmr: number; fixes: Fix[]; info: string | null; hint: string | null };

const NO_PEND = new Set(["night", "presleep"]);
const end = (items: Item[], i: Item) => (i.endAt ? blockEnd(items, i) ?? i.min : i.min + (i.dur ?? DEFAULT_DUR[i.kind] ?? 15));
const h1 = (h: number) => (Math.round(h * 10) / 10).toFixed(1);
const wakeTomorrow = (s: State, date: string) => { const t = addDays(date, 1); return plannedWakeOf(itemsFor(s.schedule, { ...dayFor(s, t), shiftMin: 0 }, t)); };

// Planned blocks pushing bedtime past sleep - 30, or a plan with under 7 h of sleep. null = fine.
export function overcommit(s: State, date: string, nowMin: number): Over | null {
  const d = dayFor(s, date);
  const items = itemsFor(s.schedule, d, date);
  const sleep = items.find((i) => i.kind === "sleep");
  if (!sleep) return null;
  const wakeTmr = wakeTomorrow(s, date);
  const pend = items.filter((i) => i.ring && !d.done[i.id] && i.min >= nowMin - 30 && i.kind !== "sleep" && i.kind !== "care" && !NO_PEND.has(i.id));
  const cutoff = sleep.min - 30;
  const overBy = Math.max(0, ...pend.map((i) => end(items, i) - cutoff));
  const bed = sleep.min + overBy;
  const sleepH = ((((wakeTmr - bed) % 1440) + 1440) % 1440) / 60;
  if (overBy === 0 && sleepH >= 7) return null;
  const fixes: Fix[] = [];
  const shift = d.shiftMin ?? 0;
  if (shift > 0 && resolveTemplate(s.schedule, d.type).def.season !== "stream") fixes.push({ k: "unshift", label: `คืนตารางตามแผน (ยกเลิกเลื่อน +${shift} น.)`, gain: shift });
  if (overBy > 0) {
    for (const i of pend) {
      const e = end(items, i);
      if (e <= cutoff) continue;
      if (i.planMin !== undefined && i.min > i.planMin) fixes.push({ k: "unmove", id: i.id, label: `คืนเวลาเดิม ${i.title} ${hm(i.planMin)}`, gain: Math.min(i.min - i.planMin, e - cutoff) });
      if (canReschedule(i) && !CORE.has(i.id) && i.id !== "stream" && i.id !== "stream-prep") {
        const gain = Math.min(i.dur ?? DEFAULT_DUR[i.kind] ?? 15, e - cutoff);
        fixes.push({ k: "skip", id: i.id, label: `ข้าม ${i.title} วันนี้ (+${gain} น.)`, gain });
      }
    }
  }
  fixes.sort((a, b) => b.gain - a.gain);
  const top = fixes.slice(0, 3);
  const se = items.find((i) => i.id === "stream-end");
  return {
    overBy, sleepH, bed, wakeTmr, fixes: top,
    info: overBy === 0 ? `ตามตารางวันนี้นอนได้ราว ${h1(sleepH)} ชม.` : null,
    hint: overBy > 0 && !top.length ? (se ? `ลองปิดไลฟ์ตรง ${hm(se.min)} แล้วเข้านอน ${hm(sleep.min)}` : `ลองเข้านอนตามแผน ${hm(sleep.min)}`) : null,
  };
}

// One tap of a fix: the existing today-only levers (moveItem back to plan, skipItem, drop the today shift).
export function applyFix(x: State, date: string, f: Fix) {
  if (f.k === "unshift") { const d = dayFor(x, date); delete d.shiftMin; x.days[date] = d; return; }
  const it = itemsFor(x.schedule, dayFor(x, date), date).find((i) => i.id === f.id);
  if (!it) return;
  if (f.k === "unmove") moveItem(x, date, it, null);
  else skipItem(x, date, it, true);
}

const span = (m: number) => `${h1(m / 60).replace(/\.0$/, "")} ชม.`;
const gymCode = (s: State, date: string) => s.workouts.find((w) => w.date === date)?.code ?? nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));

// Lines of the morning plan sheet: wake/sleep, gym, live, trade, singing, ring item count.
export function planLines(s: State, date: string): string[] {
  const items = itemsFor(s.schedule, dayFor(s, date), date);
  const out: string[] = [];
  const sleep = items.find((i) => i.kind === "sleep");
  out.push(`ตื่น ${hm(plannedWakeOf(items))}${sleep ? ` · นอน ${hm(sleep.min)}` : ""}`);
  const gym = items.find((i) => i.id === "gym");
  if (gym) { const c = gymCode(s, date); out.push(`ยิม ${c} ${GYM_LABEL[c] ?? ""} ${hm(gym.min)}`.replace(/\s+/g, " ")); }
  const st = items.find((i) => i.id === "stream");
  if (st) { const e = blockEnd(items, st) ?? st.min; out.push(`ไลฟ์ ${hm(st.min)}-${hm(e)} (${span(e - st.min)})`); }
  const tr = items.find((i) => i.kind === "trade");
  if (tr) out.push(tr.title.includes("London") ? `เทรด London ${hm(tr.min + 15)}` : `เทรด ${hm(tr.min)}`);
  const sing = items.find((i) => i.kind === "sing");
  if (sing) out.push(`ร้องเพลง ${sing.dur ?? DEFAULT_DUR.sing} น.`);
  out.push(`${items.filter((i) => i.ring).length} รายการ`);
  return out;
}

export type ShutRow = { item: Item; acts: ("done" | "carry" | "skip")[] };
const NO_SHUT = new Set(["night", "presleep", "stream", "stream-prep"]);

// Undone rows whose time has come (future rows wait; night/presleep/stream/stream-prep belong to the evening itself).
export function shutdownList(s: State, date: string, nowMin: number): ShutRow[] {
  const d = dayFor(s, date);
  return itemsFor(s.schedule, d, date)
    .filter((i) => i.ring && i.min <= nowMin && !d.done[i.id] && !d.skip?.[i.id] && i.kind !== "sleep" && !NO_SHUT.has(i.id))
    .map((item) => ({ item, acts: CORE.has(item.id) ? ["done"] : item.routine ? ["done", "skip"] : ["done", "carry", "skip"] }));
}

// Tomorrow already plans this id (then "พรุ่งนี้" only skips today).
export const tomorrowHas = (s: State, date: string, id: string): Item | undefined => {
  const t = addDays(date, 1);
  return itemsFor(s.schedule, dayFor(s, t), t).find((i) => i.id === id);
};

// "พรุ่งนี้": skip today (reason na) and write tomorrow.carry[id] = [source template, planned minute], both reschedAt = now.
export function carryItem(x: State, date: string, item: Item, now: number): "carried" | "exists" | "refused" {
  if (!canReschedule(item) || CORE.has(item.id) || item.routine) return "refused";
  const t = addDays(date, 1);
  const d = dayFor(x, date);
  if (tomorrowHas(x, date, item.id)) {
    skipItem(x, date, item, true);
    if (x.days[date]?.skip?.[item.id]) x.days[date].reschedAt = now;
    return "exists";
  }
  const td = dayFor(x, t);
  const carry = { ...(td.carry ?? {}) };
  if (!carry[item.id] && Object.keys(carry).length >= 3) return "refused";
  const src = item.carried && Array.isArray(d.carry?.[item.id]) ? d.carry![item.id][0] : resolveTemplate(x.schedule, d.type).key;
  skipItem(x, date, item, true);
  const today = x.days[date];
  if (!today?.skip?.[item.id]) return "refused";
  today.skipWhy = { ...today.skipWhy, [item.id]: "na" };
  today.reschedAt = now;
  carry[item.id] = [src, item.planMin ?? item.min];
  td.carry = carry;
  td.reschedAt = now;
  x.days[t] = td;
  return "carried";
}

// Undo of a carry: un-skip today and drop tomorrow's entry. Both clocks move forward (never back) and tomorrow's log is
// kept, so a later 409 merge against an already-pushed carry cannot bring the skip or the carried row back.
export function undoCarry(x: State, date: string, item: Item, now = Date.now()) {
  skipItem(x, date, item, false);
  const today = x.days[date];
  if (today) today.reschedAt = now;
  const t = addDays(date, 1), td = x.days[t];
  if (!td?.carry?.[item.id]) return;
  const c = { ...td.carry }; delete c[item.id];
  if (Object.keys(c).length) td.carry = c; else delete td.carry;
  td.reschedAt = now;
}

// The evening sheet's tomorrow line.
export function tomorrowFirst(s: State, date: string): { tpl: string; wake: string; first: Item | undefined; gym: string | null; live: string | null } {
  const t = addDays(date, 1), td = dayFor(s, t);
  const items = itemsFor(s.schedule, td, t);
  const gym = gymItemOf(items)?.id === "gym" ? nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date < t)) : null;
  const st = items.find((i) => i.id === "stream");
  return {
    tpl: resolveTemplate(s.schedule, td.type).def.name, wake: hm(plannedWakeOf(items)),
    first: items.find((i) => i.ring && i.kind !== "weigh" && i.kind !== "sleep"),
    gym: gym && gym !== "R" ? gym : null, live: st ? hm(st.min) : null,
  };
}

// Morning plan window (wake .. wake + 4 h, until planAt) and evening shutdown window (sleep - 90 .. sleep + 60).
export function ritualNow(s: State, date: string, nowMin: number): "plan" | "shut" | null {
  const d = dayFor(s, date);
  const items = itemsFor(s.schedule, d, date);
  const wake = plannedWakeOf(items), sleep = items.find((i) => i.kind === "sleep")?.min;
  if (!d.planAt && (!!d.wakeAt || nowMin >= wake) && nowMin < wake + 240) return "plan";
  if (sleep !== undefined && !d.shutAt && !d.sleepAt && nowMin >= sleep - 90 && nowMin < sleep + 60) return "shut";
  return null;
}

const NIGHT_PHASES = new Set(["winddown", "sleep", "recover"]);
// Automatic Night theme: wind-down / sleep / recover phase, a running live block or Live mode, or after "ปิดวัน".
export function nightOn(s: State, date: string, nowMin: number, nowMs: number): boolean {
  if (!s.settings.night || s.settings.theme === "light") return false;
  if (s.run?.k === "live" && !staleRun(s.run, date, nowMs)) return true; // a forgotten run does not keep the next day dark
  // v1.8: a pre-08:00 wake filed on the next logical day (wakeTarget) ends the night before the date rolls over.
  const next = s.days[addDays(date, 1)]?.wakeAt;
  if (typeof next === "number" && next <= nowMs) return false;
  const d = dayFor(s, date);
  if (d.shutAt && !(d.wakeAt && d.wakeAt > d.shutAt)) return true; // not woken since "ปิดวัน" (today's wakeAt is usually earlier)
  const items = itemsFor(s.schedule, d, date);
  if (liveBlock(items, nowMin)?.kind === "live") return true;
  const cp = currentPhase(s, d, nowMin, date);
  if (!NIGHT_PHASES.has(cp.phase.key)) return false;
  // Before the planned wake the phase is last night's sleep tail; once "ตื่นแล้ว" was pressed today it is daytime.
  if (cp.phase.key === "sleep" && d.wakeAt && d.wakeAt <= nowMs && nowMin < plannedWakeOf(items)) return false;
  return true;
}

// Epoch of the next planned wake (mirrored into krob-ui "nu" so the boot script can paint Night before hydration).
export function nightUntil(s: State, date: string, nowMs: number): number {
  const items = itemsFor(s.schedule, dayFor(s, date), date);
  const w = planEpoch(date, plannedWakeOf(items));
  return w > nowMs ? w : planEpoch(addDays(date, 1), wakeTomorrow(s, date));
}

// iOS status bar colour: Night is true black; otherwise the Gate formula (per meta media when the theme is auto).
export function themeColor(theme: "auto" | "light" | "dark", mediaDark: boolean, night: boolean): string {
  if (night) return "#000000";
  if (theme === "auto") return mediaDark ? "#000000" : "#f2f2f7";
  return theme === "dark" ? "#000000" : "#f2f2f7";
}

// krob-ui blob writers (theme effect, useNight) merge instead of replacing, so neither drops the other's keys.
export function mergeUiBlob(raw: string | null, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try { const v = JSON.parse(raw ?? "{}"); if (v && typeof v === "object" && !Array.isArray(v)) base = v; } catch {}
  return JSON.stringify({ ...base, ...patch });
}

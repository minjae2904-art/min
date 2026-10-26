// Self-care progress engine (pure): step views, row state, tick/skip/complete, levels and packs, periodic tasks.
// Step ticks live in DayLog.care (separate from DayLog.done); the Today row is ticked only when every required due step is done.
import { addDays } from "../date";
import { setDone, skipItem } from "../actions";
import { dayFor, type DayLog, type SkipWhy, type State, type TickSrc } from "../model";
import { itemsFor, type Item } from "../schedule";
import { cadDue, daysBetween } from "./cadence";
import { CHECK_DEFAULTS, LEVEL_PACKS, LEVEL_RANK, OPT_IN_PACKS, PACK_STEPS, SLOTS, TASK_PRESETS, slotRoutine, type PackStep, type SlotId } from "./presets";
import { hasRequiredDaily, type CareTask, type Level, type Routine, type Step } from "./types";

export { hasRequiredDaily };
// True when this step is the routine's last on + required + daily step: hiding it or making it non-daily would drop the
// routine from Today (placeRoutines skips it), so the quick menu refuses and points to the editor.
export const lastReqDaily = (r: Pick<Routine, "steps">, sid: string) => {
  const st = r.steps.find((x) => x.id === sid);
  return !!st && st.on !== false && !st.opt && (st.cad ?? "d") === "d" && !hasRequiredDaily({ steps: r.steps.filter((x) => x.id !== sid) });
};

export type StepView = { step: Step; due: boolean; why?: "rest-skin" | "conflict"; first?: string; done: boolean; skipped: boolean };
const STRONG = new Set(["ret", "bha", "aha", "bp"]);

export function careIds(day: DayLog | undefined, rid: string): Set<string> {
  const v = day?.care && typeof day.care === "object" ? day.care[rid] : undefined;
  return new Set(typeof v === "string" && v ? v.split(",") : []);
}
function writeIds(d: DayLog, rid: string, ids: Set<string>) {
  const care = { ...(d.care && typeof d.care === "object" ? d.care : {}) };
  const list = [...ids].filter(Boolean).slice(0, 20);
  if (list.length) care[rid] = list.join(","); else delete care[rid];
  if (Object.keys(care).length) d.care = care; else delete d.care;
}

// On steps with today's cadence. Skin irritated today or yesterday rests every irritant; among strong actives due in the same
// routine only the first stays due tonight (the others show "conflict" with that step's title).
export function stepsFor(r: Routine, day: DayLog, date: string, prev: DayLog | undefined): StepView[] {
  const ids = careIds(day, r.id);
  const hot = typeof day.hot === "number" && day.hot > 0;
  const irr = day.irr === true || prev?.irr === true;
  let strong: Step | undefined;
  return r.steps.filter((s) => s.on !== false).map((s) => {
    const v: StepView = { step: s, due: cadDue(s.cad, date, hot), done: ids.has(s.id), skipped: ids.has("-" + s.id) };
    if (v.due && s.irr && irr) { v.due = false; v.why = "rest-skin"; }
    else if (v.due && s.irr && STRONG.has(s.irr) && !v.skipped) { // a strong step skipped tonight frees the slot
      if (strong) { v.due = false; v.why = "conflict"; v.first = strong.title; } else strong = s;
    }
    return v;
  });
}

// Required due steps decide the row (a required cadence step skipped tonight drops out); optional steps never do.
export function rowState(r: Routine, day: DayLog, date: string, prev: DayLog | undefined) {
  const v = stepsFor(r, day, date, prev);
  const req = v.filter((x) => x.due && !x.step.opt && !x.skipped);
  const done = req.filter((x) => x.done).length;
  const tmr = addDays(date, 1);
  const tomorrow = r.steps.filter((s) => s.on !== false && !(s.irr && day.irr === true) && cadDue(s.cad, tmr, false) && !cadDue(s.cad, date, !!day.hot));
  return {
    done, total: req.length, complete: req.length > 0 && done === req.length,
    next: req.filter((x) => !x.done).map((x) => x.step),
    optLeft: v.filter((x) => x.due && x.step.opt && !x.done && !x.skipped).length,
    tomorrow,
  };
}
export type RowState = ReturnType<typeof rowState>;

// Short label of a step: its first word ("กันแดด SPF 30+" -> "กันแดด").
export const stepShort = (s: Step) => s.title.split(" ")[0];
export function careSub(st: RowState, hint?: string): string {
  if (st.complete) return "ครบแล้ว";
  if (!st.total) return hint ?? "วันนี้ไม่มีขั้นบังคับ";
  const parts = st.next.slice(0, 2).map(stepShort);
  if (st.next.length > 2) parts.push(`+${st.next.length - 2}`);
  if (st.optLeft) parts.push(`+${st.optLeft} ไม่บังคับ`);
  return parts.join(" · ");
}

// The Today row of a routine (skips ignored, so a tick can still find it).
export const rowOf = (s: State, date: string, rid: string): Item | undefined =>
  itemsFor(s.schedule, { ...dayFor(s, date), skip: undefined }, date).find((i) => i.routine === rid);
const routineOf = (s: State, rid: string) => s.schedule.care?.find((r) => r.id === rid);

function syncRow(x: State, date: string, rid: string, promoteOnly = false) {
  const r = routineOf(x, rid), item = rowOf(x, date, rid);
  if (!r || !item) return;
  const d = dayFor(x, date);
  const st = rowState(r, d, date, x.days[addDays(date, -1)]);
  if (!st.total) return;
  if (st.complete && !d.done[item.id]) setDone(x, date, item, true);
  else if (!st.complete && d.done[item.id] && !promoteOnly) setDone(x, date, item, false);
}

// promoteOnly: the tick may complete the row but never unticks a row that is already done (ShutdownSheet's jr step).
export function tickStep(x: State, date: string, rid: string, sid: string, on: boolean, promoteOnly = false) {
  const d = dayFor(x, date);
  const ids = careIds(d, rid);
  if (on) { ids.add(sid); ids.delete("-" + sid); } else ids.delete(sid);
  writeIds(d, rid, ids);
  x.days[date] = d;
  syncRow(x, date, rid, promoteOnly);
}

// "ข้ามคืนนี้": optional or cadence steps only.
export function skipStep(x: State, date: string, rid: string, sid: string, on: boolean) {
  const s = routineOf(x, rid)?.steps.find((y) => y.id === sid);
  if (!s || !(s.opt || (s.cad && s.cad !== "d"))) return;
  const d = dayFor(x, date);
  const ids = careIds(d, rid);
  if (on) { ids.delete(sid); ids.add("-" + sid); } else ids.delete("-" + sid);
  writeIds(d, rid, ids);
  x.days[date] = d;
  syncRow(x, date, rid);
}

// "เสร็จหมด": ticks every required due step, then the row. A row with nothing required today is ticked directly.
export function completeRoutine(x: State, date: string, rid: string, opt: { at?: number; src?: TickSrc | null } = {}) {
  const r = routineOf(x, rid);
  if (!r) return;
  const d = dayFor(x, date);
  const prev = x.days[addDays(date, -1)];
  const ids = careIds(d, rid);
  const req = stepsFor(r, d, date, prev).filter((v) => v.due && !v.step.opt && !v.skipped);
  for (const v of req) ids.add(v.step.id);
  writeIds(d, rid, ids);
  x.days[date] = d;
  const item = rowOf(x, date, rid);
  if (item && !d.done[item.id]) setDone(x, date, item, true, undefined, opt);
}

export function untickRoutine(x: State, date: string, rid: string) {
  const r = routineOf(x, rid);
  const d = dayFor(x, date);
  const ids = careIds(d, rid);
  for (const s of r?.steps ?? []) if (!s.opt) ids.delete(s.id);
  writeIds(d, rid, ids);
  x.days[date] = d;
  const item = rowOf(x, date, rid);
  if (item && d.done[item.id]) setDone(x, date, item, false);
}

// Undo of a care change on one routine: its step ticks, its row tick (with source) and skips (the clock moves forward).
export type Snap = { had: boolean; care?: string; done?: number; src?: { src: TickSrc; ts: number }; skip?: Record<string, number>; skipWhy?: Record<string, SkipWhy>; reschedAt?: number; row?: string };
export function snapCare(s: State, date: string, rid: string): Snap {
  const d = s.days[date];
  const row = rowOf(s, date, rid)?.id;
  if (!d) return { had: false, row };
  return structuredClone({ had: true, care: d.care?.[rid], done: row ? d.done[row] : undefined, src: row ? d.doneSrc?.[row] : undefined,
    skip: d.skip, skipWhy: d.skipWhy, reschedAt: d.reschedAt, row });
}
// The merge clock (reschedAt) only moves forward: when the undo changes skip/skipWhy it stamps `now`, so a copy already pushed
// with the skip cannot win the next merge. A log the change created is kept (cleared), never deleted, for the same reason.
export function restoreCare(x: State, date: string, rid: string, snap: Snap, now = Date.now()) {
  const d = dayFor(x, date);
  writeIds(d, rid, new Set(snap.care ? snap.care.split(",") : []));
  if (snap.row) {
    if (snap.done !== undefined) d.done[snap.row] = snap.done; else delete d.done[snap.row];
    if (snap.src) (d.doneSrc ??= {})[snap.row] = { ...snap.src };
    else if (d.doneSrc) { delete d.doneSrc[snap.row]; if (!Object.keys(d.doneSrc).length) delete d.doneSrc; }
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (!same(d.skip, snap.skip) || !same(d.skipWhy, snap.skipWhy)) {
    for (const k of ["skip", "skipWhy"] as const) {
      if (snap[k] !== undefined) (d as Record<string, unknown>)[k] = structuredClone(snap[k]); else delete d[k];
    }
    d.reschedAt = Math.max(now, (d.reschedAt ?? 0) + 1);
  }
  x.days[date] = d;
}

// "ข้ามวันนี้" with a reason (null = un-skip). A done row is never skipped (skipItem refuses).
export function skipRow(x: State, date: string, item: Item, why: SkipWhy | null) {
  if (why === null) { skipItem(x, date, item, false); return; }
  skipItem(x, date, item, true);
  const d = x.days[date];
  if (d?.skip?.[item.id]) d.skipWhy = { ...d.skipWhy, [item.id]: why };
}

export function setHot(x: State, date: string, on: boolean, now: number) {
  const d = dayFor(x, date);
  if (on) d.hot = now; else delete d.hot;
  x.days[date] = d;
}
export function setIrr(x: State, date: string, on: boolean) {
  const d = dayFor(x, date);
  if (on) d.irr = true; else delete d.irr;
  x.days[date] = d;
}

// ---- periodic tasks ("งานตามรอบ"): never scored, never pushed ----
export function dueTasks(s: State, date: string): CareTask[] {
  return s.care.tasks.filter((t) => {
    if (!t.on) return false;
    const sn = s.care.snooze["t:" + t.id];
    if (sn && sn >= date) return false;
    const last = s.care.last[t.id];
    return !last || daysBetween(last, date) >= t.every;
  });
}
export function doTask(x: State, id: string, date: string) {
  x.care.last[id] = date;
  delete x.care.snooze["t:" + id];
}
// "ข้ามรอบนี้": this round counts as passed (due again on date + every), not as done.
export function skipTask(x: State, id: string, date: string) {
  x.care.last[id] = date;
  delete x.care.snooze["t:" + id];
}
// Hidden until `days` later (due again on date + days).
export function snoozeTask(x: State, id: string, date: string, days = 2) {
  x.care.snooze["t:" + id] = addDays(date, days - 1);
}

// ---- levels and packs ----
const rank = (l: Level) => LEVEL_RANK[l];
const slotOrder = (slot: SlotId) => PACK_STEPS.filter((p) => p.slot === slot).map((p) => p.step.id);

function ensureSlots(x: State) {
  const list = (x.schedule.care ??= []);
  for (const s of SLOTS) if (!list.some((r) => r.id === s.id)) list.push(slotRoutine(s.id));
  // Slots first in preset order, custom routines after.
  list.sort((a, b) => idx(a.id) - idx(b.id));
}
const idx = (id: string) => { const i = SLOTS.findIndex((s) => s.id === id); return i < 0 ? SLOTS.length : i; };

const optAt = (p: PackStep, level: Level) => !(p.req ?? ["lite", "std", "full"]).includes(level);
function makeStep(p: PackStep, level: Level, today: string): Step {
  const s: Step = structuredClone(p.step);
  if (optAt(p, level)) s.opt = true;
  if (s.id === "ret") s.cad = "r@" + today;
  return s;
}
function insertStep(r: Routine, s: Step, slot: SlotId) {
  const order = slotOrder(slot), k = order.indexOf(s.id);
  const at = r.steps.findIndex((y) => { const j = order.indexOf(y.id); return j > k; });
  if (at < 0) r.steps.push(s); else r.steps.splice(at, 0, s);
}

// Apply a level + pack set to every slot routine and task. A pack outside the level's own list (opt-in, or one the user
// switched on) brings all of its content; level packs bring only steps at or below the level. `only` limits the pass to one
// pack so toggling a pack never re-enables steps or tasks the user hid elsewhere.
function sync(x: State, level: Level, packs: string[], today: string, only?: string): { added: number; off: number } {
  ensureSlots(x);
  const own = LEVEL_PACKS[level];
  const want = (pack: string, lvl: Level) => packs.includes(pack) && (OPT_IN_PACKS.includes(pack) || !own.includes(pack) || rank(level) >= rank(lvl));
  let added = 0, off = 0;
  for (const slot of SLOTS) {
    const r = x.schedule.care!.find((y) => y.id === slot.id)!;
    const before = hasRequiredDaily(r);
    for (const p of PACK_STEPS.filter((q) => q.slot === slot.id && (!only || q.step.pack === only))) {
      const w = want(p.step.pack!, p.lvl);
      const s = r.steps.find((y) => y.id === p.step.id);
      if (!s) { if (w) { insertStep(r, makeStep(p, level, today), slot.id); added++; } continue; }
      if (w && s.on === false) { delete s.on; added++; if (s.id === "ret") s.cad = "r@" + today; }
      else if (!w && s.on !== false) { s.on = false; off++; }
      if (w && !s.ed) { if (optAt(p, level)) s.opt = true; else delete s.opt; }
    }
    const after = hasRequiredDaily(r);
    if (!before && after) r.on = true;
    if (!after) r.on = false;
  }
  for (const t of TASK_PRESETS) {
    if (only && t.pack !== only) continue;
    const w = want(t.pack, t.lvl);
    const cur = x.care.tasks.find((y) => y.id === t.id);
    if (!cur) {
      if (w && x.care.tasks.length < 30) {
        x.care.tasks.push({ id: t.id, title: t.title, tag: t.tag, every: t.every, on: !t.off, pack: t.pack, ...(t.hint ? { hint: t.hint } : {}) });
        if (!t.off) added++;
      }
      continue;
    }
    if (w && !cur.on && !t.off) { cur.on = true; added++; }
    else if (!w && cur.on) { cur.on = false; off++; }
  }
  return { added, off };
}

// Deterministic and idempotent. The first choice also adds the default health checks and turns on the activity water plan.
export function applyLevel(x: State, level: Level, today: string): { added: number; off: number; water: boolean } {
  const first = x.care.level === null;
  const packs = [...new Set([...LEVEL_PACKS[level], ...x.care.packs.filter((p) => OPT_IN_PACKS.includes(p))])];
  const res = sync(x, level, packs, today);
  if (first) {
    for (const c of CHECK_DEFAULTS) if (!x.care.checks.some((y) => y.id === c.id)) x.care.checks.push(structuredClone(c));
    x.care.water.plan = true;
  }
  x.care.level = level;
  x.care.packs = packs;
  x.care.asked = true;
  x.care.track.veg = rank(level) >= rank("std");
  return { ...res, water: first };
}

export function setPack(x: State, pack: string, on: boolean, today: string): { added: number; off: number } {
  const level = x.care.level ?? "std";
  const packs = on ? [...new Set([...x.care.packs, pack])] : x.care.packs.filter((p) => p !== pack);
  x.care.packs = packs;
  return sync(x, level, packs, today, pack);
}

// Back to the preset wording of one pack's steps (user edits dropped), then re-apply the level.
export function resetPack(x: State, pack: string, today: string) {
  const level = x.care.level ?? "std";
  for (const p of PACK_STEPS.filter((q) => q.step.pack === pack)) {
    const r = x.schedule.care?.find((y) => y.id === p.slot);
    const i = r ? r.steps.findIndex((y) => y.id === p.step.id) : -1;
    if (r && i >= 0) { const on = r.steps[i].on; r.steps[i] = makeStep(p, level, today); if (on === false) r.steps[i].on = false; }
  }
  for (const t of TASK_PRESETS.filter((q) => q.pack === pack)) {
    const cur = x.care.tasks.find((y) => y.id === t.id);
    if (cur) Object.assign(cur, { title: t.title, tag: t.tag, every: t.every });
  }
  sync(x, level, x.care.packs, today, pack);
}

// A preset routine back to its slot defaults (name, anchor, steps of the current level); custom steps are dropped.
export function resetRoutine(x: State, rid: string, today: string) {
  const slot = SLOTS.find((s) => s.id === rid);
  if (!slot) return;
  const list = (x.schedule.care ??= []);
  const i = list.findIndex((r) => r.id === rid);
  const fresh = slotRoutine(slot.id);
  if (i >= 0) list[i] = fresh; else list.push(fresh);
  sync(x, x.care.level ?? "std", x.care.packs, today);
}

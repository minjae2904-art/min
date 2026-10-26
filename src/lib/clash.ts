// v1.8 term clashes (pure): class times against the day's plan, and tap-only fixes through the existing levers, each with
// undo (snapFix/undoFix). Never imports brain/* (brain/actions imports this file).
import { msgs } from "../i18n";
import * as M from "../i18n/msg/lib-7";
import { applyWeekPlan, moveItem, setDayTemplate, skipItem } from "./actions";
import { addDays, hm } from "./date";
import { dayFor, plannedType, type Cls, type DayLog, type State } from "./model";
import { LAST, blockEnd, canReschedule, itemsFor, resolveTemplate, templateExists, type Item } from "./schedule";
import { TERM_ALT, TERM_FOR, TERM_IDS, TERM_PRESET, WEEK_PRESETS } from "./templates";
import { classesOn, clsSpan, goOf } from "./term";

const m = msgs(M);

export type TermFix = { k: "move" | "shift" | "tpl" | "skip" | "week"; label: string; id?: string; to?: number; by?: number; tpl?: string };
export type Clash = { kind: "overlap" | "early" | "sleep"; cls: Cls; item?: Item; text: string; fixes: TermFix[]; hint?: string; fixable: boolean };
export const SLEEP_MIN = 420, MORNING_IDS = ["weigh", "posture", "meal1", "supp1"];
export const EARLY_NOTE = m.in("th", "clash.earlyNote");
// Round E accessor (spec 9.3): consumers call this; EARLY_NOTE stays the canonical Thai text for tests.
export const earlyNote = () => m("clash.earlyNote");

// Mirrors brain/math DEFAULT_DUR (this file must not import brain/*).
const DUR: Record<string, number> = { weigh: 10, meal: 30, supp: 10, habit: 15, personality: 30, trade: 15, sing: 30, mc: 30, gym: 75, sleep: 0, care: 10 };
const KINDS = new Set(["stream", "gym", "trade", "meal", "sing", "mc"]);
const SKIPPABLE = new Set(["sing", "mc", "mc2", "mc-check", "clips", "snack2"]);
const termDays = () => WEEK_PRESETS.find((p) => p.id === TERM_PRESET)!.days;
const wakeOf = (items: Item[]) => items.find((i) => i.id === "weigh")?.min ?? items.find((i) => i.ring)?.min ?? 780;
const ceil15 = (m: number) => Math.ceil(m / 15) * 15;
const hits = (a: number, b: number, s: number, e: number) => a < e && s < b;
const withType = (s: State, date: string, tpl: string): State => ({ ...s, days: { ...s.days, [date]: { ...dayFor(s, date), type: tpl } } });
// [start, end) of an item: a block runs to its endAt item (stream -> stream-end), others use dur or the kind default.
const spanOf = (items: Item[], i: Item): [number, number] => (i.endAt ? [i.min, blockEnd(items, i) ?? i.min] : [i.min, i.min + (i.dur ?? DUR[i.kind] ?? 15)]);

type Ov = { cls: Cls; item: Item; a: number; b: number };
type Scan = {
  d: DayLog; items: Item[]; classes: Cls[]; wake: number; sleep?: Item; stream: [number, number] | null; base: string; season: boolean;
  overlaps: Ov[]; early: { cls: Cls; readyAt: number } | null; night: { cls: Cls; latestWake: number } | null;
};

function scan(s: State, date: string): Scan {
  const term = s.schedule.term, go = goOf(term);
  const d = dayFor(s, date);
  const items = itemsFor(s.schedule, d, date);
  const { key, def } = resolveTemplate(s.schedule, d.type);
  const base = s.schedule.templates?.find((t) => t.id === key)?.from ?? key;
  const classes = classesOn(term, date);
  const wake = wakeOf(items);
  const sleep = items.find((i) => i.kind === "sleep" && i.ring);
  const st = items.find((i) => i.id === "stream");
  const overlaps: Ov[] = [];
  for (const c of classes) for (const i of items) {
    if (!i.ring || d.done[i.id] || !KINDS.has(i.kind)) continue;
    const [a, b] = spanOf(items, i);
    if (hits(a, b, c.s, c.e)) overlaps.push({ cls: c, item: i, a, b });
  }
  let early: Scan["early"] = null;
  if (classes.length) {
    const mo = items.filter((i) => MORNING_IDS.includes(i.id));
    const readyAt = mo.length ? Math.max(...mo.map((i) => spanOf(items, i)[1])) : wake;
    if (readyAt + go > classes[0].s) early = { cls: classes[0], readyAt };
  }
  // Tonight vs tomorrow's first class: the wake that class needs (or the planned wake, if earlier) must leave 7 h in bed.
  let night: Scan["night"] = null;
  const tom = addDays(date, 1), c1 = classesOn(term, tom)[0];
  if (c1 && sleep) {
    const latestWake = Math.min(wakeOf(itemsFor(s.schedule, { ...dayFor(s, tom), shiftMin: 0 }, tom)), c1.s - go);
    if (latestWake + 1440 - sleep.min < SLEEP_MIN) night = { cls: c1, latestWake };
  }
  return { d, items, classes, wake, sleep, stream: st ? spanOf(items, st) : null, base, season: def.season === "stream", overlaps, early, night };
}

// Nearest valid slot just after or just before the class (inside the waking day, clear of classes and the live block,
// gym ending 60 min before live), or null.
function moveTo(sc: Scan, ov: Ov): number | null {
  const i = ov.item;
  if (!canReschedule(i)) return null;
  const dur = ov.b - ov.a, limit = (sc.sleep?.min ?? LAST + 30) - 30, st = sc.stream;
  const ok = (to: number) => to >= sc.wake + 10 && to + dur <= limit && to <= LAST
    && !sc.classes.some((c) => hits(to, to + dur, c.s, c.e)) && !(st && hits(to, to + dur, st[0], st[1]))
    && !(i.kind === "gym" && st && to + dur + 60 > st[0]);
  return [ov.cls.e + 15, ov.cls.s - dur - 15].filter(ok).sort((a, b) => Math.abs(a - i.min) - Math.abs(b - i.min))[0] ?? null;
}
const stuck = (sc: Scan) => sc.overlaps.filter((o) => moveTo(sc, o) === null && !SKIPPABLE.has(o.item.id)).length;

export const isTermWeek = (s: State) => { const t = termDays(); return s.settings.weekPlan.every((p, i) => p === t[i]); };
export function weekFix(s: State): TermFix | null {
  return s.schedule.term?.cls.length && !isTermWeek(s) ? { k: "week", label: m("clash.fix.week") } : null;
}
export function overlapCount(s: State, date: string, tplKey?: string): number {
  return scan(tplKey ? withType(s, date, tplKey) : s, date).overlaps.length;
}

// today false -> only template and week fixes (move/shift/skip are today-only levers). Fixless clashes never raise the notice.
export function termClashes(s: State, date: string, o: { today?: boolean } = {}): Clash[] {
  const sc = scan(s, date);
  if (!sc.overlaps.length && !sc.early && !sc.night) return [];
  const today = !!o.today, wk = weekFix(s);
  const tk = TERM_IDS.has(sc.base) ? TERM_ALT[sc.base] : TERM_FOR[sc.base];
  const tpl = tk && templateExists(s.schedule, tk) && resolveTemplate(s.schedule, sc.d.type).key !== tk ? tk : undefined;
  let alt: Scan | null = null;
  if (tpl) {
    const ids = new Set(itemsFor(s.schedule, { ...sc.d, type: tpl }, date).map((i) => i.id));
    if (Object.keys(sc.d.done).every((id) => ids.has(id))) alt = scan(withType(s, date, tpl), date);
  }
  const tplFix = (good: boolean): TermFix[] => (alt && tpl && good
    ? [{ k: "tpl", tpl, label: m("clash.fix.tpl", { name: resolveTemplate(s.schedule, tpl).def.name, when: today ? m("clash.when.today") : m("clash.when.that") }) }] : []);
  const out: Clash[] = [];
  const push = (c: Omit<Clash, "fixable">) => out.push({ ...c, fixes: c.fixes.slice(0, 3), fixable: c.fixes.length > 0 });
  const altOverlapOk = !!alt && (alt.overlaps.length < sc.overlaps.length || (alt.overlaps.length <= sc.overlaps.length && stuck(alt) < stuck(sc)));
  for (const ov of sc.overlaps) {
    const fixes = tplFix(altOverlapOk);
    const to = moveTo(sc, ov);
    if (today && to !== null) fixes.push({ k: "move", id: ov.item.id, to, label: m("clash.fix.move", { title: ov.item.title, time: hm(to) }) });
    if (today && to === null && SKIPPABLE.has(ov.item.id)) fixes.push({ k: "skip", id: ov.item.id, label: m("clash.fix.skip", { title: ov.item.title }) });
    if (wk) fixes.push(wk);
    let hint: string | undefined;
    if (ov.item.kind === "gym" && to === null && sc.base === "term-gym") hint = m("clash.hint.gym");
    else if (ov.item.id === "stream" && !fixes.length) hint = m("clash.hint.stream");
    push({ kind: "overlap", cls: ov.cls, item: ov.item, text: m("clash.text.overlap", { cls: ov.cls.t, span: clsSpan(ov.cls), title: ov.item.title, time: hm(ov.a) }), fixes, ...(hint ? { hint } : {}) });
  }
  if (sc.early) {
    const { cls: c, readyAt } = sc.early, go = goOf(s.schedule.term);
    const fixes = tplFix(!!alt && !alt.early && alt.overlaps.length <= sc.overlaps.length);
    const by = -ceil15(readyAt + go - c.s);
    const shift = today && !sc.season && sc.wake + by >= 480;
    if (shift) fixes.push({ k: "shift", by, label: m("clash.fix.shift", { n: -by }) });
    push({ kind: "early", cls: c, text: m("clash.text.early", { cls: c.t, start: hm(c.s), arrive: hm(readyAt + go) }), fixes, ...(shift ? {} : { hint: earlyNote() }) });
  }
  if (sc.night && sc.sleep) {
    const { cls: c, latestWake } = sc.night;
    const fixes = tplFix(!!alt && !alt.night);
    if (wk) fixes.push(wk);
    const bedBy = latestWake + 1440 - SLEEP_MIN;
    const hint = !sc.stream || bedBy >= sc.stream[1] ? m("clash.hint.bed", { time: hm(bedBy) }) : undefined;
    push({ kind: "sleep", cls: c, text: m("clash.text.sleep", { start: hm(c.s), sleep: hm(sc.sleep.min) }), fixes, ...(hint ? { hint } : {}) });
  }
  return out;
}

// One row per date for /settings/term "สัปดาห์นี้". `today` (optional) gets the today-only fixes counted.
export function weekClashes(s: State, from: string, n = 7, today?: string) {
  return Array.from({ length: n }, (_, k) => {
    const date = addDays(from, k);
    const cs = classesOn(s.schedule.term, date);
    const list = termClashes(s, date, { today: date === today });
    return {
      date, tpl: resolveTemplate(s.schedule, dayFor(s, date).type).key, classes: cs.length,
      span: cs.length ? `${hm(cs[0].s)}-${hm(Math.max(...cs.map((c) => c.e)))}` : "",
      clashes: list.length, fixable: list.filter((c) => c.fixable).length,
    };
  });
}

// Class windows on the next 7 days (from today) whose day uses this template: a template-level move must stay clear of them.
export function classWindowsFor(s: State, tplKey: string, today: string): [number, number][] {
  const key = resolveTemplate(s.schedule, tplKey).key, out: [number, number][] = [];
  for (let k = 0; k < 7; k++) {
    const date = addDays(today, k);
    if (resolveTemplate(s.schedule, dayFor(s, date).type).key !== key) continue;
    for (const c of classesOn(s.schedule.term, date)) if (!out.some(([a, b]) => a === c.s && b === c.e)) out.push([c.s, c.e]);
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

export function applyTermFix(x: State, date: string, f: TermFix) {
  if (f.k === "week") { applyWeekPlan(x, termDays()); return; }
  if (f.k === "tpl") { if (f.tpl) setDayTemplate(x, date, f.tpl); return; }
  if (f.k === "shift") { const d = dayFor(x, date); d.shiftMin = (d.shiftMin ?? 0) + (f.by ?? 0); x.days[date] = d; return; }
  const it = itemsFor(x.schedule, dayFor(x, date), date).find((i) => i.id === f.id);
  if (!it) return;
  if (f.k === "move" && f.to !== undefined) moveItem(x, date, it, f.to);
  else if (f.k === "skip") skipItem(x, date, it, true);
}

export type FixSnap = { date: string; day: DayLog | null; weekPlan: (string | null)[]; planAsked: boolean };
export const snapFix = (s: State, date: string): FixSnap =>
  structuredClone({ date, day: s.days[date] ?? null, weekPlan: s.settings.weekPlan, planAsked: s.settings.planAsked });

// Restores type, shiftMin, moved, skip, skipWhy of that day (keeps the log; deletes the keys when they did not exist),
// plus weekPlan and planAsked. Sets reschedAt = now when moved or skip existed on either side so a later merge never revives it.
export function undoFix(x: State, snap: FixSnap, now = Date.now()) {
  x.settings.weekPlan = [...snap.weekPlan];
  x.settings.planAsked = snap.planAsked;
  const d = x.days[snap.date], o = snap.day;
  if (!d) return;
  const resched = !!(d.moved || d.skip || o?.moved || o?.skip);
  d.type = o?.type ?? plannedType(x, snap.date);
  if (o?.shiftMin !== undefined) d.shiftMin = o.shiftMin; else delete d.shiftMin;
  if (o?.moved) d.moved = structuredClone(o.moved); else delete d.moved;
  if (o?.skip) d.skip = structuredClone(o.skip); else delete d.skip;
  if (o?.skipWhy) d.skipWhy = structuredClone(o.skipWhy); else delete d.skipWhy;
  if (resched) d.reschedAt = now;
}

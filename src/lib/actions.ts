// State mutations shared by the Today list and the quick-log wizard (so both log the same way).
import { ROLLOVER_HOUR, addDays, logicalDate, logicalMinutes } from "./date";
import { dayFor, type DayLog, type State, type TickSrc } from "./model";
import { GYM_CYCLE, PERSONALITY_CYCLE, nextInCycle } from "./rotation";
import { LAST, buildDay, canReschedule, itemsFor, resolveTemplate, taperDone, templateExists, type Item } from "./schedule";
import { BUILTIN_IDS, TERM_PRESET, WEEK_PRESETS } from "./templates";
import { clearSrc, isLateTick, untimedKind } from "./ticks";

// Tick or untick an item. Gym/personality items also record which rotation step was done.
// A tick more than 60 min after its planned time is stored as "late" (unconfirmed) unless opt.src says otherwise;
// sleep and weigh never get a source (their time comes from their own buttons).
export function setDone(x: State, date: string, item: Item, on: boolean, gymCode?: string, opt: { at?: number; src?: TickSrc | null } = {}) {
  const d = dayFor(x, date);
  if (on) {
    const ts = opt.at ?? Date.now();
    d.done[item.id] = ts;
    const src = untimedKind(item.kind) ? null : opt.src !== undefined ? opt.src : isLateTick(date, item.min, ts) ? "late" : null;
    if (src) (d.doneSrc ??= {})[item.id] = { src, ts };
    else clearSrc(d, item.id);
    // A tick from a plan view (e.g. /gym via buildDay) ends a "ข้ามวันนี้" for that item, so it shows and scores as done.
    if (d.skip?.[item.id]) { const m = { ...d.skip }; delete m[item.id]; if (Object.keys(m).length) d.skip = m; else delete d.skip; dropWhy(d, item.id); d.reschedAt = Date.now(); }
  } else {
    delete d.done[item.id];
    clearSrc(d, item.id);
  }
  x.days[date] = d;
  // Ticking "นอน" in the list counts as pressing the bedtime button.
  if (item.kind === "sleep") markSleep(x, date, on);
  if (item.kind === "gym") {
    x.workouts = x.workouts.filter((w) => w.date !== date);
    // The cardio item logs a rest-day code; the gym item continues the D1-D4 rotation.
    if (on) x.workouts.push({ date, code: item.id === "cardio" ? gymCode ?? "R" : gymCode ?? nextInCycle(GYM_CYCLE, x.workouts) });
  }
  if (item.kind === "personality") {
    x.personality = x.personality.filter((w) => w.date !== date);
    if (on) x.personality.push({ date, code: nextInCycle(PERSONALITY_CYCLE, x.personality) });
  }
}

// The answer to the late-tick ask: move the tick to the confirmed time. No-op once the item was unticked.
export function setTickTime(x: State, date: string, id: string, ts: number, src: TickSrc) {
  const d = x.days[date];
  if (!d?.done[id]) return;
  d.done[id] = ts;
  (d.doneSrc ??= {})[id] = { src, ts };
}

// "เข้านอน" (on) / "ยังไม่นอน" (off). With sleepDnd, reminders pause until tomorrow's planned wake-up
// (4-14 h, global shift only, from tomorrow's template) and the previous pause is restored when the bedtime is undone.
export function markSleep(x: State, date: string, on: boolean, now = Date.now()) {
  const d = dayFor(x, date);
  if (on) {
    d.sleepAt = now;
    d.done.sleep = now;
    if (x.settings.sleepDnd) {
      const tom = addDays(date, 1);
      const nd = dayFor(x, tom);
      const items = buildDay(nd.type, nd.meal2, x.schedule, 0, { date: tom });
      const wake = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 780;
      const minsToWake = wake + 1440 - logicalMinutes(new Date(now));
      d.dndBefore = x.settings.dndUntil;
      x.settings.dndUntil = now + Math.max(240, Math.min(840, minsToWake)) * 60_000;
    }
  } else {
    delete d.sleepAt;
    delete d.done.sleep;
    // Restore only a pause this bedtime replaced; with sleepDnd off it never touched dndUntil.
    if (d.dndBefore !== undefined) x.settings.dndUntil = d.dndBefore;
    delete d.dndBefore;
  }
  x.days[date] = d;
}

// Upsert (kg) or remove (null) a weigh-in. Only today's entry ticks/unticks the "ชั่งน้ำหนัก" item;
// past days keep their score and a backdated entry never creates a day log.
export function setWeight(x: State, date: string, kg: number | null, today = logicalDate()) {
  x.weights = x.weights.filter((w) => w.date !== date);
  if (kg !== null) x.weights.push({ date, kg });
  if (date !== today) return;
  if (kg === null) { delete x.days[date]?.done.weigh; return; }
  const d = dayFor(x, date);
  d.done.weigh = Date.now();
  x.days[date] = d;
}

// Use template `id` for this date; ticks stay (core ids are shared across templates).
export function setDayTemplate(x: State, date: string, id: string) {
  const d = dayFor(x, date);
  d.type = id;
  x.days[date] = d;
}

// Voice rest hides today's singing items (not scored).
export function setVoiceRest(x: State, date: string, on: boolean) {
  const d = dayFor(x, date);
  if (on) d.voiceRest = true;
  else delete d.voiceRest;
  x.days[date] = d;
}

// Today-only reschedule (snooze / move): the template keeps the planned time. null or the planned minute = back to plan;
// an empty map is removed (mergeStates treats absence as the newer value).
export function moveItem(x: State, date: string, item: Item, min: number | null) {
  if (!canReschedule(item)) return;
  const planned = item.planMin ?? item.min;
  const d = dayFor(x, date);
  const m = { ...d.moved };
  const v = min === null ? null : Math.max(ROLLOVER_HOUR * 60, Math.min(LAST, Math.round(min)));
  if (v === null || v === planned) delete m[item.id]; else m[item.id] = v;
  if (Object.keys(m).length) d.moved = m; else delete d.moved;
  d.reschedAt = Date.now();
  x.days[date] = d;
}

// "ข้ามวันนี้": hidden, not scored, no reminders. A done item is never skipped.
export function skipItem(x: State, date: string, item: Item, on: boolean) {
  const d = dayFor(x, date);
  const m = { ...d.skip };
  if (on) {
    if (d.done[item.id] || !canReschedule(item)) return;
    m[item.id] = Date.now();
  } else { delete m[item.id]; dropWhy(d, item.id); }
  if (Object.keys(m).length) d.skip = m; else delete d.skip;
  d.reschedAt = Date.now();
  x.days[date] = d;
}

// v1.7: a skip reason lives only as long as its skip (same reschedAt clock); an empty map is removed.
function dropWhy(d: DayLog, id: string) {
  if (!d.skipWhy?.[id]) return;
  const w = { ...d.skipWhy }; delete w[id];
  if (Object.keys(w).length) d.skipWhy = w; else delete d.skipWhy;
}

// +by minutes from the later of the item's time and now, rounded up to 5 min, never past 07:59.
export const snoozeTarget = (item: Item, nowMin: number, by = 30) => Math.min(LAST, Math.ceil((Math.max(item.min, nowMin) + by) / 5) * 5);

// Water +/- ml (negative = undo or -250), floored at 0; returns the new total.
export function addWater(x: State, date: string, ml: number): number {
  const d = dayFor(x, date);
  d.waterMl = Math.max(0, (d.waterMl || 0) + ml);
  x.days[date] = d;
  return d.waterMl;
}

export function applyWeekPlan(x: State, days: (string | null)[]) {
  x.settings.weekPlan = Array.from({ length: 7 }, (_, i) => days[i] ?? null);
  x.settings.planAsked = true;
}

export const STREAM_PRESET = "stream";
const streamDays = (preset = STREAM_PRESET) => WEEK_PRESETS.find((p) => p.id === preset)!.days;

// Offer for the Today card: advance from last night's bedtime to the season bedtime, stepMin per day, starting
// today (unlogged) or tomorrow (logged). Computed on the schedule without any taper. null = less than 15 min to gain.
// v1.8: `preset` picks the target week (TERM_PRESET for the term season).
export function taperOffer(s: State, today: string, stepMin = 30, preset = STREAM_PRESET): { start: string; fromMin: number; stepMin: number; firstWake: number; doneDate: string } | null {
  const cfg = { ...s.schedule, taper: null };
  const start = s.days[today] ? addDays(today, 1) : today;
  const tpl = streamDays(preset)[new Date(start + "T12:00:00").getDay()];
  const ref = addDays(start, -1);
  const old = itemsFor(cfg, dayFor(s, ref), ref).find((i) => i.kind === "sleep")?.min;
  const neu = buildDay(tpl, undefined, cfg, 0, { date: start }).find((i) => i.kind === "sleep")?.min;
  if (old === undefined || neu === undefined) return null;
  const fromMin = Math.min(300, Math.round((old - neu) / 15) * 15 - stepMin);
  if (fromMin < 15) return null;
  const t = { start, fromMin, stepMin };
  const list = buildDay(tpl, undefined, { ...cfg, taper: t }, 0, { date: start });
  const firstWake = list.find((i) => i.id === "weigh")?.min ?? list.find((i) => i.ring)?.min; // weigh may be switched off
  if (firstWake === undefined) return null;
  return { ...t, firstWake, doneDate: taperDone(t) };
}

// The Today card's confirm: week preset + job "no" (both stated on the card, restored by its undo) + optional taper.
export function startStreamSeason(x: State, today: string, taper: boolean) {
  const o = taper ? taperOffer(x, today) : null;
  applyWeekPlan(x, streamDays()); // also sets planAsked
  x.settings.job = "no";
  x.settings.streamAsked = true;
  x.schedule.taper = o ? { start: o.start, fromMin: o.fromMin, stepMin: o.stepMin } : null;
  return o;
}

// v1.8 TermPlan confirm: the term week preset (sets planAsked) + the optional term taper (null otherwise).
export function startTermSeason(x: State, today: string, taper: boolean) {
  const o = taper ? taperOffer(x, today, 30, TERM_PRESET) : null;
  applyWeekPlan(x, streamDays(TERM_PRESET));
  x.schedule.taper = o ? { start: o.start, fromMin: o.fromMin, stepMin: o.stepMin } : null;
  return o;
}

// Back on plan from today (unlogged) or tomorrow (logged); earlier taper days keep their history.
export function stopTaper(x: State, today: string) {
  const t = x.schedule.taper;
  if (t) x.schedule.taper = { ...t, stop: x.days[today] ? addDays(today, 1) : today };
}

// Copy a template (built-in or user) as a new user template with its overrides and own custom items.
// Custom items stored under "work"/"off" already reach every template of that base, so they are not copied.
export function duplicateTemplate(x: State, srcKey: string, name: string, now = Date.now()): string {
  const list = (x.schedule.templates ??= []);
  const from = BUILTIN_IDS.has(srcKey) ? srcKey : list.find((t) => t.id === srcKey)?.from ?? "off";
  const { def } = resolveTemplate(x.schedule, srcKey);
  let n = now;
  while (templateExists(x.schedule, `u-${n.toString(36)}`)) n++;
  const id = `u-${n.toString(36)}`;
  const map: Record<string, string> = {};
  if (srcKey !== def.base) {
    x.schedule.custom.filter((c) => c.days === srcKey).forEach((c, i) => {
      map[c.id] = `c-${now.toString(36)}${i}`;
      x.schedule.custom.push({ ...c, id: map[c.id], days: id });
    });
  }
  for (const [k, o] of Object.entries(x.schedule.overrides)) {
    if (!k.startsWith(`${srcKey}:`)) continue;
    const itemId = k.slice(srcKey.length + 1);
    x.schedule.overrides[`${id}:${map[itemId] ?? itemId}`] = { ...o };
  }
  list.push({ id, name: name.trim().slice(0, 40) || def.name, from });
  return id;
}

export function renameTemplate(x: State, id: string, name: string) {
  const t = x.schedule.templates?.find((u) => u.id === id);
  const n = name.trim().slice(0, 40);
  if (t && n) t.name = n;
}

// User templates only: removes it with its overrides and custom items; week-plan slots fall back to the
// default rule and stored days switch to the built-in it was copied from.
export function deleteTemplate(x: State, id: string): boolean {
  const t = x.schedule.templates?.find((u) => u.id === id);
  if (!t || BUILTIN_IDS.has(id)) return false;
  x.schedule.templates = x.schedule.templates!.filter((u) => u.id !== id);
  for (const k of Object.keys(x.schedule.overrides)) if (k.startsWith(`${id}:`)) delete x.schedule.overrides[k];
  x.schedule.custom = x.schedule.custom.filter((c) => c.days !== id);
  x.settings.weekPlan = x.settings.weekPlan.map((p) => (p === id ? null : p));
  for (const d of Object.values(x.days)) if (d.type === id) d.type = t.from;
  return true;
}

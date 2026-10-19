// State mutations shared by the Today list and the quick-log wizard (so both log the same way).
import { addDays, logicalDate, logicalMinutes } from "./date";
import { dayFor, type State } from "./model";
import { GYM_CYCLE, PERSONALITY_CYCLE, nextInCycle } from "./rotation";
import { buildDay, resolveTemplate, templateExists, type Item } from "./schedule";
import { BUILTIN_IDS } from "./templates";

// Tick or untick an item. Gym/personality items also record which rotation step was done.
export function setDone(x: State, date: string, item: Item, on: boolean, gymCode?: string) {
  const d = dayFor(x, date);
  if (on) d.done[item.id] = Date.now();
  else delete d.done[item.id];
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

export function applyWeekPlan(x: State, days: (string | null)[]) {
  x.settings.weekPlan = Array.from({ length: 7 }, (_, i) => days[i] ?? null);
  x.settings.planAsked = true;
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

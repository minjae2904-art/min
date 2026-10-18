// State mutations shared by the Today list and the quick-log wizard (so both log the same way).
import { logicalDate, logicalMinutes } from "./date";
import { dayFor, type State } from "./model";
import { GYM_CYCLE, PERSONALITY_CYCLE, nextInCycle } from "./rotation";
import { buildDay, type Item } from "./schedule";

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
    if (on) x.workouts.push({ date, code: d.type === "off" ? gymCode ?? "R" : gymCode ?? nextInCycle(GYM_CYCLE, x.workouts) });
  }
  if (item.kind === "personality") {
    x.personality = x.personality.filter((w) => w.date !== date);
    if (on) x.personality.push({ date, code: nextInCycle(PERSONALITY_CYCLE, x.personality) });
  }
}

// "เข้านอน" (on) / "ยังไม่นอน" (off). With sleepDnd, reminders pause until tomorrow's planned wake-up
// (4-14 h, global shift only) and the previous pause is restored when the bedtime is undone.
export function markSleep(x: State, date: string, on: boolean, now = Date.now()) {
  const d = dayFor(x, date);
  if (on) {
    d.sleepAt = now;
    d.done.sleep = now;
    if (x.settings.sleepDnd) {
      const items = buildDay(d.type, d.meal2, x.schedule, 0);
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

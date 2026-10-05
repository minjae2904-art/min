// State mutations shared by the Today list and the quick-log wizard (so both log the same way).
import { emptyDay, type State } from "./model";
import { GYM_CYCLE, PERSONALITY_CYCLE, nextInCycle } from "./rotation";
import type { Item } from "./schedule";

// Tick or untick an item. Gym/personality items also record which rotation step was done.
export function setDone(x: State, date: string, item: Item, on: boolean, gymCode?: string) {
  const d = x.days[date] ?? emptyDay();
  if (on) d.done[item.id] = Date.now();
  else delete d.done[item.id];
  // Ticking "นอน" in the list counts as pressing the bedtime button.
  if (item.kind === "sleep") { if (on) d.sleepAt ??= Date.now(); else delete d.sleepAt; }
  x.days[date] = d;
  if (item.kind === "gym") {
    x.workouts = x.workouts.filter((w) => w.date !== date);
    if (on) x.workouts.push({ date, code: d.type === "off" ? gymCode ?? "R" : gymCode ?? nextInCycle(GYM_CYCLE, x.workouts) });
  }
  if (item.kind === "personality") {
    x.personality = x.personality.filter((w) => w.date !== date);
    if (on) x.personality.push({ date, code: nextInCycle(PERSONALITY_CYCLE, x.personality) });
  }
}

// App icon badge = required items whose time has come and are not done. Required = pending ring items except care
// rows, routine rows, sleep and class. An item due during class counts from the class end (quietAt). 0 when the
// setting is off, after today's sleepAt, or from sleep + 60 (day end). Capped at 99. Shared by client and push tick.
import { logicalDate, logicalMinutes } from "./date";
import { dayFor, type State } from "./model";
import { itemsFor } from "./schedule";
import { quietAt } from "./term";

export function badgeCount(s: State, now: Date): number {
  if (s.settings.badge === false) return 0;
  const date = logicalDate(now), nowMin = logicalMinutes(now);
  const day = dayFor(s, date);
  if (typeof day.sleepAt === "number") return 0;
  const all = itemsFor(s.schedule, day, date);
  const sleep = all.find((i) => i.kind === "sleep" && i.ring);
  if (sleep && nowMin >= sleep.min + 60) return 0;
  const n = all.filter((i) => i.ring && !day.done[i.id] && i.kind !== "care" && i.kind !== "sleep" && i.kind !== "class" && !i.routine && quietAt(all, i.min) <= nowMin).length;
  return Math.min(99, n);
}

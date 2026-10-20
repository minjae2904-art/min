// Weekly review day (pure, shared by the UI and reminders). -1 = the first week-plan slot that is a rest day
// (Sunday first, user copies of "rest" count), else Sunday. weekKey = the latest review day <= today.
import { addDays } from "../date";
import type { State } from "../model";
import { baseOf } from "./signals";
import type { AreaKey } from "./types";

export function reviewDow(s: State): number {
  const d = s.settings.brainReviewDow;
  if (Number.isInteger(d) && d >= 0 && d <= 6) return d;
  const i = s.settings.weekPlan.findIndex((t) => !!t && baseOf(s, t) === "rest");
  return i >= 0 ? i : 0;
}
export function weekKey(s: State, today: string): string {
  const back = (new Date(today + "T12:00:00").getDay() - reviewDow(s) + 7) % 7;
  return addDays(today, -back);
}
// The review card shows on the review day and the day after, until that week is done.
export const reviewDue = (s: State, today: string) => { const k = weekKey(s, today); return (today === k || today === addDays(k, 1)) && s.brain.reviewDone !== k; };

// Review step 4: raise the pick to "เน้น" and return the previous review's pick to "ปกติ" (only while still "เน้น").
// A pick that was already "เน้น" by hand is not recorded, so a manual "เน้น" is never cleared by a later review.
export function pickReviewFocus(x: State, focus: AreaKey) {
  const p = { ...x.settings.areaPriority }, prev = x.brain.reviewFocus, raise = p[focus] !== 2;
  if (prev && prev !== focus && p[prev] === 2) p[prev] = 1;
  p[focus] = 2;
  x.settings.areaPriority = p;
  x.brain.reviewFocus = raise || prev === focus ? focus : null;
}

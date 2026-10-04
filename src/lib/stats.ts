// Single source of truth for derived numbers (Today, Body, reports, and later the AI coach).
// Same idea as min1lot-web lib/progress.js: compute once here, feed only summaries to AI.
import { addDays } from "./date";
import { trend } from "./health";
import { buildDay } from "./schedule";
import type { DayLog, State } from "./model";

export function dayScore(d: DayLog | undefined): number {
  if (!d) return 0;
  const items = buildDay(d.type, d.meal2).filter((i) => i.ring);
  return items.length ? items.filter((i) => d.done[i.id]).length / items.length : 0;
}

const GOOD = 0.7;

// Consecutive good days ending yesterday (+ today if already good).
// One missed day is forgiven ("never miss twice"): research shows a single miss does not break habit formation.
export function streak(s: State, today: string): { days: number; forgiven: boolean } {
  let days = dayScore(s.days[today]) >= GOOD ? 1 : 0;
  let forgiven = false;
  for (let i = 1; i < 400; i++) {
    const good = dayScore(s.days[addDays(today, -i)]) >= GOOD;
    if (good) days++;
    else if (!forgiven && dayScore(s.days[addDays(today, -i - 1)]) >= GOOD) forgiven = true;
    else break;
  }
  return { days, forgiven };
}

export function week(s: State, today: string) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const scores = dates.map((d) => ({ date: d, score: dayScore(s.days[d]) }));
  return { scores, goodDays: scores.filter((x) => x.score >= GOOD).length, avg: scores.reduce((a, x) => a + x.score, 0) / 7 };
}

export function weightStats(s: State, today: string) {
  const t = trend(s.weights);
  const cur = t.at(-1)?.trend ?? s.profile.startKg;
  const prev = [...t].reverse().find((w) => w.date <= addDays(today, -7))?.trend;
  const rate = prev !== undefined ? cur - prev : null;
  return { series: t, cur, rate };
}

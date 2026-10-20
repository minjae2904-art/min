// Follow-up evaluation of applied changes (derived, never written in the background). Hedged: change, not cause.
import { addDays } from "../date";
import type { State } from "../model";
import { sleepDebt, timeBudget } from "../stats";
import { areaOn, checkinsIn, rateAt, weighInsIn, windowCtx } from "./areas";
import { mean, median, sd } from "./math";
import { extractDays } from "./signals";
import { AREAS, type AppliedRec, type AreaKey, type DaySig, type EvalResult, type EvalSpec, type RuleStats } from "./types";

type M = { v: number | null; n: number };
// Per-report cache: one shared signal range (DaySig is per date, so slices equal fresh extracts) + game minutes by window start.
export type Pool = { all: DaySig[] | null; game: Map<string, number> };
export const newPool = (all: DaySig[] | null = null): Pool => ({ all, game: new Map() });
type Fn = (s: State, from: string, to: string, p: Pool) => M;
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const span = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
// Signals of [from, to]; every day of a past window counts as completed.
const sigsOf = (s: State, from: string, to: string, p: Pool) => {
  const a = p.all;
  if (a?.length && a[0].date <= from && a[a.length - 1].date >= to) return a.filter((d) => d.date >= from && d.date <= to);
  return extractDays(s, to, Math.max(1, span(from, to)));
};
const ctxOf = (s: State, from: string, to: string, p: Pool) => {
  const all = sigsOf(s, addDays(to, 1 - Math.max(28, span(from, to))), to, p);
  let g = p.game.get(from);
  if (g === undefined) p.game.set(from, (g = timeBudget(s, from, 7).game));
  return windowCtx(s, all, from, to, addDays(to, 1), g);
};
const part = (key: AreaKey, k: string, n: (d: DaySig[]) => number): Fn => (s, from, to, p) => {
  const c = ctxOf(s, from, to, p);
  return { v: areaOn(key, c).parts[k] ?? null, n: n(c.comp) };
};
const logged = (d: DaySig[]) => d.filter((x) => x.logged).length;

export const METRICS: Record<string, Fn> = {
  "leisure.bedLate": (s, f, t, p) => { const x = sigsOf(s, f, t, p).filter((d) => d.logged && d.game.planned && d.bedLate !== null).map((d) => d.bedLate!); return { v: mean(x), n: x.length }; },
  "sleep.wakeSd": (s, f, t, p) => { const x = sigsOf(s, f, t, p).map((d) => d.wakeMin).filter(fin); return { v: sd(x), n: x.length }; },
  "sleep.debt": (s, _f, t) => { const d = sleepDebt(s, t, 7); return { v: d.nights ? d.hours : null, n: d.nights }; },
  "sleep.jetlag": (s, _f, t, p) => {
    const x = sigsOf(s, addDays(t, -27), t, p).filter((d) => d.midSleep !== null);
    const w = x.filter((d) => d.work).map((d) => d.midSleep!), o = x.filter((d) => !d.work).map((d) => d.midSleep!);
    return { v: w.length && o.length ? Math.abs(median(w)! - median(o)!) : null, n: Math.min(w.length, o.length) };
  },
  "nutrition.rate": (s, f, t) => { const r = rateAt(s, t); return { v: r.rate === null ? null : r.rate < r.lo ? r.lo - r.rate : r.rate > r.hi ? r.rate - r.hi : 0, n: weighInsIn(s, f, t) }; },
  "nutrition.water": (s, f, t, p) => { const x = sigsOf(s, f, t, p).filter((d) => d.logged); return { v: x.length ? x.filter((d) => d.water.ml >= d.water.goal).length / x.length : null, n: x.length }; },
  "training.attend": part("training", "attend", (d) => d.filter((x) => x.logged && x.gym.planned).length),
  "voice.adh": part("voice", "adh", (d) => d.filter((x) => x.logged && x.sing.planned).length),
  "voice.rhythm": part("voice", "rhythm", logged),
  "trading.atLimit": part("trading", "atLimit", (d) => d.filter((x) => x.trade.log).length),
  "projects.build": part("projects", "build", (d) => d.filter((x) => x.logged && x.mc.buildPlanned).length),
  "consistency.missTwice": part("consistency", "missTwice", logged),
  "recovery.level": (s, f, t) => { const x = checkinsIn(s, f, t).map((c) => (c.e + c.m) / 2); return { v: mean(x), n: x.length }; },
};
for (const a of AREAS) METRICS[`area:${a}`] = (s, f, t, p) => { const c = ctxOf(s, f, t, p); return { v: areaOn(a, c).score, n: logged(c.comp) }; };

export function metricOf(s: State, metric: string, from: string, to: string, p: Pool = newPool()): M {
  const fn = METRICS[metric];
  if (fn) return fn(s, from, to, p);
  const m = /^item\.(done|delay):(.+)$/.exec(metric);
  if (!m) return { v: null, n: 0 };
  const rows = sigsOf(s, from, to, p).filter((d) => d.logged).map((d) => d.items.find((i) => i.id === m[2])).filter((i) => !!i);
  if (m[1] === "done") return { v: rows.length ? rows.filter((i) => i!.done).length / rows.length : null, n: rows.length };
  const ds = rows.map((i) => i!.delay).filter(fin);
  return { v: mean(ds), n: ds.length };
}

// Baseline over the window before `date` (captured at apply time).
export const baselineFor = (s: State, spec: EvalSpec, date: string, p?: Pool) => metricOf(s, spec.metric, addDays(date, -spec.windowDays), addDays(date, -1), p);

export function evaluateApplied(s: State, rec: AppliedRec, today: string, p: Pool = newPool()): EvalResult {
  const r: EvalResult = { id: rec.id, rule: rec.rule, status: "none", base: rec.eval?.base ?? null, post: null, due: null };
  if (!rec.eval) return r;
  const { windowDays: wd, dir, min } = rec.eval;
  r.due = addDays(rec.date, wd);
  if (today < r.due) return { ...r, status: "waiting" };
  const post = metricOf(s, rec.eval.metric, rec.date, addDays(rec.date, wd - 1), p);
  const baseN = baselineFor(s, rec.eval, rec.date, p).n;
  r.post = post.v;
  if (post.v === null || r.base === null || post.n < 4 || baseN < 4) return { ...r, status: "done", verdict: "nodata" };
  const d = (post.v - r.base) * dir, eps = 1e-9; // eps: 3.3 - 3 must still reach min 0.3
  return { ...r, status: "done", verdict: d >= min - eps ? "better" : d <= -min + eps ? "worse" : "same" };
}

const dayMs = (date: string) => Date.parse(date + "T12:00:00+07:00");
// Signals covering every past-due record's baseline + post windows (each needs 28 days of context), capped at a year.
export function evalPool(s: State, today: string, minDays = 28): Pool {
  let from = addDays(today, 1 - minDays);
  for (const r of s.brain.applied) if (r.eval) { const f = addDays(r.date, -r.eval.windowDays - 28); if (f < from) from = f; }
  return newPool(extractDays(s, today, Math.min(366, Math.max(minDays, span(from, today)))));
}
export const evaluateAll = (s: State, today: string, p: Pool = evalPool(s, today)) => s.brain.applied.map((r) => evaluateApplied(s, r, today, p));

// `evals` (from evaluateAll) avoids evaluating every record a second time.
export function ruleStats(s: State, today: string, evals?: EvalResult[]): RuleStats {
  const out: RuleStats = {};
  const get = (k: string) => (out[k] ??= { ap: 0, better: 0, worse: 0, rej: 0 });
  const p = evals ? undefined : evalPool(s, today);
  for (const rec of s.brain.applied) {
    if (rec.undoneAt) continue;
    const e = evals?.find((x) => x.id === rec.id) ?? evaluateApplied(s, rec, today, p);
    const g = get(rec.rule);
    g.ap++;
    if (e.verdict === "better") g.better++;
    if (e.verdict === "worse") g.worse++;
  }
  const since = dayMs(today) - 60 * 86_400_000;
  for (const d of s.brain.decisions) if (d.d === "r" && d.at >= since) get(d.rule).rej++;
  return out;
}
export const ruleMult = (st: { better: number; worse: number } | undefined) => Math.max(0.7, Math.min(1.3, 1 + 0.15 * ((st?.better ?? 0) - (st?.worse ?? 0))));

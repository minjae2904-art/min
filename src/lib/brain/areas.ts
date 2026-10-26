// Nine life-area scores (0-100), confidence, trend, and the Balance number (pure, derived, never stored).
import { addDays } from "../date";
import { hasCheckin, type Settings, type State } from "../model";
import { sleepDebt, timeBudget, weightStats } from "../stats";
import { BASE_W, T, clamp01, lin, mean, mix, paceBand, sd } from "./math";
import { isRestTpl } from "./signals";
import { AREAS, type AreaKey, type AreaResult, type Balance, type DaySig } from "./types";

// win = window days (night-based fields), comp = its completed days (today excluded), end = last date of the window.
export type Ctx = { s: State; end: string; win: DaySig[]; comp: DaySig[]; all: DaySig[]; gameWeekMin: number };
type Out = { parts: Record<string, number | null>; ev: Record<string, number | null>; conf: number };
type Def = { target: number; w: Record<string, number>; fn: (c: Ctx) => Out };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const longestRun = (days: DaySig[], f: (d: DaySig) => boolean) => {
  let best = 0, cur = 0;
  for (const d of days) { cur = f(d) ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
};
// Check-ins straight from the logs (recovery needs 4 weeks of history for its baseline).
export function checkinsIn(s: State, from: string, to: string) {
  const out: { date: string; e: number; m: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const x = s.days[d]; if (x && hasCheckin(x)) out.push({ date: d, e: x.checkin.energy, m: x.checkin.mood }); }
  return out;
}
export const weightsUpTo = (s: State, end: string): State => ({ ...s, weights: s.weights.filter((w) => w.date <= end) });
export function rateAt(s: State, end: string) {
  const w = weightStats(weightsUpTo(s, end), end);
  const [lo, hi] = paceBand(w.cur);
  return { rate: w.rate, lo, hi, kg: w.cur };
}
// Pace part: below the band ramps up from 0, inside = 1, above ramps down to 0 at twice the top.
export const paceScore = (rate: number, lo: number, hi: number) => (rate < lo ? lin(rate, 0, lo) : rate <= hi ? 1 : lin(rate, 2 * hi, hi));
// UI arrow: only a change of 5 points or more.
export const trendDir = (t: number | null) => (t === null || Math.abs(t) < T.trendArrow ? null : t > 0 ? "up" : "down");
export const weighInsIn = (s: State, from: string, to: string) => s.weights.filter((w) => w.date >= from && w.date <= to).length;

const sleep: Def = {
  target: 75, w: { dur: 0.3, reg: 0.25, bedReg: 0.1, debt: 0.2, feel: 0.15 },
  fn: ({ s, end, win, comp }) => {
    const hs = win.map((d) => d.sleepH).filter(fin);
    const avgH = mean(hs);
    const wakes = win.map((d) => d.wakeMin).filter(fin), beds = comp.map((d) => d.bedMin).filter(fin);
    const wakeSd = wakes.length >= 3 ? sd(wakes) : null, bedSd = beds.length >= 3 ? sd(beds) : null;
    const debt = sleepDebt(s, end, 7);
    const debtH = debt.nights >= 3 ? debt.hours : null;
    const sq = mean(win.map((d) => d.checkin?.sq).filter(fin));
    return {
      parts: {
        dur: avgH === null ? null : avgH <= 9 ? lin(avgH, 5, 7.5) : lin(avgH, 11, 9),
        reg: wakeSd === null ? null : lin(wakeSd, 150, 45),
        bedReg: bedSd === null ? null : lin(bedSd, 150, 45),
        debt: debtH === null ? null : lin(debtH, 12, 2),
        feel: sq === null ? null : (sq - 1) / 4,
      },
      ev: { avgH: r2(avgH), wakeSd: wakeSd === null ? null : Math.round(wakeSd), bedSd: bedSd === null ? null : Math.round(bedSd), debtH: r2(debtH), nights: hs.length, wakes: wakes.length, sq: r2(sq) },
      conf: Math.min(1, hs.length / 10),
    };
  },
};

const nutrition: Def = {
  target: 75, w: { meals: 0.45, pace: 0.35, water: 0.2 },
  fn: ({ s, end, comp }) => {
    const lc = comp.filter((d) => d.logged);
    const food = lc.reduce((a, d) => [a[0] + d.ring.food[0], a[1] + d.ring.food[1]], [0, 0]);
    const { rate, lo, hi, kg } = rateAt(s, end);
    const met = lc.filter((d) => d.water.ml >= d.water.goal).length;
    const wi = weighInsIn(s, addDays(end, -13), end);
    return {
      parts: {
        meals: ratio(food[0], food[1]),
        pace: rate === null ? null : paceScore(rate, lo, hi),
        water: ratio(met, lc.length),
      },
      ev: { rate: r2(rate), lo: r2(lo), hi: r2(hi), kg: r2(kg), weighIns: wi, waterMet: met, logged: lc.length },
      conf: 0.5 * Math.min(1, wi / 7) + 0.5 * Math.min(1, lc.length / 10),
    };
  },
};

const training: Def = {
  target: 75, w: { attend: 0.45, freq: 0.25, rot: 0.2, onTime: 0.1 },
  fn: ({ s, end, comp }) => {
    const planned = comp.filter((d) => d.logged && d.gym.planned);
    const done = planned.filter((d) => d.gym.done).length;
    const excused = planned.filter((d) => !d.gym.done && ((d.sleepH !== null && d.sleepH < 6) || d.inDeload)).length;
    const dates = new Set(comp.map((d) => d.date));
    const sessions = s.workouts.filter((w) => dates.has(w.date) && w.code.startsWith("D")).length;
    const from28 = addDays(end, -28), to28 = addDays(end, -1);
    const rc: Record<string, number> = { D1: 0, D2: 0, D3: 0, D4: 0 };
    for (const w of s.workouts) if (w.date >= from28 && w.date <= to28 && w.code in rc) rc[w.code]++;
    const mx = Math.max(...Object.values(rc)), mn = Math.min(...Object.values(rc));
    const delays = comp.map((d) => d.gym.done ? d.gym.delay : null).filter(fin);
    return {
      parts: {
        attend: ratio(done, planned.length - excused),
        freq: comp.length ? lin(sessions / (comp.length / 7), 1, 3.5) : null,
        rot: mx < 2 ? null : mn / mx,
        onTime: delays.length ? delays.filter((x) => x <= 30).length / delays.length : null,
      },
      ev: { planned: planned.length, done, excused, sessions, delay: delays.length ? Math.round(mean(delays)!) : null },
      conf: Math.min(1, planned.length / 4),
    };
  },
};

const voice: Def = {
  target: 70, w: { adh: 0.55, rhythm: 0.15, strainFree: 0.15, rest: 0.15 },
  fn: ({ win, comp }) => {
    const planned = comp.filter((d) => d.logged && d.sing.planned);
    const done = planned.filter((d) => d.sing.done).length;
    const run = longestRun(win, (d) => d.sing.done);
    const doneW = win.filter((d) => d.sing.done).length;
    const strain = win.filter((d) => d.sing.strain === true).length;
    const a = win.slice(-7);
    const singA = a.filter((d) => d.sing.planned).length;
    return {
      parts: {
        adh: ratio(done, planned.length),
        rhythm: !win.some((d) => d.sing.planned || d.sing.done) ? null : run <= 6 ? 1 : run <= 9 ? 0.5 : 0,
        strainFree: !win.some((d) => d.sing.has) || !doneW ? null : clamp01(1 - strain / doneW),
        rest: singA >= 5 ? (a.some((d) => d.sing.voiceRest || isRestTpl(d.base)) ? 1 : 0.4) : null,
      },
      ev: { planned: planned.length, done, run, strain },
      conf: Math.min(1, planned.length / 4),
    };
  },
};

const trading: Def = {
  target: 80, w: { checked: 0.4, atLimit: 0.4, noRevenge: 0.2 },
  fn: ({ comp }) => {
    const lc = comp.filter((d) => d.logged);
    const planned = lc.filter((d) => d.trade.planned).length;
    const logs = lc.map((d) => d.trade.log).filter((x): x is NonNullable<typeof x> => !!x);
    const one = logs.filter((l) => l.count <= 1).length;
    const loss = logs.filter((l) => l.result === "loss").length;
    const revenge = logs.filter((l) => l.result === "loss" && l.count > 1).length;
    return {
      parts: {
        checked: planned ? Math.min(1, logs.length / planned) : null,
        atLimit: ratio(one, logs.length),
        noRevenge: logs.length ? 1 - revenge / Math.max(1, loss) : null,
      },
      ev: { planned, tradeDays: logs.length, one, over: logs.length - one, lossThenMore: revenge },
      conf: Math.min(1, planned / 4),
    };
  },
};

const projects: Def = {
  target: 65, w: { check: 0.35, build: 0.65 },
  fn: ({ comp }) => {
    const lc = comp.filter((d) => d.logged);
    const cp = lc.filter((d) => d.mc.checkPlanned), bp = lc.filter((d) => d.mc.buildPlanned);
    const bd = bp.filter((d) => d.mc.buildDone).length;
    return {
      parts: { check: ratio(cp.filter((d) => d.mc.checkDone).length, cp.length), build: ratio(bd, bp.length) },
      ev: { planned: bp.length, done: bd, checkPlanned: cp.length },
      conf: Math.min(1, lc.filter((d) => d.mc.checkPlanned || d.mc.buildPlanned).length / 4),
    };
  },
};

const leisure: Def = {
  target: 70, w: { contained: 0.5, coreKept: 0.3, present: 0.2 },
  fn: ({ win, comp, gameWeekMin }) => {
    const gd = comp.filter((d) => d.logged && d.game.planned);
    // v1.7: a logged live session that ran 60+ min past the planned end counts like a game that ran 60+ min over.
    const liveOver = (d: DaySig) => d.live?.over != null;
    const ws = comp.filter((d) => d.logged && (d.game.planned || liveOver(d)) && d.bedLate !== null);
    const ok = ws.filter((d) => d.bedLate! <= T.bedLate && (d.game.over === undefined || d.game.over < 60) && !((d.live?.over ?? 0) >= 60)).length;
    const liveMin = win.slice(-7).reduce((a, d) => a + (d.live?.min ?? 0), 0);
    return {
      parts: {
        contained: ratio(ok, ws.length),
        coreKept: ratio(gd.filter((d) => (d.core ?? 0) >= 0.8).length, gd.length),
        present: lin(gameWeekMin / 60, 0, 8),
      },
      ev: { gameDays: gd.length, avgLate: ws.length ? Math.round(mean(ws.map((d) => d.bedLate!))!) : null, gameH: r2(gameWeekMin / 60), liveH: r2(liveMin / 60) },
      conf: Math.min(1, ws.length / 4),
    };
  },
};

const recovery: Def = {
  target: 70, w: { level: 0.5, drift: 0.25, rest: 0.25, care: 0.15 },
  fn: ({ s, end, all, comp }) => {
    const a = checkinsIn(s, addDays(end, -6), end);
    const b = checkinsIn(s, addDays(end, -27), addDays(end, -7));
    const m7 = mean(a.map((x) => (x.e + x.m) / 2));
    const base = b.length >= 5 ? mean(b.map((x) => (x.e + x.m) / 2)) : null;
    const lowDays = a.filter((x) => Math.min(x.e, x.m) <= 2 || (base !== null && (x.e + x.m) / 2 <= base - 1)).length;
    const from = addDays(end, -6), to = addDays(end, -1);
    const rest = all.some((d) => d.date >= from && d.date <= to && d.restDay);
    const c14 = checkinsIn(s, addDays(end, -13), end).length;
    // v1.7 self-care rows done / planned over the last 7 completed logged days (null under 3 planned).
    const care = comp.filter((d) => d.logged).slice(-7).flatMap((d) => d.items.filter((i) => i.kind === "care"));
    const careDone = care.filter((i) => i.done).length;
    return {
      parts: {
        level: m7 === null ? null : (m7 - 1) / 4,
        drift: base === null || m7 === null ? null : lin(base - m7, 1.0, 0),
        rest: rest ? 1 : 0.4,
        care: care.length >= 3 ? careDone / care.length : null,
      },
      ev: {
        m7: r2(m7), base: r2(base), checkins: c14, lowDays, lowE: a.filter((x) => x.e <= 2).length,
        burnout: a.length >= T.burnoutLow && lowDays >= T.burnoutLow ? 1 : 0,
        carePlanned: care.length, careDone,
      },
      conf: Math.min(1, c14 / 8),
    };
  },
};

const consistency: Def = {
  target: 75, w: { level: 0.4, logging: 0.25, onTime: 0.15, missTwice: 0.2 },
  fn: ({ s, comp }) => {
    const lc = comp.filter((d) => d.logged);
    const gd = s.settings.goodDay;
    const avgScore = mean(lc.map((d) => d.score ?? 0));
    let doneN = 0, timed = 0, onTime = 0;
    for (const d of lc) for (const i of d.items) if (i.done) { doneN++; if (i.delay !== null) { timed++; if (i.delay <= 30) onTime++; } }
    const isBad = (d: DaySig) => d.logged && (d.score ?? 0) < gd;
    const bad = lc.filter(isBad).length;
    let pairs = 0;
    for (let i = 1; i < comp.length; i++) if (isBad(comp[i]) && isBad(comp[i - 1])) pairs++;
    return {
      parts: {
        level: avgScore === null ? null : Math.min(1, avgScore / gd),
        logging: comp.length ? lc.length / comp.length : null,
        onTime: doneN && timed ? onTime / doneN : null,
        missTwice: lc.length ? 1 - pairs / Math.max(1, bad) : null,
      },
      ev: { avgScore: avgScore === null ? null : Math.round(avgScore * 100), logged: lc.length, bad, pairs },
      conf: Math.min(1, lc.length / 10),
    };
  },
};

export const AREA_DEF: Record<AreaKey, Def> = { sleep, nutrition, training, voice, trading, projects, leisure, recovery, consistency };
export const scoreOf = (key: AreaKey, parts: Record<string, number | null>) => {
  const m = mix(Object.entries(AREA_DEF[key].w).map(([p, w]) => [parts[p] ?? null, w]));
  return m === null ? null : Math.round(100 * m);
};

// Window [from, to]; `today` decides which days count as completed.
export function windowCtx(s: State, all: DaySig[], from: string, to: string, today: string, gameWeekMin: number): Ctx {
  const win = all.filter((d) => d.date >= from && d.date <= to);
  return { s, end: to, win, comp: win.filter((d) => d.date < today), all, gameWeekMin };
}
export function areaOn(key: AreaKey, c: Ctx) {
  const o = AREA_DEF[key].fn(c);
  return { ...o, score: scoreOf(key, o.parts) };
}

export function scoreAreas(sigs: DaySig[], s: State, today: string): AreaResult[] {
  const game = timeBudget(s, today, 7).game;
  const W = windowCtx(s, sigs, addDays(today, -13), today, today, game);
  const A = windowCtx(s, sigs, addDays(today, -6), today, today, game);
  const B = windowCtx(s, sigs, addDays(today, -13), addDays(today, -7), today, game);
  return AREAS.map((key) => {
    const o = areaOn(key, W);
    const a = areaOn(key, A).score, b = areaOn(key, B).score;
    const parts = Object.fromEntries(Object.entries(o.parts).map(([k, v]) => [k, v === null ? null : Math.round(100 * clamp01(v))]));
    return { key, score: o.score, conf: Math.round(o.conf * 100) / 100, target: AREA_DEF[key].target, trend: a === null || b === null ? null : a - b, parts, ev: o.ev };
  });
}

export const eligibleAreas = (areas: AreaResult[], settings: Pick<Settings, "areaPriority">) =>
  areas.filter((a) => a.score !== null && a.conf >= T.conf && (settings.areaPriority?.[a.key] ?? 1) !== 0);

export function balanceOf(areas: AreaResult[], settings: Pick<Settings, "areaPriority">): Balance {
  const el = eligibleAreas(areas, settings);
  const none: Balance = { b: null, wmean: null, low2: null, spread: null, weakest: null, best: null, eligible: el.map((a) => a.key) };
  if (el.length < T.minEligible) return none;
  const w = (a: AreaResult) => BASE_W[a.key] * (settings.areaPriority?.[a.key] === 2 ? T.focusW : 1);
  const wmean = el.reduce((x, a) => x + w(a) * a.score!, 0) / el.reduce((x, a) => x + w(a), 0);
  const sorted = [...el].sort((x, y) => x.score! - y.score!);
  const low2 = (sorted[0].score! + sorted[1].score!) / 2;
  const top = sorted.at(-1)!;
  const up = el.filter((a) => (a.trend ?? 0) > 0).sort((x, y) => y.trend! - x.trend!)[0];
  return {
    b: Math.round(T.blendMean * wmean + T.blendLow * low2), wmean, low2,
    spread: top.score! - sorted[0].score!, weakest: sorted[0].key,
    best: top.score! >= 75 ? top.key : up?.key ?? null, eligible: el.map((a) => a.key),
  };
}

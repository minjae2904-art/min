import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { normalize } from "../model";
import { timeBudget } from "../stats";
import { areaOn, balanceOf, paceScore, scoreAreas, trendDir, windowCtx } from "../brain/areas";
import { paceBand } from "../brain/math";
import { extractDays } from "../brain/signals";
import { AREAS, type AreaKey, type AreaResult, type DaySig } from "../brain/types";
import { WEEK_PRESETS } from "../templates";
import { build, dowOf, perfect, TODAY } from "./brain-fixtures";

const areasOf = (s: ReturnType<typeof build>) => scoreAreas(extractDays(s, TODAY, 28), s, TODAY);
const area = (s: ReturnType<typeof build>, k: AreaKey) => areasOf(s).find((a) => a.key === k)!;
// Area on a hand-edited copy of the perfect month's signals (window W).
function onSigs(k: AreaKey, edit: (d: DaySig, i: number) => void) {
  const s = perfect();
  const sigs = extractDays(s, TODAY, 28).map((d) => structuredClone(d));
  sigs.forEach(edit);
  return areaOn(k, windowCtx(s, sigs, addDays(TODAY, -13), TODAY, TODAY, timeBudget(s, TODAY, 7).game));
}

describe("scoreAreas", () => {
  it("a perfect month scores 90+ on every area with full confidence", () => {
    const a = areasOf(perfect());
    expect(a).toHaveLength(9);
    for (const x of a) { expect(x.score).toBeGreaterThanOrEqual(90); expect(x.conf).toBeGreaterThanOrEqual(0.4); }
  });
  it("an empty state has zero confidence and no balance", () => {
    const s = normalize({});
    const a = areasOf(s);
    expect(a.every((x) => x.conf === 0)).toBe(true);
    expect(balanceOf(a, s.settings).b).toBeNull();
  });
});

describe("sleep", () => {
  it("duration: 8 h = 100, 5 h = 0, 10 h tapers to 50", () => {
    expect(onSigs("sleep", (d) => { d.sleepH = 8; }).parts.dur).toBe(1);
    expect(onSigs("sleep", (d) => { d.sleepH = 5; }).parts.dur).toBe(0);
    expect(onSigs("sleep", (d) => { d.sleepH = 10; }).parts.dur).toBeCloseTo(0.5, 6);
  });
  it("wake regularity: sd 45 = 100, sd 150 = 0", () => {
    expect(onSigs("sleep", (d, i) => { d.wakeMin = 780 + (i % 2 ? 45 : -45); }).parts.reg).toBeCloseTo(1, 6);
    expect(onSigs("sleep", (d, i) => { d.wakeMin = 780 + (i % 2 ? 150 : -150); }).parts.reg).toBeCloseTo(0, 6);
  });
  it("a 13:00 planned wake is not penalised (regularity, not clock time)", () => {
    const sl = area(perfect(), "sleep");
    expect(sl.score).toBe(100);
    expect(sl.parts.reg).toBe(100);
  });
  it("missing check-ins renormalise the weights", () => {
    const x = onSigs("sleep", (d) => { d.checkin = null; });
    expect(x.parts.feel).toBeNull();
    expect(x.score).toBe(100);
  });
});

describe("nutrition", () => {
  it("pace band and pace score", () => {
    const [lo, hi] = paceBand(67);
    expect(lo).toBeCloseTo(0.1675, 6);
    expect(hi).toBeCloseTo(0.335, 6);
    expect(paceScore(0.25, lo, hi)).toBe(1);
    expect(paceScore(0, lo, hi)).toBe(0);
    expect(paceScore(0.67, lo, hi)).toBe(0);
  });
  it("no weigh-ins drops the pace part", () => {
    const n = area(build(14, () => ({}), { kg: null }), "nutrition");
    expect(n.parts.pace).toBeNull();
    expect(n.score).toBe(100);
  });
});

describe("training", () => {
  const balanced = (f: (d: string) => object = () => ({})) => build(21, (d) => ({ tpl: "balanced", ...f(d) }));
  it("a missed gym after a 5 h night is excused", () => {
    const t = area(balanced((d) => (d === "2026-10-15" ? { untick: ["gym"], sleepH: 5 } : {})), "training");
    expect(t.parts.attend).toBe(100);
    expect(t.ev.excused).toBe(1);
    expect(area(balanced((d) => (d === "2026-10-15" ? { untick: ["gym"] } : {})), "training").parts.attend).toBeLessThan(100);
  });
  it("a miss inside a deload week is excused", () => {
    const s = balanced((d) => (d === "2026-10-15" ? { untick: ["gym"] } : {}));
    s.brain.deload = { from: "2026-10-14", to: "2026-10-20" };
    expect(area(s, "training").parts.attend).toBe(100);
  });
  it("a later 1-day deload does not un-excuse the earlier deload week", () => {
    const s = balanced((d) => (d === "2026-10-15" ? { untick: ["gym"] } : {}));
    s.brain.applied = [{ id: "a-1", cid: "R11:x", rule: "R11", area: "training", at: 1, date: "2026-10-13", actions: [{ k: "plan_deload", from: "2026-10-14", days: 7 }], ops: [], eval: null }];
    s.brain.deload = { from: "2026-10-21", to: "2026-10-21" };
    expect(area(s, "training").parts.attend).toBe(100);
    s.brain.applied[0].undoneAt = 2;
    expect(area(s, "training").parts.attend).toBeLessThan(100);
  });
  it("rotation is null until some split has 2 sessions", () => {
    expect(area(build(4, () => ({ tpl: "balanced" })), "training").parts.rot).toBeNull();
  });
});

describe("voice", () => {
  it("a 10+ day singing run scores rhythm 0; strainFree is null without chips", () => {
    const v = area(build(14, () => ({ tpl: "balanced" })), "voice");
    expect(v.parts.rhythm).toBe(0);
    expect(v.parts.strainFree).toBeNull();
    expect(area(perfect(), "voice").parts.rhythm).toBe(100);
  });
  it("a perfect stream-preset week counts stream-rest as the rest day (rest 100)", () => {
    const days = WEEK_PRESETS.find((p) => p.id === "stream")!.days, end = "2026-11-15";
    const s = build(21, (d) => ({ tpl: days[dowOf(d)] }), { today: end });
    s.settings.weekPlan = [...days];
    const v = scoreAreas(extractDays(s, end, 28), s, end).find((a) => a.key === "voice")!;
    expect(v.parts.rest).toBe(100);
  });
});

describe("trading", () => {
  it("results are not scored; a loss followed by more trades is", () => {
    const win = area(build(14, () => ({ tpl: "balanced", trade: { count: 1, result: "win" } })), "trading");
    const loss = area(build(14, () => ({ tpl: "balanced", trade: { count: 1, result: "loss" } })), "trading");
    expect(loss.score).toBe(win.score);
    const rev = area(build(14, (d) => ({ tpl: "balanced", trade: d === "2026-10-15" ? { count: 2, result: "loss" } : { count: 1, result: "loss" } })), "trading");
    expect(rev.parts.noRevenge).toBeLessThan(100);
  });
  it("skip with 0 trades counts as at the limit", () => {
    expect(area(build(14, () => ({ tpl: "balanced", trade: { count: 0, result: "skip" } })), "trading").parts.atLimit).toBe(100);
  });
});

describe("projects", () => {
  it("mc-check alone is not a build day", () => {
    const p = area(build(14, () => ({ tpl: "balanced", untick: ["mc"] })), "projects");
    expect(p.parts.build).toBe(0);
    expect(p.parts.check).toBe(100);
  });
});

describe("leisure", () => {
  it("long game days with on-time bedtimes score high", () => {
    expect(area(build(14, () => ({ tpl: "game-max" })), "leisure").score).toBeGreaterThanOrEqual(90);
  });
  it("zero planned game time lowers present", () => {
    const s = build(14, () => ({ tpl: "game-max" }));
    s.settings.weekPlan = Array(7).fill("work-plus");
    delete s.days[TODAY];
    expect(area(s, "leisure").parts.present).toBe(0);
  });
});

describe("recovery burnout flag", () => {
  const month = (low: number, n = 7) => build(35, (d, i) => ({ checkin: i >= 28 ? (i - 28 < low ? [2, 2, 3] : i - 28 < n ? [4, 4, 4] : null) : [4, 4, 4] }));
  it("set with 5 of 7 low days, not with 4 of 7 or with fewer than 5 check-ins", () => {
    expect(area(month(5), "recovery").ev.burnout).toBe(1);
    expect(area(month(4), "recovery").ev.burnout).toBe(0);
    expect(area(month(4, 4), "recovery").ev.burnout).toBe(0);
  });
});

describe("consistency", () => {
  it("one bad day is free, two in a row cost points", () => {
    expect(area(build(14, (d) => (d === "2026-10-15" ? { ticks: "none" } : {})), "consistency").parts.missTwice).toBe(100);
    expect(area(build(14, (d) => (d === "2026-10-15" || d === "2026-10-16" ? { ticks: "none" } : {})), "consistency").parts.missTwice).toBeLessThan(100);
  });
});

describe("balance", () => {
  const mk = (scores: Partial<Record<AreaKey, number>>, conf: Partial<Record<AreaKey, number>> = {}): AreaResult[] =>
    AREAS.map((key) => ({ key, score: scores[key] ?? 80, conf: conf[key] ?? 1, target: 75, trend: null, parts: {}, ev: {} }));
  const pr = (p: Partial<Record<AreaKey, 0 | 1 | 2>> = {}) => ({ areaPriority: { ...normalize(null).settings.areaPriority, ...p } });
  it("blends 0.7 weighted mean + 0.3 mean of the two lowest", () => {
    const b = balanceOf(mk({ leisure: 20 }), pr());
    expect(b.wmean).toBeCloseTo((80 * 8.6 + 20 * 0.6) / 9.2, 6);
    expect(b.low2).toBe(50);
    expect(b.b).toBe(Math.round(0.7 * b.wmean! + 0.3 * 50));
    expect(b.b!).toBeLessThan(b.wmean!);
    expect(b.weakest).toBe("leisure");
    expect(b.spread).toBe(60);
  });
  it("excludes thin-data and paused areas", () => {
    expect(balanceOf(mk({ leisure: 20 }, { leisure: 0.3 }), pr()).b).toBe(80);
    expect(balanceOf(mk({ leisure: 20 }), pr({ leisure: 0 })).b).toBe(80);
  });
  it("focus weight is x1.5", () => {
    const b = balanceOf(mk({ sleep: 50 }), pr({ sleep: 2 }));
    expect(b.wmean).toBeCloseTo((50 * 2.25 + 80 * 7.7) / 9.95, 6);
  });
  it("needs 3 eligible areas", () => {
    expect(balanceOf(mk({}, { sleep: 0, nutrition: 0, training: 0, recovery: 0, consistency: 0, voice: 0, trading: 0 }), pr()).b).toBeNull();
  });
  it("best is the top area at 75+, else the biggest positive trend", () => {
    expect(balanceOf(mk({ sleep: 90 }), pr()).best).toBe("sleep");
    const low = mk({ sleep: 60, nutrition: 60, training: 60, recovery: 60, consistency: 60, voice: 60, trading: 60, projects: 60, leisure: 60 });
    low[2].trend = 8;
    expect(balanceOf(low, pr()).best).toBe("training");
  });
});

describe("trend", () => {
  it("compares the last 7 days with the 7 before; arrow from 5 points", () => {
    const c = area(build(28, (d) => (d >= "2026-10-08" && d <= "2026-10-11" ? { skip: true } : {})), "consistency");
    expect(c.trend!).toBeGreaterThan(0);
    expect(trendDir(4)).toBeNull();
    expect(trendDir(5)).toBe("up");
    expect(trendDir(-6)).toBe("down");
    expect(trendDir(null)).toBeNull();
  });
});

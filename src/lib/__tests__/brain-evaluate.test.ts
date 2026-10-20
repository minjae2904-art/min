import { describe, expect, it } from "vitest";
import { baselineFor, evalPool, evaluateAll, evaluateApplied, METRICS, metricOf, newPool, ruleMult, ruleStats } from "../brain/evaluate";
import type { AppliedRec, EvalSpec } from "../brain/types";
import { build, TODAY } from "./brain-fixtures";

const D = "2026-10-10"; // applied on this date; post window 10-10..10-16, due 10-17
const spec: EvalSpec = { metric: "recovery.level", windowDays: 7, dir: 1, min: 0.3 };
const state = (after: number | null, postN = 7) => build(35, (d) => ({ checkin: d < D ? [3, 3, 3] : d < "2026-10-17" ? (after === null || d >= `2026-10-1${postN}` ? null : [after, after, 3]) : [3, 3, 3] }));
const rec = (s: ReturnType<typeof build>, p: Partial<AppliedRec> = {}): AppliedRec => ({
  id: "a-x1", cid: "R11:abc", rule: "R11", area: "training", at: Date.parse(D + "T14:00:00+07:00"), date: D,
  actions: [{ k: "plan_deload", from: D, days: 7 }], ops: [{ t: "brain", key: "deload", before: null, after: { from: D, to: "2026-10-16" } }],
  eval: { ...spec, base: baselineFor(s, spec, D).v }, ...p,
});

describe("evaluateApplied", () => {
  it("captures the baseline over the window before the apply date", () => {
    const s = state(4);
    expect(baselineFor(s, spec, D)).toEqual({ v: 3, n: 7 });
    expect(rec(s).eval!.base).toBe(3);
  });
  it("waits until the window is over", () => {
    const s = state(4);
    expect(evaluateApplied(s, rec(s), "2026-10-16")).toMatchObject({ status: "waiting", due: "2026-10-17" });
  });
  it("better / worse / same / nodata", () => {
    const up = state(4);
    expect(evaluateApplied(up, rec(up), TODAY)).toMatchObject({ status: "done", verdict: "better", base: 3, post: 4 });
    const down = state(4);
    expect(evaluateApplied(down, rec(down, { eval: { ...spec, dir: -1, base: 3 } }), TODAY).verdict).toBe("worse");
    const flat = state(3.2);
    expect(evaluateApplied(flat, rec(flat, { eval: { ...spec, base: 3 } }), TODAY).verdict).toBe("same");
    const edge = state(3.3);
    expect(evaluateApplied(edge, rec(edge, { eval: { ...spec, base: 3 } }), TODAY).verdict).toBe("better"); // exactly min
    const thin = state(4, 3); // only 3 check-ins after
    expect(evaluateApplied(thin, rec(thin), TODAY).verdict).toBe("nodata");
    const none = state(4);
    expect(evaluateApplied(none, rec(none, { eval: { ...spec, base: null } }), TODAY).verdict).toBe("nodata");
  });
  it("records without an eval spec have no verdict", () => {
    const s = state(4);
    expect(evaluateApplied(s, rec(s, { eval: null }), TODAY).status).toBe("none");
  });
  it("item metrics read the item's own ticks", () => {
    const s = build(14, () => ({ tpl: "balanced", late: { gym: 50 } }));
    expect(metricOf(s, "item.delay:gym", "2026-10-12", "2026-10-18")).toEqual({ v: 50, n: 7 });
    expect(metricOf(s, "item.done:gym", "2026-10-12", "2026-10-18")).toEqual({ v: 1, n: 7 });
    expect(metricOf(s, "area:consistency", "2026-10-12", "2026-10-18").v).toBeGreaterThanOrEqual(90);
  });
});

describe("ruleStats / ruleMult", () => {
  it("counts verdicts of records that are not undone, and recent rejects", () => {
    const s = state(4);
    const now = Date.parse(TODAY + "T12:00:00+07:00");
    s.brain.applied = [rec(s), rec(s, { id: "a-x2", undoneAt: 1 })];
    s.brain.decisions = [
      { sig: "R11:deload", rule: "R11", d: "r", at: now - 86_400_000 },
      { sig: "R11:deload", rule: "R11", d: "r", at: now - 61 * 86_400_000 },
      { sig: "R01:x", rule: "R01", d: "r", at: now },
    ];
    expect(ruleStats(s, TODAY)).toEqual({ R11: { ap: 1, better: 1, worse: 0, rej: 1 }, R01: { ap: 0, better: 0, worse: 0, rej: 1 } });
  });
  it("a shared signal pool gives the same metrics, evals and stats as fresh extracts", () => {
    const s = build(60, (d, i) => ({ tpl: i % 3 ? "balanced" : "game-max", bedLate: i % 4 ? 20 : 70, late: { gym: i % 5 ? 10 : 40 }, checkin: d < D ? [3, 3, 3] : [4, 4, 3] }));
    s.brain.applied = [rec(s), rec(s, { id: "a-x2", date: "2026-09-20", eval: { metric: "area:sleep", windowDays: 14, dir: 1, min: 5, base: 50 } })];
    const p = evalPool(s, TODAY);
    for (const m of [...Object.keys(METRICS), "item.delay:gym", "item.done:gym"]) {
      expect(metricOf(s, m, "2026-09-01", "2026-09-14", p)).toEqual(metricOf(s, m, "2026-09-01", "2026-09-14", newPool()));
    }
    const evals = evaluateAll(s, TODAY, p);
    expect(evals).toEqual(s.brain.applied.map((r) => evaluateApplied(s, r, TODAY)));
    expect(ruleStats(s, TODAY, evals)).toEqual(ruleStats(s, TODAY));
  });
  it("multiplier stays within 0.7-1.3", () => {
    expect(ruleMult(undefined)).toBe(1);
    expect(ruleMult({ better: 1, worse: 0 })).toBeCloseTo(1.15, 6);
    expect(ruleMult({ better: 9, worse: 0 })).toBe(1.3);
    expect(ruleMult({ better: 0, worse: 9 })).toBe(0.7);
  });
});

import { describe, expect, it } from "vitest";
import { brainReport } from "../brain/report";
import { dataQuality } from "../brain/quality";
import { extractDays } from "../brain/signals";
import { itemsFor } from "../schedule";
import { rangeStats } from "../stats";
import { batchIds, planEpoch, srcOf, tickQ } from "../ticks";
import type { State } from "../model";
import { build, TODAY, tsAt } from "./brain-fixtures";

const D = "2026-10-19";
const IT = [
  { id: "a", min: 780, kind: "meal" }, { id: "b", min: 840, kind: "supp" },
  { id: "c", min: 960, kind: "habit" }, { id: "d", min: 1140, kind: "meal" },
];
const burst = (ids: string[]) => Object.fromEntries(ids.map((id, k) => [id, tsAt(D, 1320) + k * 20_000]));
const sigOf = (s: State, date = D) => extractDays(s, TODAY, 28).find((d) => d.date === date)!;
const rulesOf = (s: State) => brainReport(s, TODAY).candidates;
const timedIds = (s: State, date = D) => itemsFor(s.schedule, s.days[date], date).filter((i) => i.ring && i.kind !== "sleep" && i.kind !== "weigh").map((i) => i.id);

describe("batchIds", () => {
  it("1: four ticks within a minute covering items planned hours apart are all batch", () => {
    expect([...batchIds(D, IT, burst(["a", "b", "c", "d"]))].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("2: two ticks in the window are not a batch", () => {
    expect(batchIds(D, IT, burst(["a", "d"])).size).toBe(0);
  });
  it("3: three ticks with a planned span of 30 min are not a batch", () => {
    const items = [{ id: "a", min: 780, kind: "meal" }, { id: "b", min: 795, kind: "supp" }, { id: "c", min: 810, kind: "habit" }];
    expect(batchIds(D, items, burst(["a", "b", "c"])).size).toBe(0);
  });
  it("4: confirmed ticks are never batch, late can be, a stale entry counts as absent", () => {
    const done = burst(["a", "b", "c", "d"]);
    for (const src of ["plan", "now", "pick"] as const) {
      expect([...batchIds(D, IT, done, { a: { src, ts: done.a } })].sort()).toEqual(["b", "c", "d"]);
    }
    expect(batchIds(D, IT, done, { a: { src: "late", ts: done.a } }).has("a")).toBe(true);
    expect(batchIds(D, IT, done, { a: { src: "plan", ts: done.a - 5 } }).has("a")).toBe(true);
    expect(srcOf({ done, doneSrc: { a: { src: "plan", ts: done.a - 5 } } }, "a")).toBeNull();
  });
  it("5: ts = 1 and the weigh/sleep kinds are ignored", () => {
    const items = [{ id: "w", min: 780, kind: "weigh" }, { id: "s", min: 1530, kind: "sleep" }, { id: "c", min: 960, kind: "habit" }, { id: "d", min: 1140, kind: "meal" }];
    expect(batchIds(D, items, burst(["w", "s", "c", "d"])).size).toBe(0);
    expect(batchIds(D, IT, { ...burst(["b", "c", "d"]), a: 1 }).has("a")).toBe(false);
    expect(tickQ(1, null, false)).toBeNull();
  });
  it("5b: an on-time live tick inside a back-fill burst is not flagged; the back-filled ones are", () => {
    const items = [{ id: "lunch", min: 780, kind: "meal" }, { id: "bf", min: 420, kind: "meal" }, { id: "supp", min: 480, kind: "supp" }];
    const t0 = planEpoch(D, 780);
    const done = { lunch: t0, bf: t0 + 30_000, supp: t0 + 60_000 };
    const src = { bf: { src: "late" as const, ts: done.bf }, supp: { src: "late" as const, ts: done.supp } };
    expect([...batchIds(D, items, done, src)].sort()).toEqual(["bf", "supp"]);
    // ticks of future items more than 60 min early stay flagged
    const early = [{ id: "x", min: 1200, kind: "meal" }, { id: "y", min: 1260, kind: "meal" }, { id: "z", min: 780, kind: "meal" }];
    expect([...batchIds(D, early, { z: t0, x: t0 + 20_000, y: t0 + 40_000 })].sort()).toEqual(["x", "y"]);
  });
});

describe("signals tick trust", () => {
  it("6: batch -> tq 0 and null delay; late .5 keeps the delay; plan .75; legacy late tq 1", () => {
    const b = sigOf(build(14, () => ({ tpl: "balanced", batch: { at: 1320 } })));
    const timed = b.items.filter((i) => i.done && i.kind !== "sleep" && i.kind !== "weigh");
    expect(timed.length).toBeGreaterThan(3);
    expect(timed.every((i) => i.tq === 0 && i.delay === null)).toBe(true);
    expect(b.gym.tq).toBe(0);
    const late = sigOf(build(14, () => ({ tpl: "balanced", late: { gym: 70 }, src: { gym: "late" } })));
    expect(late.items.find((i) => i.id === "gym")).toMatchObject({ tq: 0.5, delay: 70 });
    const plan = sigOf(build(14, () => ({ tpl: "balanced", late: { gym: 70 }, src: { gym: "plan" } })));
    expect(plan.items.find((i) => i.id === "gym")!.tq).toBe(0.75);
    const legacy = sigOf(build(14, () => ({ tpl: "balanced", late: { gym: 70 } })));
    expect(legacy.items.find((i) => i.id === "gym")).toMatchObject({ tq: 1, delay: 70 });
  });
});

describe("brain gating", () => {
  it("7: R07/R09 fixtures fire; batch on every day removes R09 and the R07 move variant", () => {
    expect(rulesOf(build(14, () => ({ tpl: "mc-build", late: { meal3: 70 } }))).some((c) => c.rule === "R07")).toBe(true);
    expect(rulesOf(build(14, () => ({ tpl: "balanced", late: { gym: 60 } }))).some((c) => c.rule === "R09")).toBe(true);
    expect(rulesOf(build(14, () => ({ tpl: "balanced", late: { gym: 60 }, batch: { at: 1320 } }))).some((c) => c.rule === "R09")).toBe(false);
    const r07 = rulesOf(build(14, () => ({ tpl: "mc-build", late: { meal3: 70 }, batch: { at: 1320 } }))).filter((c) => c.rule === "R07");
    expect(r07.some((c) => c.variants.some((v) => v.actions.some((a) => a.k === "move_item")))).toBe(false);
  });
  it("8: all late -> trust .5 suppresses R09 and the R07 delay branches; all plan -> .75 keeps R09", () => {
    const lateG = build(14, () => ({ tpl: "balanced", late: { gym: 60 }, src: "late" }));
    expect(brainReport(lateG, TODAY).quality.tickTrust).toBeCloseTo(0.5);
    expect(rulesOf(lateG).some((c) => c.rule === "R09")).toBe(false);
    expect(rulesOf(build(14, () => ({ tpl: "mc-build", late: { meal3: 70 }, src: "late" }))).some((c) => c.rule === "R07")).toBe(false);
    const planG = build(14, () => ({ tpl: "balanced", late: { gym: 60 }, src: "plan" }));
    expect(brainReport(planG, TODAY).quality.tickTrust).toBeCloseTo(0.75);
    expect(rulesOf(planG).some((c) => c.rule === "R09")).toBe(true);
  });
});

describe("dataQuality", () => {
  const q = (s: State) => dataQuality(s, extractDays(s, TODAY, 28), TODAY);
  it("9a: class counts sum to ticks", () => {
    const s = build(14, (d) => (d === D ? { tpl: "balanced", batch: { at: 1320 } } : d === "2026-10-18" ? { src: "late" } : d === "2026-10-17" ? { src: "pick" } : {}));
    const r = q(s);
    expect(r.live + r.confirmed + r.late + r.batch).toBe(r.ticks);
    expect(r.batch).toBeGreaterThan(0);
    expect(r.late).toBeGreaterThan(0);
    expect(r.confirmed).toBeGreaterThan(0);
    expect(r.level).not.toBeNull();
  });
  it("9b: fewer than 5 ticks gives no level", () => {
    const s = build(14, () => ({ ticks: "none" }));
    const ids = timedIds(s).slice(0, 4);
    for (const id of ids) s.days[D].done[id] = Date.parse(D + "T14:00:00+07:00");
    const r = q(s);
    expect(r.ticks).toBe(4);
    expect(r.tickTrust).toBeNull();
    expect(r.level).toBeNull();
  });
  it("9c: check-in timing is info only", () => {
    const on = q(build(10, () => ({ checkinAt: 30 }))), off = q(build(10, () => ({ checkinAt: 300 })));
    expect(on.checkinShare).toBe(1);
    expect(off.checkinShare).toBe(0);
    expect(on.level).toBe(off.level);
    expect(on.level).toBe("good");
    const none = q(build(10));
    expect(none.checkins).toBe(0);
    expect(none.checkinShare).toBeNull();
  });
});

describe("stats", () => {
  it("10: rangeStats avgDelay excludes batch ticks", () => {
    const plain = rangeStats(build(7, () => ({ tpl: "balanced", late: { gym: 30 } })), TODAY, 7);
    expect(plain.items.find((i) => i.id === "gym")!.avgDelay).toBe(30);
    const batch = rangeStats(build(7, () => ({ tpl: "balanced", late: { gym: 30 }, batch: { at: 1320 } })), TODAY, 7);
    expect(batch.items.find((i) => i.id === "gym")!.avgDelay).toBeNull();
    expect(planEpoch(D, 780)).toBe(tsAt(D, 780));
  });
});

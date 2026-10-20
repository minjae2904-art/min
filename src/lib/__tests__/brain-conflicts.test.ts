import { describe, expect, it } from "vitest";
import { at } from "../date";
import type { State } from "../model";
import { scoreAreas } from "../brain/areas";
import { detectConflicts } from "../brain/conflicts";
import { extractDays, planDays } from "../brain/signals";
import type { ConflictId } from "../brain/types";
import { build, dowOf, perfect, TODAY } from "./brain-fixtures";

function conflicts(s: State, today = TODAY) {
  const sigs = extractDays(s, today, 28);
  return detectConflicts(sigs, planDays(s, today, 7), scoreAreas(sigs, s, today), s, today);
}
const ids = (s: State, today = TODAY) => conflicts(s, today).map((c) => c.id);
const has = (s: State, id: ConflictId, today = TODAY) => ids(s, today).includes(id);

describe("detectConflicts", () => {
  it("a perfect month has no conflicts", () => {
    expect(ids(perfect())).toEqual([]);
  });
  it("C1 game -> bedtime (late bedtimes or gameOver chips)", () => {
    const late = build(14, (d) => ({ tpl: "game-max", bedLate: d >= "2026-10-17" ? 80 : 0, sleepH: 6.5 }));
    const c = conflicts(late).find((x) => x.id === "C1")!;
    expect(c).toMatchObject({ sev: 3, tpls: ["game-max"] });
    expect(c.ev).toMatchObject({ days: 3, of: 4, avgLate: 80 });
    expect(has(build(14, (d) => ({ tpl: "game-max", gameOver: d >= "2026-10-18" ? 60 : 0 })), "C1")).toBe(true);
    expect(has(build(14, () => ({ tpl: "game-max", bedLate: 30 })), "C1")).toBe(false);
  });
  it("C2 sleep debt with today's gym still open", () => {
    expect(has(build(14, (d) => ({ tpl: "balanced", sleepH: 5, untick: d === TODAY ? ["gym"] : [] })), "C2")).toBe(true);
    expect(has(build(14, () => ({ tpl: "balanced", sleepH: 5 })), "C2")).toBe(false);
    expect(has(build(14, (d) => ({ tpl: "balanced", untick: d === TODAY ? ["gym"] : [] })), "C2")).toBe(false);
  });
  it("C3 singing streak or strain", () => {
    expect(has(build(14, () => ({ tpl: "balanced" })), "C3")).toBe(true);
    expect(has(build(14, (d) => ({ sing: d >= "2026-10-18" ? { strain: true } : { strain: false } })), "C3")).toBe(true);
    expect(has(perfect(), "C3")).toBe(false);
  });
  it("C4 singing within 60 min after the gym block in the plan", () => {
    const s = perfect();
    s.schedule.overrides["balanced:sing"] = { min: at(19, 15) }; // gym 17:30 + 90 = 19:00
    const c = conflicts(s).find((x) => x.id === "C4");
    expect(c?.tpls).toContain("balanced");
    expect(has(perfect(), "C4")).toBe(false);
  });
  it("an NY-session (EST) date creates no false C4", () => {
    const today = "2026-11-10";
    expect(has(build(28, () => ({}), { today }), "C4", today)).toBe(false);
  });
  it("C5 a meal ticked within 45 min before the gym (observed)", () => {
    expect(has(build(14, () => ({ tpl: "balanced", late: { meal2: 40 } })), "C5")).toBe(true);
    expect(has(perfect(), "C5")).toBe(false);
  });
  it("meal2c 02:05 -> gym 03:00 is not C5, even when eaten late", () => {
    expect(has(build(14, () => ({ tpl: "work", meal2: "C", late: { meal2c: 25 } })), "C5")).toBe(false);
  });
  it("C6 social jet lag between work and free nights", () => {
    const f = (late: number) => (d: string) => ({ tpl: [1, 2, 3, 4, 5].includes(dowOf(d)) ? "work-plus" : "balanced", bedLate: dowOf(d) === 5 || dowOf(d) === 6 ? late : 0 });
    const c = conflicts(build(28, f(150))).find((x) => x.id === "C6");
    expect(c?.ev.sjlMin).toBe(150);
    expect(has(build(28, f(0)), "C6")).toBe(false);
  });
  it("C7 revenge trade vs C8 over the limit", () => {
    const rev = build(14, (d) => ({ tpl: "balanced", trade: d === "2026-10-15" ? { count: 2, result: "loss" } : null }));
    expect(ids(rev)).toContain("C7");
    expect(ids(rev)).not.toContain("C8");
    const over = build(14, (d) => ({ tpl: "balanced", trade: d === "2026-10-15" ? { count: 3, result: "win" } : null }));
    expect(ids(over)).toContain("C8");
    expect(ids(over)).not.toContain("C7");
    expect(conflicts(over).find((x) => x.id === "C8")!.ev).toMatchObject({ days: 1, over: 1 });
  });
  it("C9 a short sleep window; work-day load alone is not C9", () => {
    const s = perfect();
    s.schedule.overrides["balanced:weigh"] = { min: at(11, 30) };
    expect(has(s, "C9")).toBe(true);
    const w = perfect();
    w.settings.weekPlan = Array(7).fill("work-plus");
    w.days = {};
    expect(planDays(w, TODAY, 7).every((p) => p.load > 0.9)).toBe(true);
    expect(has(w, "C9")).toBe(false);
  });
  it("work-template gym -> sleep is not flagged", () => {
    const w = build(14, () => ({ tpl: "work-plus" }));
    w.settings.weekPlan = Array(7).fill("work-plus");
    expect(ids(w).filter((x) => x === "C4" || x === "C5" || x === "C9")).toEqual([]);
  });
  it("C10 no rest day while singing every day", () => {
    const s = perfect();
    s.settings.weekPlan = Array(7).fill("balanced");
    delete s.days[TODAY];
    expect(has(s, "C10")).toBe(true);
    expect(has(perfect(), "C10")).toBe(false);
  });
  it("C11 burnout", () => {
    const s = build(35, (_d, i) => ({ checkin: i >= 28 ? [2, 2, 3] : [4, 4, 4] }));
    expect(conflicts(s).find((x) => x.id === "C11")?.sev).toBe(3);
    expect(has(perfect(), "C11")).toBe(false);
  });
  it("C12 fast gain while skipping the gym", () => {
    const s = build(28, () => ({ tpl: "balanced", untick: ["gym"] }), { kg: (i) => 67 + i * 0.15 });
    expect(has(s, "C12")).toBe(true);
    expect(has(perfect(), "C12")).toBe(false);
  });
  it("C13 the same item not done two days in a row", () => {
    const s = perfect();
    for (const d of ["2026-10-18", "2026-10-19"]) delete s.days[d].done.posture;
    const c = conflicts(s).find((x) => x.id === "C13");
    expect(c?.items).toEqual(["posture"]);
    const one = perfect();
    delete one.days["2026-10-19"].done.posture;
    expect(has(one, "C13")).toBe(false);
  });
});

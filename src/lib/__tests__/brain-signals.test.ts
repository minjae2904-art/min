import { describe, expect, it } from "vitest";
import { at } from "../date";
import { brainReport } from "../brain/report";
import { extractDays, planDays } from "../brain/signals";
import { build, perfect, TODAY, tsAt } from "./brain-fixtures";

const sigOf = (s: ReturnType<typeof build>, date = "2026-10-19") => extractDays(s, TODAY, 28).find((d) => d.date === date)!;

describe("extractDays", () => {
  it("bedMin/bedLate cross the 08:00 rollover (05:40 = 1780)", () => {
    const s = build(3, () => ({ tpl: "balanced" }));
    s.days["2026-10-19"].sleepAt = tsAt("2026-10-19", at(5, 40));
    const d = sigOf(s);
    expect(d.bedMin).toBe(1780);
    expect(d.plannedSleep).toBe(at(5));
    expect(d.bedLate).toBe(40);
  });
  it("a planned-sleep override plus the day shift moves plannedSleep", () => {
    const s = build(3, () => ({ tpl: "balanced" }));
    s.schedule.overrides["balanced:sleep"] = { min: at(4, 30) };
    s.days["2026-10-19"].shiftMin = 20;
    expect(sigOf(s).plannedSleep).toBe(at(4, 30) + 20);
    s.schedule.overrides = {};
    s.schedule.shiftMin = 30;
    delete s.days["2026-10-19"].shiftMin;
    expect(sigOf(s).plannedSleep).toBe(at(5) + 30);
  });
  it("work is true for work-plus and work-game only", () => {
    const s = build(3, (d) => ({ tpl: d === "2026-10-19" ? "work-plus" : d === "2026-10-18" ? "work-game" : "balanced" }));
    const sigs = extractDays(s, TODAY, 3);
    expect(sigs.map((d) => d.work)).toEqual([true, true, false]);
    expect(sigs[0].gym.planned).toBe(false); // work-game drops the gym
  });
  it("buildDone needs mc or mc2, not mc-check", () => {
    const s = build(3, () => ({ tpl: "balanced", untick: ["mc"] }));
    const d = sigOf(s);
    expect(d.mc).toMatchObject({ checkPlanned: true, checkDone: true, buildPlanned: true, buildDone: false });
  });
  it("a voice-rest day has no planned singing", () => {
    const s = build(3, () => ({ tpl: "balanced", voiceRest: true }));
    expect(sigOf(s).sing).toMatchObject({ planned: false, done: false, voiceRest: true });
  });
  it("reads gameOver / sing chips defensively", () => {
    const s = build(3, (d) => (d === "2026-10-19" ? { gameOver: 45, sing: { min: 25, strain: "yes" } } : { gameOver: 60, sing: { min: 30, strain: true } }));
    const bad = sigOf(s), good = sigOf(s, "2026-10-18");
    expect(bad.game.over).toBeUndefined();
    expect(bad.sing.min).toBeUndefined();
    expect(bad.sing.strain).toBeUndefined();
    expect(bad.sing.has).toBe(true);
    expect(good.game.over).toBe(60);
    expect(good.sing).toMatchObject({ min: 30, strain: true });
  });
  it("never reads journal or trade notes, and is identical under UTC and Bangkok", () => {
    const s = perfect(20);
    s.days["2026-10-19"].journal = { good: "secret", fix: "secret", thanks: "secret" };
    s.days["2026-10-19"].trade = { count: 1, result: "win", note: "secret" };
    const bkk = JSON.stringify(extractDays(s, TODAY, 20));
    const prev = process.env.TZ;
    process.env.TZ = "UTC";
    try { expect(JSON.stringify(extractDays(s, TODAY, 20))).toBe(bkk); } finally { process.env.TZ = prev; }
    expect(bkk).not.toContain("secret");
  });
  it("tick delays use the fixed +07:00 schedule", () => {
    const s = build(3, () => ({ tpl: "balanced", late: { gym: 50 } }));
    expect(sigOf(s).gym.delay).toBe(50);
  });
});

describe("planDays", () => {
  it("load and sleep window per template", () => {
    const s = build(1);
    s.settings.weekPlan = ["balanced", "work-plus", "balanced", "balanced", "balanced", "balanced", "balanced"];
    s.days = {};
    const p = planDays(s, TODAY, 7); // TODAY is Tuesday
    const bal = p.find((x) => x.tpl === "balanced")!, wp = p.find((x) => x.tpl === "work-plus")!;
    expect(bal.load).toBeCloseTo(0.556, 2);
    expect(wp.load).toBeGreaterThan(0.9);
    expect(bal.sleepWinH).toBe(8);
    expect(bal.gym).toBe(1);
    expect(bal.singPlanned).toBe(true);
  });
  it("work template with meal2 C leaves a 7.5 h sleep window", () => {
    const s = build(1);
    s.days = { [TODAY]: { type: "work", meal2: "C", done: {}, waterMl: 0 } };
    s.settings.weekPlan = Array(7).fill("balanced");
    expect(planDays(s, TODAY, 1)[0].sleepWinH).toBe(7.5);
  });
  it("today's one-off day shift does not shrink the plan window or raise C9", () => {
    const s = perfect();
    s.days[TODAY].shiftMin = 45;
    expect(planDays(s, TODAY, 7)[0].sleepWinH).toBe(8);
    expect(brainReport(s, TODAY, "weekly").conflicts.some((c) => c.id === "C9")).toBe(false);
    expect(extractDays(s, TODAY, 1)[0].plannedSleep).toBe(extractDays(perfect(), TODAY, 1)[0].plannedSleep! + 45); // signals keep the shift
  });
});

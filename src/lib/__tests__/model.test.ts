import { describe, expect, it } from "vitest";
import { dayFor, DEFAULT_STATE, emptyDay, hasCheckin, isStateLike, mergeStates, normalize, type State } from "../model";

describe("normalize", () => {
  it("returns defaults for empty input", () => {
    expect(normalize(null)).toEqual(DEFAULT_STATE);
    expect(normalize(undefined)).toEqual(DEFAULT_STATE);
  });
  it("repairs collections of the wrong shape", () => {
    // @ts-expect-error hand-edited JSON
    const s = normalize({ workouts: "x", days: null, weights: {}, schedule: { custom: 3 } });
    expect(s.workouts).toEqual([]);
    expect(s.days).toEqual({});
    expect(s.weights).toEqual([]);
    expect(s.schedule.custom).toEqual([]);
    expect(s.schedule.overrides).toEqual({});
    expect(s.schedule.shiftMin).toBe(0);
  });
  it("fills newer settings and merges notifyKinds", () => {
    // @ts-expect-error old save without new fields
    const s = normalize({ settings: { followUpMin: 15, notifyKinds: { meal: false } } });
    expect(s.settings.followUpMin).toBe(15);
    expect(s.settings.notifyKinds.meal).toBe(false);
    expect(s.settings.notifyKinds.gym).toBe(true);
    expect(s.settings.offWeekdays).toEqual([]);
    expect(s.settings.sleepDnd).toBe(true);
  });
  it("marks a pre-setup profile as set up", () => {
    // @ts-expect-error partial profile
    expect(normalize({ profile: { startKg: 67 } }).profile).toMatchObject({ setup: true, startKg: 67, heightCm: 175 });
    expect(normalize({}).profile.setup).toBe(false);
  });
  it("keeps stored days as they are", () => {
    const day = { type: "off" as const, done: { weigh: 1 }, waterMl: 500 };
    expect(normalize({ days: { "2026-10-18": day } }).days["2026-10-18"]).toEqual(day);
  });
});

describe("isStateLike", () => {
  it("accepts only plain objects", () => {
    expect(isStateLike({})).toBe(true);
    expect(isStateLike({ days: {} })).toBe(true);
    expect(isStateLike([])).toBe(false);
    expect(isStateLike(null)).toBe(false);
    expect(isStateLike("{}")).toBe(false);
    expect(isStateLike(1)).toBe(false);
  });
});

describe("dayFor", () => {
  it("defaults to off on configured weekdays", () => {
    const s = normalize({ settings: { ...DEFAULT_STATE.settings, offWeekdays: [0, 6] } });
    expect(dayFor(s, "2026-10-18").type).toBe("off"); // Sunday
    expect(dayFor(s, "2026-10-17").type).toBe("off"); // Saturday
    expect(dayFor(s, "2026-10-19").type).toBe("work"); // Monday
    expect(dayFor(normalize({}), "2026-10-18").type).toBe("work");
  });
  it("prefers the stored day", () => {
    const s = normalize({ days: { "2026-10-18": { type: "work", done: {}, waterMl: 0 } }, settings: { ...DEFAULT_STATE.settings, offWeekdays: [0] } });
    expect(dayFor(s, "2026-10-18").type).toBe("work");
  });
  it("does not create the day", () => {
    const s = normalize({});
    dayFor(s, "2026-10-18");
    expect(s.days).toEqual({});
  });
});

describe("hasCheckin / emptyDay", () => {
  it("needs a mood above 0", () => {
    expect(hasCheckin(emptyDay())).toBe(false);
    expect(hasCheckin({ ...emptyDay(), checkin: { mood: 0, energy: 0, sleep: 0 } })).toBe(false);
    expect(hasCheckin({ ...emptyDay(), checkin: { mood: 3, energy: 2, sleep: 4 } })).toBe(true);
  });
});

describe("mergeStates", () => {
  const base = (patch: Partial<State>): State => ({ ...normalize(null), ...patch });
  it("keeps offline logs from the older copy and settings from the newer one", () => {
    const phone = base({
      updatedAt: 100,
      days: { "2026-10-17": { type: "work", done: { gym: 1, meal1: 2 }, waterMl: 2500 } },
      workouts: [{ date: "2026-10-17", code: "D3" }],
      weights: [{ date: "2026-10-16", kg: 68 }],
    });
    const desk = base({
      updatedAt: 200,
      days: { "2026-10-17": { type: "work", done: { meal2: 3 }, waterMl: 1000, checkin: { mood: 4, energy: 3, sleep: 4 } } },
      weights: [{ date: "2026-10-17", kg: 68.4 }],
      settings: { ...normalize(null).settings, goodDay: 0.8 },
    });
    const m = mergeStates(desk, phone);
    expect(m.days["2026-10-17"].done).toEqual({ gym: 1, meal1: 2, meal2: 3 });
    expect(m.days["2026-10-17"].waterMl).toBe(2500);
    expect(m.days["2026-10-17"].checkin?.mood).toBe(4);
    expect(m.workouts).toEqual([{ date: "2026-10-17", code: "D3" }]);
    expect(m.weights.map((w) => w.date)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(m.settings.goodDay).toBe(0.8);
    expect(m.updatedAt).toBe(201);
  });
  it("lets the newer copy win on the same date", () => {
    const older = base({ updatedAt: 1, workouts: [{ date: "2026-10-17", code: "D1" }], weights: [{ date: "2026-10-17", kg: 67 }] });
    const newer = base({ updatedAt: 2, workouts: [{ date: "2026-10-17", code: "D2" }], weights: [{ date: "2026-10-17", kg: 67.5 }] });
    const m = mergeStates(newer, older);
    expect(m.workouts).toEqual([{ date: "2026-10-17", code: "D2" }]);
    expect(m.weights).toEqual([{ date: "2026-10-17", kg: 67.5 }]);
  });
});

describe("normalize templates / week plan", () => {
  it("repairs user templates", () => {
    const templates = [
      { id: "x1", name: "a", from: "balanced" },
      { id: "balanced", name: "b", from: "balanced" },
      { id: "u-a", name: "c", from: "nope" },
      { id: "u-b", name: "  ", from: "rest" },
      { id: "u-c", name: ` ${"y".repeat(50)} `, from: "rest" },
      { id: "u-c", name: "dup", from: "off" },
      "junk",
    ];
    // @ts-expect-error hand-edited JSON
    const s = normalize({ schedule: { templates } });
    expect(s.schedule.templates).toEqual([{ id: "u-c", name: "y".repeat(40), from: "rest" }]);
  });
  it("always has 7 weekPlan slots of valid ids or null", () => {
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { weekPlan: "rest" } }).settings.weekPlan).toEqual([null, null, null, null, null, null, null]);
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { weekPlan: ["rest", 5, "BAD!", "u-x"] } }).settings.weekPlan).toEqual(["rest", null, null, "u-x", null, null, null]);
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { weekPlan: Array(9).fill("rest") } }).settings.weekPlan).toHaveLength(7);
  });
  it("defaults gameBreakMin and planAsked", () => {
    expect(normalize({}).settings.gameBreakMin).toBe(60);
    // @ts-expect-error partial settings
    expect(normalize({ settings: { gameBreakMin: -5 } }).settings.gameBreakMin).toBe(60);
    // @ts-expect-error partial settings
    expect(normalize({ settings: { gameBreakMin: 90 } }).settings.gameBreakMin).toBe(90);
    expect(normalize({}).settings.planAsked).toBe(false);
  });
  it("dayFor uses the stored day, then the week plan, then offWeekdays", () => {
    const weekPlan = [null, "balanced", "u-gone", "u-mine", null, null, null];
    const s = normalize({
      settings: { ...DEFAULT_STATE.settings, offWeekdays: [0, 2], weekPlan },
      schedule: { shiftMin: 0, overrides: {}, custom: [], templates: [{ id: "u-mine", name: "m", from: "rest" }] },
      days: { "2026-10-26": { type: "work", done: {}, waterMl: 0 } },
    });
    expect(dayFor(s, "2026-10-18").type).toBe("off"); // Sunday, null slot
    expect(dayFor(s, "2026-10-19").type).toBe("balanced"); // Monday
    expect(dayFor(s, "2026-10-20").type).toBe("off"); // Tuesday, missing user template -> offWeekdays
    expect(dayFor(s, "2026-10-21").type).toBe("u-mine"); // Wednesday
    expect(dayFor(s, "2026-10-26").type).toBe("work"); // stored Monday
  });
});

describe("v1.3 brain fields", () => {
  it("normalize fills the brain and the new settings for a v1.2 save", () => {
    // @ts-expect-error v1.2 JSON without brain fields
    const s = normalize({ settings: { goodDay: 0.8 }, days: {} });
    expect(s.brain).toEqual(DEFAULT_STATE.brain);
    expect(s.settings).toMatchObject({ brainCard: true, brainAi: true, brainAutoAi: true, brainReviewDow: -1, notifyReview: true, notifyLastMatch: false, kcalAdjust: 0, job: null, aiSendIdentity: true });
    expect(Object.values(s.settings.areaPriority)).toEqual(Array(9).fill(1));
  });
  it("repairs garbage settings", () => {
    // @ts-expect-error hand-edited JSON
    const s = normalize({ settings: { brainReviewDow: 9, kcalAdjust: 9999, areaPriority: { sleep: 2, trading: 0, voice: 7 }, job: "maybe", notifyLastMatch: "yes", brainAi: false } });
    expect(s.settings.brainReviewDow).toBe(-1);
    expect(s.settings.kcalAdjust).toBe(500);
    expect(s.settings.areaPriority).toMatchObject({ sleep: 2, trading: 0, voice: 1, nutrition: 1 });
    expect(s.settings.job).toBeNull();
    expect(s.settings.notifyLastMatch).toBe(false);
    expect(s.settings.brainAi).toBe(false);
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { kcalAdjust: 130 } }).settings.kcalAdjust).toBe(150);
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { kcalAdjust: -999 } }).settings.kcalAdjust).toBe(-300);
    // @ts-expect-error hand-edited JSON
    expect(normalize({ settings: { brainReviewDow: 3, job: "no" } }).settings).toMatchObject({ brainReviewDow: 3, job: "no" });
  });
  it("DayLog gameOver and sing chips survive mergeStates", () => {
    const a = { ...normalize(null), updatedAt: 1, days: { "2026-10-17": { type: "rest", done: {}, waterMl: 0, gameOver: 30 as const } } };
    const b = { ...normalize(null), updatedAt: 2, days: { "2026-10-17": { type: "rest", done: { weigh: 1 }, waterMl: 0, sing: { min: 20 as const, strain: true } } } };
    const m = mergeStates(b, a);
    expect(m.days["2026-10-17"]).toMatchObject({ gameOver: 30, sing: { min: 20, strain: true }, done: { weigh: 1 } });
  });
});

describe("v1.4 normalize", () => {
  const tp = (t: unknown) => normalize({ schedule: { shiftMin: 0, overrides: {}, custom: [], taper: t as never } }).schedule.taper;
  it("keeps a valid taper and drops anything invalid without clamping", () => {
    expect(tp({ start: "2026-10-26", fromMin: 180, stepMin: 30 })).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30 });
    expect(tp({ start: "2026-10-26", fromMin: 180, stepMin: 30, stop: "2026-10-28" })).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30, stop: "2026-10-28" });
    for (const bad of [
      { start: "2026-10-26", fromMin: 0, stepMin: 30 }, { start: "2026-10-26", fromMin: 310, stepMin: 30 }, { start: "2026-10-26", fromMin: 100, stepMin: 30 },
      { start: "2026-10-26", fromMin: 180, stepMin: 20 }, { start: "26-10-2026", fromMin: 180, stepMin: 30 }, { start: "2026-10-26", fromMin: 180, stepMin: 30, stop: "x" },
      "x", null, [],
    ]) expect(tp(bad)).toBeNull();
    expect(normalize({}).schedule.taper).toBeNull();
  });
  it("defaults the stream settings and keeps stored notifyKinds", () => {
    const s = normalize({});
    expect([s.settings.streamAsked, s.settings.notifyStreamWrap, s.settings.notifyKinds.stream]).toEqual([false, true, true]);
    // @ts-expect-error old save without new fields
    const o = normalize({ settings: { notifyKinds: { game: false }, streamAsked: true, notifyStreamWrap: false } });
    expect([o.settings.notifyKinds.game, o.settings.notifyKinds.stream, o.settings.streamAsked, o.settings.notifyStreamWrap]).toEqual([false, true, true, false]);
  });
});

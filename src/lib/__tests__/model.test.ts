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

// v1.8 model additions: settings defaults, share/term repair, DayLog.sore and merges.
import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, GO_DEFAULT, mergeStates, normalize, SHARE_DEFAULT, TERM_START_DEFAULT, termDefault, type State } from "../model";

describe("v1.8 model", () => {
  it("normalize fills badge, ready, share and term", () => {
    const s = normalize({});
    expect([s.settings.badge, s.settings.ready, s.schedule.term]).toEqual([true, true, null]);
    expect(s.settings.share).toEqual(SHARE_DEFAULT);
    expect([SHARE_DEFAULT.weight, SHARE_DEFAULT.kg, SHARE_DEFAULT.fmt]).toEqual([false, false, "story"]);
    expect(DEFAULT_STATE.schedule.term).toBeNull();
    expect([GO_DEFAULT, TERM_START_DEFAULT, new Date(TERM_START_DEFAULT + "T12:00:00").getDay()]).toEqual([30, "2026-11-02", 1]);
    expect(termDefault()).toEqual({ start: "2026-11-02", end: "2027-03-05", cls: [] });
  });
  it("keeps explicit false and repairs bad values", () => {
    const s = normalize({ settings: { ...DEFAULT_STATE.settings, badge: false, ready: false, share: { fmt: "square", band: false, live: "yes", kg: true } as unknown as State["settings"]["share"] } });
    expect([s.settings.badge, s.settings.ready]).toEqual([false, false]);
    expect(s.settings.share).toEqual({ ...SHARE_DEFAULT, fmt: "square", band: false, kg: true });
    const bad = normalize({ settings: { ...DEFAULT_STATE.settings, badge: "no", share: "x" } as unknown as State["settings"] });
    expect([bad.settings.badge, bad.settings.share]).toEqual([true, SHARE_DEFAULT]);
    expect(normalize({ settings: { share: { fmt: "wide" } } } as unknown as State).settings.share.fmt).toBe("story");
    expect(normalize({ schedule: { shiftMin: 0, overrides: {}, custom: [], term: { start: "2026-11-02", end: "2026-11-01", cls: [] } } }).schedule.term).toBeNull();
  });
  it("DayLog.sore survives a merge (newer copy wins), newer settings win", () => {
    const old = normalize({}), neu = normalize({});
    old.days["2026-11-02"] = { type: "term-gym", done: { weigh: 1 }, waterMl: 0, sore: 2 };
    neu.days["2026-11-02"] = { type: "term-gym", done: { meal1: 2 }, waterMl: 0, sore: 1 };
    old.days["2026-11-01"] = { type: "term-rest", done: {}, waterMl: 0, sore: 2 };
    old.settings.badge = true; neu.settings.badge = false; neu.settings.share = { ...SHARE_DEFAULT, weight: true };
    const m = mergeStates(neu, old);
    expect([m.days["2026-11-02"].sore, m.days["2026-11-01"].sore]).toEqual([1, 2]);
    expect(m.days["2026-11-02"].done).toEqual({ weigh: 1, meal1: 2 });
    expect([m.settings.badge, m.settings.share.weight]).toEqual([false, true]);
  });
});

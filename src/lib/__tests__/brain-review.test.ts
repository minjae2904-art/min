import { describe, expect, it } from "vitest";
import { pickReviewFocus, reviewDow, reviewDue, weekKey } from "../brain/review";
import { normalize } from "../model";
import { NOJOB, TODAY } from "./brain-fixtures";

const st = (weekPlan: (string | null)[], dow = -1) => { const s = normalize({}); s.settings.weekPlan = weekPlan; s.settings.brainReviewDow = dow; return s; };

describe("weekly review day", () => {
  it("auto = first rest slot, Sunday first; none -> Sunday", () => {
    expect(reviewDow(st([...NOJOB]))).toBe(0);
    expect(reviewDow(st(["balanced", "balanced", "rest", null, null, "rest", null]))).toBe(2);
    expect(reviewDow(st([null, null, null, null, null, null, null]))).toBe(0);
    expect(reviewDow(st(["stream-gym", "stream-gym", "stream-rest", null, null, null, null]))).toBe(2);
  });
  it("a user copy of rest counts", () => {
    const s = st(["balanced", "u-1", null, null, null, null, null]);
    s.schedule.templates = [{ id: "u-1", name: "พักของฉัน", from: "rest" } as never];
    expect(reviewDow(s)).toBe(1);
  });
  it("explicit day wins; weekKey = latest review day <= today", () => {
    const s = st([...NOJOB], 2); // Tuesday = TODAY
    expect(weekKey(s, TODAY)).toBe(TODAY);
    expect(weekKey(st([...NOJOB], 0), TODAY)).toBe("2026-10-18");
    expect(weekKey(st([...NOJOB], 3), TODAY)).toBe("2026-10-14");
  });
  it("due on the review day and the day after, hidden once done", () => {
    const s = st([...NOJOB], 1); // Monday 2026-10-19
    expect(reviewDue(s, TODAY)).toBe(true);
    expect(reviewDue(s, "2026-10-21")).toBe(false);
    s.brain.reviewDone = "2026-10-19";
    expect(reviewDue(s, TODAY)).toBe(false);
  });
});

describe("review focus", () => {
  it("a new pick returns the previous review's pick to normal; a manual focus is never cleared", () => {
    const s = normalize({});
    pickReviewFocus(s, "sleep");
    expect(s.settings.areaPriority.sleep).toBe(2);
    expect(s.brain.reviewFocus).toBe("sleep");
    pickReviewFocus(s, "nutrition");
    expect([s.settings.areaPriority.sleep, s.settings.areaPriority.nutrition]).toEqual([1, 2]);
    s.settings.areaPriority = { ...s.settings.areaPriority, training: 2 }; // set by hand
    pickReviewFocus(s, "training");
    expect([s.settings.areaPriority.nutrition, s.settings.areaPriority.training]).toEqual([1, 2]);
    expect(s.brain.reviewFocus).toBeNull();
    pickReviewFocus(s, "voice");
    expect([s.settings.areaPriority.training, s.settings.areaPriority.voice]).toEqual([2, 2]);
  });
});

import { describe, expect, it } from "vitest";
import { BAR0, PRESS0, axisLock, barStep, pressStep, rubber, sheetOffset, sheetRelease, swipeOffset, swipeResult, swipeStage, velocity, type Bar, type Press, type PressEv } from "../gesture";

const run = (evs: PressEv[], s: Press = PRESS0) => {
  let fire = false, swallow = false;
  for (const e of evs) { const r = pressStep(s, e); s = r.s; fire ||= !!r.fire; swallow = !!r.swallow; }
  return { s, fire, swallow };
};
const down = (now = 0, scrollAge = 1000, x = 0, y = 0): PressEv => ({ t: "down", x, y, now, scrollAge });

describe("pressStep", () => {
  it("arms only after down with no move past the slop", () => {
    expect(run([down(), { t: "arm" }]).s.st).toBe("armed");
    expect(run([down(), { t: "move", x: 6, y: 6 }, { t: "arm" }]).s.st).toBe("armed"); // 8.5 px, inside the slop
    expect(run([down(), { t: "move", x: 11, y: 0 }, { t: "arm" }]).s.st).toBe("idle");
    expect(run([{ t: "arm" }]).s.st).toBe("idle");
  });
  it("up after arm fires and swallows a click within 350 ms but not at 351 ms", () => {
    const a = run([down(), { t: "arm" }, { t: "up", now: 1000 }]);
    expect(a.fire).toBe(true);
    expect(a.s.st).toBe("idle");
    expect(pressStep(a.s, { t: "click", now: 1350 }).swallow).toBe(true);
    expect(pressStep(a.s, { t: "click", now: 1351 }).swallow).toBeUndefined();
  });
  it("up without arm never fires or swallows", () => {
    const a = run([down(), { t: "up", now: 100 }]);
    expect(a.fire).toBe(false);
    expect(pressStep(a.s, { t: "click", now: 110 }).swallow).toBeUndefined();
  });
  it("a new down clears a pending swallow", () => {
    const a = run([down(), { t: "arm" }, { t: "up", now: 1000 }, down(1100)]);
    expect(pressStep(a.s, { t: "click", now: 1150 }).swallow).toBeUndefined();
  });
  it("cancel clears both the press and the swallow", () => {
    const a = run([down(), { t: "arm" }, { t: "cancel" }]);
    expect(a.s.st).toBe("idle");
    expect(run([{ t: "up", now: 10 }], a.s).fire).toBe(false);
    const b = run([{ t: "drag", now: 0 }, { t: "cancel" }]);
    expect(pressStep(b.s, { t: "click", now: 10 }).swallow).toBeUndefined();
  });
  it("a down within 150 ms of a scroll never arms", () => {
    expect(run([down(0, 149), { t: "arm" }]).s.st).toBe("idle");
    expect(run([down(0, 150), { t: "arm" }]).s.st).toBe("armed");
  });
  it("drag sets a swallow and one click spends it", () => {
    const a = run([down(), { t: "drag", now: 500 }]);
    const c1 = pressStep(a.s, { t: "click", now: 600 });
    expect(c1.swallow).toBe(true);
    expect(pressStep(c1.s, { t: "click", now: 610 }).swallow).toBeUndefined();
    expect(pressStep(a.s, { t: "click", now: 851 }).swallow).toBeUndefined();
  });
});

describe("swipe", () => {
  const both = { left: true, right: true }, rightOnly = { left: false, right: true };
  it("axisLock is undecided under 10 px and needs a 1.2 ratio for horizontal", () => {
    expect(axisLock(9, 0)).toBeNull();
    expect(axisLock(0, 9)).toBeNull();
    expect(axisLock(12, 9)).toBe("h");
    expect(axisLock(12, 10)).toBeNull(); // 12 is not > 1.2 * 10, and |dy| < |dx|
    expect(axisLock(10, 10)).toBe("v");
    expect(axisLock(-3, -14)).toBe("v");
    expect(axisLock(-20, 2)).toBe("h");
  });
  it("rubber is linear to the limit, damped past it, sign-preserving", () => {
    expect(rubber(50, 112)).toBe(50);
    expect(rubber(152, 112, 0.25)).toBe(122);
    expect(rubber(-152, 112, 0.25)).toBe(-122);
    expect(rubber(0, 112)).toBe(0);
  });
  it("swipeOffset follows on the enabled side and caps the disabled side at 16", () => {
    expect(swipeOffset(80, both)).toBe(80);
    expect(swipeOffset(-200, both)).toBe(-134);
    expect(swipeOffset(-30, rightOnly)).toBe(-9);
    expect(swipeOffset(-200, rightOnly)).toBe(-16);
    expect(swipeOffset(0, both)).toBe(0);
  });
  it("swipeResult commits at min(96, 30%) or on a flick, left = later", () => {
    expect(swipeResult(96, 0, 400, both)).toBe("tick");
    expect(swipeResult(95, 0, 400, both)).toBeNull();
    expect(swipeResult(90, 0, 300, both)).toBe("tick"); // 30% of 300 = 90
    expect(swipeResult(-96, 0, 400, both)).toBe("later");
    expect(swipeResult(40, 0.5, 400, both)).toBe("tick");
    expect(swipeResult(39, 0.9, 400, both)).toBeNull();
    expect(swipeResult(-40, -0.5, 400, both)).toBe("later");
    expect(swipeResult(-40, 0.5, 400, both)).toBeNull(); // flick the other way
    expect(swipeResult(-200, -2, 400, rightOnly)).toBeNull();
  });
  it("swipeStage is over past the commit point on an enabled side only", () => {
    expect(swipeStage(96, 400, both)).toBe("over");
    expect(swipeStage(60, 400, both)).toBe("none");
    expect(swipeStage(-100, 400, rightOnly)).toBe("none");
  });
});

describe("sheet", () => {
  it("sheetOffset: down follows, up stretches only at medium with overflow", () => {
    expect(sheetOffset(40, "medium", false)).toBe(40);
    expect(sheetOffset(-30, "medium", true)).toBe(-30);
    expect(sheetOffset(-88, "medium", true)).toBe(-58); // 48 + 40 * .25
    expect(sheetOffset(-30, "medium", false)).toBe(-7.5);
    expect(sheetOffset(-200, "large", true)).toBe(-12);
  });
  const rel = (detent: "medium" | "large", dy: number, v = 0, o: Partial<{ canExpand: boolean; hasMedium: boolean; height: number }> = {}) =>
    sheetRelease({ detent, dy, v, height: 600, canExpand: true, hasMedium: true, ...o });
  it("medium: close, expand or stay", () => {
    expect(rel("medium", 90)).toBe("close");
    expect(rel("medium", 10, 0.8)).toBe("close");
    expect(rel("medium", 89)).toBe("medium");
    expect(rel("medium", -60)).toBe("large");
    expect(rel("medium", -10, -0.5)).toBe("large");
    expect(rel("medium", -60, 0, { canExpand: false })).toBe("medium");
    expect(rel("medium", -59)).toBe("medium");
  });
  it("large opened at medium: close past half or a fling, else step down or stay", () => {
    expect(rel("large", 300)).toBe("close");
    expect(rel("large", 20, 1.2)).toBe("close");
    expect(rel("large", 90)).toBe("medium");
    expect(rel("large", 20, 0.8)).toBe("medium");
    expect(rel("large", 89)).toBe("large");
    expect(rel("large", -100)).toBe("large");
  });
  it("large opened at large: close or stay", () => {
    expect(rel("large", 90, 0, { hasMedium: false })).toBe("close");
    expect(rel("large", 10, 0.8, { hasMedium: false })).toBe("close");
    expect(rel("large", 89, 0, { hasMedium: false })).toBe("large");
  });
});

describe("barStep", () => {
  const seq = (ys: number[], b: Bar = BAR0, maxY = 2000) => ys.reduce((p, y) => barStep(p, y, maxY), b);
  const at200: Bar = { min: false, y: 200, acc: 0 }, min500: Bar = { min: true, y: 500, acc: 0 };
  it("minimizes after 32 px down past 96 and restores after 24 px up", () => {
    expect(seq([220], at200).min).toBe(false);
    expect(seq([220, 232], at200)).toEqual({ min: true, y: 232, acc: 0 });
    expect(seq([490, 485], min500).min).toBe(true);
    expect(seq([490, 485, 476], min500)).toEqual({ min: false, y: 476, acc: 0 });
    expect(seq([95], { min: false, y: 60, acc: 0 }).min).toBe(false); // not past 96 yet
    expect(seq([95, 97], { min: false, y: 60, acc: 0 }).min).toBe(true);
    expect(seq([50, 100]).min).toBe(true); // a fresh scroll from the top
  });
  it("a direction change resets the accumulator", () => {
    const b = seq([220, 210, 240], at200);
    expect(b).toEqual({ min: false, y: 240, acc: 30 });
    expect(seq([242], b).min).toBe(true);
  });
  it("near the top always expands, and a short page never minimizes", () => {
    expect(seq([24], min500)).toEqual({ min: false, y: 24, acc: 0 });
    expect(seq([150], at200, 159).min).toBe(false);
    expect(seq([150], min500, 159).min).toBe(false);
  });
  it("ignores moves under 1 px and clamps y", () => {
    const b: Bar = { min: false, y: 200, acc: 5 };
    expect(barStep(b, 200.5, 2000)).toBe(b);
    expect(barStep(b, 5000, 300).y).toBe(300);
  });
});

describe("velocity", () => {
  it("averages over the last 100 ms", () => {
    expect(velocity([])).toBe(0);
    expect(velocity([{ t: 0, p: 0 }])).toBe(0);
    expect(velocity([{ t: 0, p: 0 }, { t: 100, p: 50 }])).toBe(0.5);
    expect(velocity([{ t: 0, p: 0 }, { t: 200, p: 10 }, { t: 250, p: 20 }, { t: 300, p: 70 }])).toBe(0.6); // from t=200
    expect(velocity([{ t: 0, p: 100 }, { t: 50, p: 40 }])).toBe(-1.2);
  });
});

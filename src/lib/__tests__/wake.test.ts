// v1.8 early wake taps (before 08:00) start the next logical day when the current one already has a bedtime or a wake.
import { describe, expect, it } from "vitest";
import { addDays, at } from "../date";
import { normalize } from "../model";
import { extractDays } from "../brain/signals";
import { bkkMin, rangeStats, wakeMinOf, wakeTarget } from "../stats";

const D = "2026-11-02", N = addDays(D, 1);
const ts = (date: string, min: number) => new Date(date + "T00:00:00+07:00").getTime() + min * 60_000;
const mk = (o: { sleepAt?: number; wakeAt?: number } = {}) => {
  const s = normalize({});
  s.days[D] = { type: "term-gym", done: {}, waterMl: 0, ...o };
  return s;
};

describe("wakeTarget", () => {
  it("07:00 after a 00:30 bedtime belongs to the new day", () => {
    expect(wakeTarget(mk({ sleepAt: ts(D, at(0, 30)) }), D, ts(D, at(7)))).toBe(N);
  });
  it("07:00 when the day already has a wake belongs to the new day", () => {
    expect(wakeTarget(mk({ wakeAt: ts(D, at(8, 5)) }), D, ts(D, at(7)))).toBe(N);
  });
  it("a tap from 08:00 is always today", () => {
    expect(wakeTarget(mk({ sleepAt: ts(D, at(0, 30)) }), D, ts(D, at(9)))).toBe(D);
    expect(wakeTarget(mk({ wakeAt: ts(D, at(8)) }), D, ts(D, at(8)))).toBe(D);
  });
  it("07:00 with neither bedtime nor wake stays today", () => {
    expect(wakeTarget(mk(), D, ts(D, at(7)))).toBe(D);
    expect(wakeTarget(normalize({}), D, ts(D, at(7)))).toBe(D);
  });
  it("a tap within 60 min of the bedtime stays today", () => {
    expect(wakeTarget(mk({ sleepAt: ts(D, at(6, 30)) }), D, ts(D, at(7, 30)))).toBe(D);
    expect(wakeTarget(mk({ sleepAt: ts(D, at(6, 29)) }), D, ts(D, at(7, 30)))).toBe(N);
  });
});

describe("wakeMinOf: wake minutes on the logical day the tap is stored on", () => {
  it("a pre-08:00 tap on its own new day reads as early morning; later taps match bkkMin", () => {
    expect(wakeMinOf(N, ts(D, at(7, 40)))).toBe(460);
    expect(wakeMinOf(D, ts(D, at(7, 40)))).toBe(1900); // stored on the previous day: v1.7 meaning kept
    for (const m of [at(8), at(9, 30), at(13), at(23, 59)]) expect(wakeMinOf(D, ts(D, m))).toBe(bkkMin(ts(D, m)));
  });
  it("extractDays wakeMin and rangeStats wakeSd stay on one scale", () => {
    const s = normalize({});
    for (let i = 0; i < 6; i++) { const d = addDays(D, i); s.days[d] = { type: "term-gym", done: {}, waterMl: 0, wakeAt: ts(d, at(8)) }; }
    const last = addDays(D, 6);
    s.days[last] = { type: "term-gym", done: {}, waterMl: 0, wakeAt: ts(addDays(last, -1), at(7, 40)) }; // early tap on its own day
    expect(extractDays(s, last, 7).at(-1)!.wakeMin).toBe(460);
    const r = rangeStats(s, last, 7);
    expect(r.sleep.wakeSd).toBeLessThan(15); // was about 500 with bkkMin
  });
});

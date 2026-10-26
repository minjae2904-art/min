import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog, type State } from "../model";
import { accessoryFor, currentPhase } from "../phase";
import { planEpoch } from "../ticks";

const DATE = "2026-10-26";
const day: DayLog = { type: "stream-gym", done: {}, waterMl: 0 };
const ms = (min: number) => planEpoch(DATE, min);
const withRun = (s: State, atMin: number) => { s.run = { k: "live", date: DATE, at: ms(atMin), b: 60, slot: 0, ok: 0, seen: 0, br: 0 }; return s; };
const withRest = (s: State, endMin: number) => { s.gym.run = { d: DATE, c: "D1", at: ms(endMin - 30), x: [], rest: { end: ms(endMin), ex: "sq", dur: 90 } }; return s; };

describe("accessoryFor priority with nowMs", () => {
  it("rest > session > live > phase", () => {
    const s = withRest(withRun(normalize({}), at(19)), at(20));
    const rest = accessoryFor(s, day, DATE, at(20) - 1, ms(at(20)) - 72_000);
    expect(rest).toMatchObject({ kind: "rest", label: "พัก", sec: 72, left: 2, color: "var(--area-training)" });
    const sess = accessoryFor(withRun(normalize({}), at(19)), day, DATE, at(20, 42), ms(at(20, 42)));
    expect(sess).toMatchObject({ kind: "session", label: "ไลฟ์อยู่", left: 102, up: true, color: "var(--ph-live)" });
    expect(accessoryFor(normalize({}), day, DATE, at(20), ms(at(20)))).toMatchObject({ kind: "live", label: "ไลฟ์" });
    const c = currentPhase(normalize({}), day, at(14), DATE);
    expect(accessoryFor(normalize({}), day, DATE, at(14), ms(at(14)))).toEqual({ kind: "phase", label: c.phase.label, left: c.left, color: c.phase.color, key: c.phase.key });
  });
  it("a rest ended more than 30 s ago no longer shows; 0 while just done", () => {
    const s = withRest(normalize({}), at(20));
    expect(accessoryFor(s, day, DATE, at(20), ms(at(20)) + 10_000)).toMatchObject({ kind: "rest", sec: 0 });
    expect(accessoryFor(s, day, DATE, at(20), ms(at(20)) + 31_000).kind).toBe("live");
  });
});

describe("accessoryFor with a stale run", () => {
  it("asks instead of counting (yesterday's run or 12 h+), still kind session so a tap opens Live mode", () => {
    const s = normalize({});
    s.run = { k: "live", date: "2026-10-25", at: planEpoch("2026-10-25", at(19)), b: 60, slot: 0, ok: 0, seen: 0, br: 0 };
    const a = accessoryFor(s, day, DATE, at(13), ms(at(13)));
    expect(a).toMatchObject({ kind: "session", label: "ลืมจบไลฟ์?", left: 0, stale: true });
    expect(a.up).toBeUndefined();
    s.run = { ...s.run, k: "sing" };
    expect(accessoryFor(s, day, DATE, at(13), ms(at(13))).label).toBe("ลืมจบร้องเพลง?");
  });
});

describe("accessoryFor without nowMs", () => {
  it("ignores rest and session exactly like v1.6", () => {
    const plain = normalize({});
    const busy = withRest(withRun(normalize({}), at(19)), at(20));
    for (const m of [at(10), at(14), at(19, 30), at(20), at(1), at(8, 1)]) expect(accessoryFor(busy, day, DATE, m)).toEqual(accessoryFor(plain, day, DATE, m));
    expect(accessoryFor(busy, day, DATE, at(20)).kind).toBe("live");
  });
});

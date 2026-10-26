import { describe, expect, it } from "vitest";
import { acquire, type WakeSentinel } from "../../components/useWakeLock";
import { at } from "../date";
import { normalize, type Run, type State } from "../model";
import {
  ackCue, addBreak, bumpRest, clearRest, cueList, endRun, hmClock, markClip, msClock, nextCue, plannedEndMs, recapOf, restLeft,
  setRecap, startRest, startRun, staleRun,
} from "../session";
import { planEpoch } from "../ticks";

const DATE = "2026-10-26";
const MIN = 60_000;
const T0 = planEpoch(DATE, at(19)); // 19:00 Bangkok on the stream-gym day
const fresh = (type = "stream-gym"): State => { const s = normalize({}); s.days[DATE] = { type, done: {}, waterMl: 0 }; return s; };
const run = (o: Partial<Run> = {}): Run => ({ k: "live", date: DATE, at: T0, b: 60, slot: 0, ok: 0, seen: 0, br: 0, eyes: true, ...o });
const sig = (r: Run, until: number) => cueList(r, until).map((c) => `${c.atMin}${c.kind[0]}`);

describe("cueList", () => {
  it("eyes every 20, breaks every b with rotating kinds, eyes near a break dropped", () => {
    expect(sig(run(), 130)).toEqual(["20e", "40e", "60s", "80e", "100e", "120w"]);
    expect(sig(run({ b: 45 }), 150)).toEqual(["20e", "45s", "60e", "80e", "90w", "100e", "120e", "135v"]);
    expect(cueList(run(), 130).map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("b = 0 gives no break cues; eyes off gives none at all", () => {
    expect(sig(run({ b: 0 }), 70)).toEqual(["20e", "40e", "60e"]);
    expect(cueList(run({ b: 0, eyes: false }), 300)).toEqual([]);
  });
  it("sing: sip every 10, no eyes", () => {
    expect(sig(run({ k: "sing", b: 10 }), 30)).toEqual(["10s", "20s", "30s"]);
  });
  it("slots are stable as time passes (b = 45: eyes 40 is dropped before the break is due)", () => {
    const r = run({ b: 45 });
    expect(sig(r, 40)).toEqual(["20e"]);
    expect(sig(r, 45)).toEqual(["20e", "45s"]);
    for (const [a, b] of [[40, 45], [44, 135], [139, 300]]) expect(cueList(r, b).slice(0, cueList(r, a).length)).toEqual(cueList(r, a));
    expect(nextCue({ ...r, slot: 1 }, T0 + 45 * MIN + 30_000)).toEqual({ cue: { slot: 1, kind: "stand", atMin: 45 }, missed: 0 });
  });
  it("caps at 300", () => { expect(cueList(run({ b: 1 }), 10_000).length).toBe(300); });
});

describe("nextCue", () => {
  it("returns the latest due cue with the skipped ones as missed", () => {
    const r = run();
    expect(nextCue(r, T0 + 10 * MIN)).toBeNull();
    expect(nextCue(r, T0 + 85 * MIN)).toEqual({ cue: { slot: 3, kind: "eyes", atMin: 80 }, missed: 3 });
    expect(nextCue({ ...r, slot: 4 }, T0 + 85 * MIN)).toBeNull();
  });
});

describe("startRun", () => {
  it("ticks the stream with the real time (src now) and fills the pre-live checklist", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0, { pre: ["set", "post", "warm", "bt"] });
    const d = s.days[DATE];
    expect(s.run).toMatchObject({ k: "live", date: DATE, at: T0, b: 60, eyes: true, slot: 0 });
    expect(d.done.stream).toBe(T0);
    expect(d.doneSrc?.stream).toEqual({ src: "now", ts: T0 });
    expect(d.care?.prep?.split(",").sort()).toEqual(["bt", "post", "set", "warm"]);
    expect(d.done["stream-prep"]).toBe(T0);
  });
  it("a partial checklist does not tick stream-prep; eyes off and the break setting are snapshotted", () => {
    const s = fresh();
    s.settings.gameBreakMin = 45;
    startRun(s, DATE, "live", T0, { pre: ["set", "zzz"], eyes: false });
    expect(s.days[DATE].care?.prep).toBe("set");
    expect(s.days[DATE].done["stream-prep"]).toBeUndefined();
    expect(s.run).toMatchObject({ b: 45, eyes: false });
  });
});

describe("cues and breaks", () => {
  it("an ack never adds water; at most one break per 5 min across ack and 'พักแล้ว'", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0);
    const [stand] = cueList(s.run!, 60).filter((c) => c.kind === "stand");
    ackCue(s, stand, true, 2, T0 + 60 * MIN);
    expect(s.days[DATE].waterMl).toBe(0);
    expect(s.run).toMatchObject({ slot: stand.slot + 1, seen: 3, ok: 1, br: 1 });
    expect(s.days[DATE].breaks).toBe(1);
    expect(addBreak(s, T0 + 63 * MIN)).toBe(false);
    expect(s.days[DATE].breaks).toBe(1);
    expect(addBreak(s, T0 + 66 * MIN)).toBe(true);
    expect(s.days[DATE].breaks).toBe(2);
    const water = { slot: stand.slot + 1, kind: "water" as const, atMin: 120 };
    ackCue(s, water, true, 0, T0 + 120 * MIN);
    expect(s.days[DATE].waterMl).toBe(0);
    expect(s.run!.br).toBe(2);
  });
});

describe("endRun", () => {
  it("accumulates a second live session", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0);
    markClip(s, T0 + 42 * MIN);
    expect(endRun(s, T0 + 60 * MIN)).toEqual({ date: DATE, k: "live", min: 60 });
    expect(s.run).toBeNull();
    startRun(s, DATE, "live", T0 + 90 * MIN);
    markClip(s, T0 + 100 * MIN);
    endRun(s, T0 + 120 * MIN);
    expect(s.days[DATE].live).toMatchObject({ min: 90, n: 2, at: T0, end: T0 + 120 * MIN, mk: [42, 10] }); // marks appended
    expect(s.runEnd).toBe(T0 + 90 * MIN); // merge tombstone
  });
  it("clamps: an end before the start gives 0; no run gives null", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0);
    expect(endRun(s, T0 + 5 * MIN, T0 - 10 * MIN)?.min).toBe(0);
    expect(endRun(s, T0)).toBeNull();
  });
  it("sing snaps the minutes", () => {
    for (const [m, want] of [[22, 20], [35, 30], [41, 45], [12, 10]] as const) {
      const s = fresh();
      startRun(s, DATE, "sing", T0);
      endRun(s, T0 + m * MIN);
      expect(s.days[DATE].sing?.min).toBe(want);
      expect(s.days[DATE].live).toBeUndefined();
    }
  });
});

describe("stale and planned end", () => {
  it("staleRun: an earlier date or more than 12 h", () => {
    expect(staleRun(run(), "2026-10-27", T0 + MIN)).toBe(true);
    expect(staleRun(run(), DATE, T0 + 13 * 60 * MIN)).toBe(true);
    expect(staleRun(run(), DATE, T0 + 60 * MIN)).toBe(false);
  });
  it("plannedEndMs is the stream end, null when the run started after it", () => {
    const s = fresh();
    expect(plannedEndMs(s, run())).toBe(planEpoch(DATE, at(0, 30)));
    expect(plannedEndMs(s, run({ at: planEpoch(DATE, at(1)) }))).toBeNull();
    expect(plannedEndMs(fresh("off"), run())).toBeNull();
  });
});

describe("recap", () => {
  it("setRecap writes sing.strain only when the sing item is done", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0);
    endRun(s, T0 + 60 * MIN);
    setRecap(s, DATE, { mood: 3, v: 2 });
    expect(s.days[DATE].live).toMatchObject({ mood: 3, v: 2 });
    expect(s.days[DATE].sing?.strain).toBeUndefined();
    s.days[DATE].done.sing = T0;
    setRecap(s, DATE, { v: 1, restTomorrow: true });
    expect(s.days[DATE].sing?.strain).toBe(true);
    expect(s.days["2026-10-27"].voiceRest).toBe(true);
  });
  it("recapOf: duration vs plan and the late close", () => {
    const s = fresh();
    startRun(s, DATE, "live", T0);
    endRun(s, planEpoch(DATE, at(0, 50)));
    const r = recapOf(s, DATE);
    expect(r).toMatchObject({ min: 350, planMin: 330, overMin: 20 });
    expect(r.sleepAt).not.toBeNull();
  });
});

describe("clocks", () => {
  it("formats", () => {
    expect(hmClock(62 * MIN + 30_000)).toBe("1:02");
    expect(hmClock(-5)).toBe("0:00");
    expect(msClock(72)).toBe("1:12");
    expect(msClock(5)).toBe("0:05");
  });
});

describe("rest timer", () => {
  it("start, bump, clear and left", () => {
    const s = fresh();
    startRest(s, "sq", 90, T0);
    expect(s.gym.run).toBeNull(); // no gym session: nothing to attach to
    s.gym.run = { d: DATE, c: "D1", at: T0, x: [] };
    startRest(s, "sq", 90, T0);
    expect(restLeft(s, T0)).toBe(90);
    bumpRest(s, -15, T0);
    expect(restLeft(s, T0)).toBe(75);
    bumpRest(s, 15, T0);
    expect(restLeft(s, T0 + 10_000)).toBe(80);
    expect(restLeft(s, T0 + 100_000)).toBe(0);
    expect(restLeft(s, T0 + 121_000)).toBeNull();
    bumpRest(s, -200, T0);
    expect(s.gym.run.rest).toBeUndefined();
    startRest(s, "sq", 5, T0);
    expect(s.gym.run.rest?.dur).toBe(15);
    clearRest(s);
    expect(restLeft(s, T0)).toBeNull();
  });
});

describe("wake lock acquire()", () => {
  it("no API, a refusal and a grant", async () => {
    expect(await acquire(undefined)).toBeNull();
    expect(await acquire({})).toBeNull();
    expect(await acquire({ wakeLock: { request: () => Promise.reject(new Error("NotAllowed")) } })).toBeNull();
    const w: WakeSentinel = { release: () => Promise.resolve() };
    expect(await acquire({ wakeLock: { request: () => Promise.resolve(w) } })).toBe(w);
  });
});

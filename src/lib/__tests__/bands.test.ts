// v1.8 consistency bands: x/7 and x/28 per key, misses never reset, off days never count.
import { describe, expect, it } from "vitest";
import { BAND_KEYS, band, bandMatrix, bandRows, bandText, type BandKey } from "../bands";
import { addDays } from "../date";
import { TODAY, build } from "./brain-fixtures";

const dayAgo = (k: number) => addDays(TODAY, -k);

describe("bands", () => {
  it("a good week is 7/7 on the day key", () => {
    const b = band(build(7), TODAY, "day", 7);
    expect(b.cells).toEqual(Array(7).fill("hit"));
    expect([b.hit, b.elig, bandText(b)]).toEqual([7, 7, "7/7 วัน"]);
  });
  it("6 hits and 1 miss give 6/7, and the miss resets nothing", () => {
    const b = band(build(8, (_d, i) => (i === 3 ? { ticks: "none" } : {})), TODAY, "day", 7);
    expect(b.cells[2]).toBe("miss");
    expect([b.hit, b.elig]).toEqual([6, 7]);
  });
  it("today counts only once hit; a pending today is not counted", () => {
    const s = build(7, (_d, i) => (i === 6 ? { ticks: "none", sleepH: null } : {}));
    const b = band(s, TODAY, "day", 7);
    expect(b.cells.at(-1)).toBe("today");
    expect([b.hit, b.elig]).toEqual([6, 6]);
  });
  it("a sick day is off for every key", () => {
    const s = build(7, (_d, i) => (i === 2 ? { ticks: "none" } : {}));
    s.days[dayAgo(4)].sym = ["sick"];
    const m = bandMatrix(s, TODAY, 7);
    for (const k of BAND_KEYS) expect([k, m[k][2]]).toEqual([k, "off"]);
    expect(band(s, TODAY, "day", 7).elig).toBe(6);
  });
  it("gym: travel/na/rest/sick reasons and days without gym are off; D-code workouts hit", () => {
    const s = build(7, () => ({ tpl: "balanced", ticks: "none" }));
    const k = (d: number) => band(s, TODAY, "gym", 7).cells[6 - d];
    expect(k(1)).toBe("miss");
    s.days[dayAgo(1)].skipWhy = { gym: "travel" };
    expect(k(1)).toBe("off");
    s.days[dayAgo(1)].skipWhy = { gym: "na" };
    expect(k(1)).toBe("off");
    s.days[dayAgo(2)].skipWhy = { gym: "rest" };
    expect(k(2)).toBe("off");
    s.workouts.push({ date: dayAgo(3), code: "D2" });
    expect(k(3)).toBe("hit");
    s.workouts.push({ date: dayAgo(4), code: "R-tennis" });
    expect(k(4)).toBe("miss");
    s.days[dayAgo(5)].type = "rest";
    expect(k(5)).toBe("off");
  });
  it("live: no stream item is off; done or real live minutes hit; travel off", () => {
    const s = build(7, () => ({ tpl: "stream-gym", ticks: "none" }));
    const k = (d: number) => band(s, TODAY, "live", 7).cells[6 - d];
    expect(k(1)).toBe("miss");
    s.days[dayAgo(1)].live = { min: 120, n: 1, at: 1, end: 2, ok: 0, seen: 0, br: 0 };
    expect(k(1)).toBe("hit");
    s.days[dayAgo(2)].done.stream = 1;
    expect(k(2)).toBe("hit");
    s.days[dayAgo(3)].skipWhy = { stream: "travel" };
    expect(k(3)).toBe("off");
    s.days[dayAgo(4)].type = "balanced";
    expect(k(4)).toBe("off");
  });
  it("voice: voice rest and days without singing are off", () => {
    const s = build(7, () => ({ tpl: "balanced" }));
    const k = (d: number) => band(s, TODAY, "voice", 7).cells[6 - d];
    expect(k(1)).toBe("hit");
    delete s.days[dayAgo(1)].done.sing;
    expect(k(1)).toBe("miss");
    s.days[dayAgo(1)].voiceRest = true;
    expect(k(1)).toBe("off");
  });
  it("sleep and water cells", () => {
    const s = build(7, (_d, i) => ({ sleepH: i === 3 ? 6 : 8, water: i === 4 ? 0 : "goal" }));
    expect(band(s, TODAY, "sleep", 7).cells).toEqual(["none", "hit", "hit", "miss", "hit", "hit", "hit"]); // day 1 has no prior bedtime
    expect(band(s, TODAY, "water", 7).cells[4]).toBe("miss");
    expect(band(s, TODAY, "water", 7).hit).toBe(6);
  });
  it("a new user with 3 logged days has at most 3 eligible days anywhere", () => {
    const s = build(3);
    for (const k of BAND_KEYS) for (const n of [7, 28] as const) {
      const b = band(s, TODAY, k, n);
      expect(b.elig, `${k} ${n}`).toBeLessThanOrEqual(3);
      expect(b.cells.slice(0, n - 3).every((c) => c === "none")).toBe(true);
    }
  });
  it("unlogged gap days are none, not misses", () => {
    const b = band(build(7, (_d, i) => (i === 2 ? { skip: true } : {})), TODAY, "day", 7);
    expect(b.cells[2]).toBe("none");
    expect([b.hit, b.elig]).toEqual([6, 6]);
  });
  it("the 28-day window", () => {
    const b = band(build(30, (_d, i) => (i % 5 === 0 ? { ticks: "none" } : {})), TODAY, "day", 28);
    expect(b.cells).toHaveLength(28);
    expect(b.elig).toBe(28);
    expect(b.hit).toBe(28 - 5); // i = 5, 10, 15, 20, 25 fall inside the window
  });
  it("bandRows keeps keys with data, from one matrix", () => {
    const s = build(10); // no-job week: no stream templates
    const rows = bandRows(s, TODAY);
    expect(rows.map((r) => r.key)).not.toContain("live");
    expect(rows.map((r) => r.key)).toContain("day");
    const day = rows.find((r) => r.key === "day")!;
    expect(day.b7).toEqual(band(s, TODAY, "day", 7));
    expect(day.b28).toEqual(band(s, TODAY, "day", 28));
  });
  it("bandMatrix equals per-key band()", () => {
    const s = build(20, (_d, i) => ({ tpl: i % 2 ? "stream-gym" : "balanced", ticks: i % 3 ? "all" : "none", sleepH: i % 4 ? 8 : 6 }));
    const m = bandMatrix(s, TODAY, 28);
    for (const k of BAND_KEYS as BandKey[]) expect([k, m[k]]).toEqual([k, band(s, TODAY, k, 28).cells]);
  });
});

import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { markSleep } from "../actions";
import { normalize } from "../model";
import { weightStats } from "../stats";

const daily = (from: string, n: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), kg: 67 + i * 0.05 }));

describe("weightStats.rate", () => {
  it("stays set before today's weigh-in (anchored on the newest one)", () => {
    const s = normalize({ weights: daily("2026-10-01", 17) }); // last = 10-17
    const w = weightStats(s, "2026-10-18");
    const ref = w.series.find((x) => x.date === "2026-10-10")!;
    expect(w.rate).toBeCloseTo(w.cur - ref.trend, 6);
  });
  it("survives a few missed days", () => {
    const s = normalize({ weights: daily("2026-10-01", 14) }); // last = 10-14
    expect(weightStats(s, "2026-10-18").rate).not.toBeNull();
  });
  it("is null when the newest weigh-in is over a week old or the reference is over 14 days back", () => {
    expect(weightStats(normalize({ weights: daily("2026-09-20", 14) }), "2026-10-18").rate).toBeNull();
    expect(weightStats(normalize({ weights: [{ date: "2026-10-01", kg: 67 }, { date: "2026-10-17", kg: 68 }] }), "2026-10-18").rate).toBeNull();
  });
});

describe("markSleep", () => {
  it("undoing bedtime keeps a manual pause when sleepDnd did not arm one", () => {
    const s = normalize({});
    s.settings.sleepDnd = false;
    s.settings.dndUntil = 123456;
    markSleep(s, "2026-10-18", true);
    markSleep(s, "2026-10-18", false);
    expect(s.settings.dndUntil).toBe(123456);
  });
  it("undoing bedtime restores the pause sleepDnd replaced", () => {
    const s = normalize({});
    s.settings.sleepDnd = true;
    s.settings.dndUntil = 0;
    markSleep(s, "2026-10-18", true, Date.parse("2026-10-18T22:00:00+07:00"));
    expect(s.settings.dndUntil).toBeGreaterThan(0);
    markSleep(s, "2026-10-18", false);
    expect(s.settings.dndUntil).toBe(0);
  });
});

// v1.8 app icon badge rule.
import { describe, expect, it } from "vitest";
import { badgeCount } from "../badge";
import { at } from "../date";
import { DEFAULT_STATE, normalize, type DayLog, type State } from "../model";
import { itemsFor } from "../schedule";
import { applyLevel } from "../care/progress";
import { tsAt } from "./brain-fixtures";

const D = "2026-11-03"; // Tuesday, a term day below
const T = (min: number) => new Date(tsAt(D, min));
const mk = (type = "stream-gym", set: Partial<State["settings"]> = {}): State => {
  const s = normalize({ settings: { ...DEFAULT_STATE.settings, ...set } });
  s.days[D] = { type, done: {}, waterMl: 0 } as DayLog;
  return s;
};

describe("badgeCount", () => {
  it("counts pending required items whose time has come", () => {
    const s = mk();
    expect(badgeCount(s, T(at(9, 0)))).toBe(0);
    expect(badgeCount(s, T(at(9, 30)))).toBe(1); // weigh
    expect(badgeCount(s, T(at(10, 5)))).toBe(4); // weigh, posture, meal1, supp1
    s.days[D].done = { weigh: 1, posture: 1 };
    expect(badgeCount(s, T(at(10, 5)))).toBe(2);
  });
  it("is 0 when the setting is off", () => {
    expect(badgeCount(mk("stream-gym", { badge: false }), T(at(12)))).toBe(0);
  });
  it("never counts sleep; 0 after today's sleepAt and from sleep + 60", () => {
    const s = mk();
    s.days[D].done = Object.fromEntries(itemsFor(s.schedule, s.days[D], D).filter((i) => i.ring && i.kind !== "sleep").map((i) => [i.id, 1]));
    expect(badgeCount(s, T(at(1, 45)))).toBe(0); // sleep 01:30 is pending but excluded
    const open = mk();
    expect(badgeCount(open, T(at(2, 0)))).toBeGreaterThan(10);
    expect(badgeCount(open, T(at(2, 30)))).toBe(0); // day end
    open.days[D].sleepAt = tsAt(D, at(1, 0));
    expect(badgeCount(open, T(at(1, 10)))).toBe(0);
  });
  it("excludes care rows and routine-hosted rows", () => {
    const s = mk();
    applyLevel(s, "std", D);
    const all = itemsFor(s.schedule, s.days[D], D);
    const now = at(1, 20);
    const care = all.filter((i) => i.ring && i.min <= now && (i.kind === "care" || i.routine));
    expect(care.length).toBeGreaterThan(0);
    const want = all.filter((i) => i.ring && i.min <= now && i.kind !== "care" && !i.routine && i.kind !== "sleep").length;
    expect(badgeCount(s, T(now))).toBe(want);
  });
  it("an item due during class counts only from the class end", () => {
    const s = mk();
    s.schedule.term = { start: "2026-11-02", end: "2027-03-05", cls: [{ id: "a", d: 2, s: at(10), e: at(12), t: "ฟิสิกส์" }] };
    expect(badgeCount(s, T(at(11)))).toBe(2); // weigh 09:30 and posture 09:45 only
    expect(badgeCount(s, T(at(12)))).toBe(6); // + meal1, supp1, sing 10:45, clips 11:15
    s.schedule.term = null;
    expect(badgeCount(s, T(at(11)))).toBe(5); // clips 11:15 not yet
  });
  it("caps at 99", () => {
    const s = mk();
    s.schedule.custom = Array.from({ length: 120 }, (_, i) => ({ id: "c" + i, title: "x" + i, min: at(9), ring: "habit" as const, days: "stream-gym" }));
    expect(badgeCount(s, T(at(10)))).toBe(99);
  });
});

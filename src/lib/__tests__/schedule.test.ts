import { describe, expect, it } from "vitest";
import { at } from "../date";
import type { ScheduleCfg } from "../model";
import { baseDay, buildDay, maxDayShift } from "../schedule";

const LAST = at(7, 59); // 1919: nothing may cross the 08:00 rollover
const cfg = (over: Partial<ScheduleCfg> = {}): ScheduleCfg => ({ shiftMin: 0, overrides: {}, custom: [], ...over });
const byId = (items: ReturnType<typeof buildDay>, id: string) => items.find((i) => i.id === id);

describe("baseDay", () => {
  it("is sorted and has the anchors", () => {
    const d = baseDay("work", "A");
    expect(d.map((i) => i.min)).toEqual([...d.map((i) => i.min)].sort((a, b) => a - b));
    expect(byId(d, "weigh")?.min).toBe(at(13));
    expect(byId(d, "work-in")?.min).toBe(at(16));
    expect(byId(d, "sleep")?.min).toBe(at(5));
  });
  it("meal2 options change the late items", () => {
    expect(byId(baseDay("work", "B"), "snack-b")?.min).toBe(at(23, 45));
    const c = baseDay("work", "C");
    expect(byId(c, "meal2")).toBeUndefined();
    expect(byId(c, "meal2c")?.min).toBe(at(2, 5));
    expect(byId(c, "supp2")).toBeUndefined();
    expect(byId(c, "gym")?.min).toBe(at(3));
  });
});

describe("buildDay", () => {
  it("without cfg equals baseDay", () => {
    expect(buildDay("off")).toEqual(baseDay("off"));
  });
  it("shifts ring items but not work start/end", () => {
    const d = buildDay("work", "A", cfg({ shiftMin: 60 }));
    expect(byId(d, "weigh")?.min).toBe(at(14));
    expect(byId(d, "work-in")?.min).toBe(at(16));
    expect(byId(d, "work-out")?.min).toBe(at(2));
  });
  it("trims a positive shift as one block so no ring item crosses 08:00", () => {
    const d = buildDay("work", "A", cfg({ shiftMin: 180 }), 240);
    const rings = d.filter((i) => i.ring);
    expect(Math.max(...rings.map((i) => i.min))).toBe(LAST);
    expect(rings.every((i) => i.min <= LAST)).toBe(true);
    expect(byId(d, "weigh")?.min).toBe(959);
    expect(byId(d, "sleep")?.min).toBe(LAST);
    expect(byId(d, "meal3")?.min).toBe(LAST - 60); // spacing kept, no burst at 07:59
  });
  it("moves overrides by the same trimmed amount, keeping their order", () => {
    const d = buildDay("work", "A", cfg({ overrides: { "work:posture": { min: at(13, 15) } } }), 240);
    expect(byId(d, "weigh")?.min).toBe(at(13) + 179);
    expect(byId(d, "posture")?.min).toBe(at(13, 15) + 179);
    expect(d.map((i) => i.id).indexOf("posture")).toBeLessThan(d.map((i) => i.id).indexOf("meal1"));
  });
  it("never trims a positive shift below 0 nor touches a zero/negative one", () => {
    const late = [{ id: "c1", title: "Late", min: LAST, ring: "habit" as const, days: "both" as const }];
    expect(byId(buildDay("work", "A", cfg({ custom: late, shiftMin: 60 })), "weigh")?.min).toBe(at(13));
    expect(byId(buildDay("work", "A", cfg({ shiftMin: -180 })), "weigh")?.min).toBe(at(10));
  });
  it("pins a custom item stored past 07:59 without dragging the day earlier or blocking a shift", () => {
    const custom = [{ id: "c1", title: "Late", min: at(7, 30) + 180, ring: "habit" as const, days: "both" as const }];
    const d = buildDay("work", "A", cfg({ custom }));
    expect(byId(d, "weigh")?.min).toBe(at(13));
    expect(byId(d, "sleep")?.min).toBe(at(5));
    expect(byId(d, "c1")?.min).toBe(LAST);
    expect(byId(buildDay("work", "A", cfg({ custom, shiftMin: 60 })), "weigh")?.min).toBe(at(14));
    expect(byId(buildDay("work", "A", cfg({ custom, shiftMin: -180 })), "c1")?.min).toBe(at(7, 30));
  });
  it("maxDayShift is the room buildDay applies untrimmed", () => {
    expect(maxDayShift("work", "A", cfg())).toBe(179);
    expect(maxDayShift("work", "C", cfg())).toBe(149);
    expect(maxDayShift("work", "A", cfg({ shiftMin: 60 }))).toBe(119);
    expect(maxDayShift("work", "A", cfg({ shiftMin: 180 }))).toBe(0);
    expect(byId(buildDay("work", "C", cfg(), 149), "weigh")?.min).toBe(at(13) + 149);
  });
  it("applies overrides: disable, retime, rename, remind", () => {
    const d = buildDay("work", "A", cfg({ overrides: { "work:posture": { enabled: false }, "work:trade": { min: at(15, 30), title: "Trade", remind: false } } }));
    expect(byId(d, "posture")).toBeUndefined();
    const trade = byId(d, "trade");
    expect(trade?.min).toBe(at(15, 30));
    expect(trade?.title).toBe("Trade");
    expect(trade?.remind).toBe(false);
    expect(byId(d, "weigh")?.remind).toBe(true);
  });
  it("adds custom items for the matching day type only", () => {
    const custom = [
      { id: "c1", title: "Stretch", min: at(14), ring: "habit" as const, days: "both" as const },
      { id: "c2", title: "Walk", min: at(17), ring: "body" as const, days: "off" as const },
    ];
    const work = buildDay("work", "A", cfg({ custom, shiftMin: 30 }));
    expect(byId(work, "c1")?.min).toBe(at(14, 30));
    expect(byId(work, "c1")?.custom).toBe(true);
    expect(byId(work, "c2")).toBeUndefined();
    expect(byId(buildDay("off", undefined, cfg({ custom })), "c2")?.min).toBe(at(17));
  });
});

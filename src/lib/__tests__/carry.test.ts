import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog } from "../model";
import { itemsFor, LAST } from "../schedule";
import { dayScore } from "../stats";
import { applyLevel } from "../care/progress";

const D = "2026-10-25"; // Sunday: stream-rest in the stream week
const s = normalize({});
const day = (o: Partial<DayLog> = {}): DayLog => ({ type: "stream-rest", done: {}, waterMl: 0, ...o });
const ids = (o: Partial<DayLog>) => itemsFor(s.schedule, day(o), D).map((i) => i.id);

describe("DayLog.carry in itemsFor", () => {
  it("appends a carried item at its minute with carried: true and no planMin", () => {
    const l = itemsFor(s.schedule, day({ carry: { sing: ["stream-gym", at(10, 45)] } }), D);
    const it = l.find((i) => i.id === "sing")!;
    expect(it).toMatchObject({ min: at(10, 45), carried: true, kind: "sing", ring: "habit" });
    expect(it.planMin).toBeUndefined();
    expect(l.map((i) => i.min)).toEqual([...l.map((i) => i.min)].sort((a, b) => a - b));
  });
  it("never duplicates an id the day already has", () => {
    const l = itemsFor(s.schedule, day({ carry: { meal1: ["stream-gym", at(15)] } }), D);
    expect(l.filter((i) => i.id === "meal1")).toHaveLength(1);
    expect(l.find((i) => i.id === "meal1")?.carried).toBeUndefined();
  });
  it("ignores an unknown template, a missing item and bad values", () => {
    const base = ids({});
    expect(ids({ carry: { sing: ["nope", at(12)] } })).toEqual(base);
    expect(ids({ carry: { zzz: ["stream-gym", at(12)] } })).toEqual(base);
    expect(ids({ carry: { sing: "x" as never } })).toEqual(base);
    expect(ids({ carry: { sing: ["stream-gym", Number.NaN] } })).toEqual(base);
  });
  it("hides a carried sing item on a voice-rest day", () => {
    expect(ids({ voiceRest: true, carry: { sing: ["stream-gym", at(11)] } })).not.toContain("sing");
  });
  it("clamps the minute between the first row + 5 and 07:59, so a carried row is never items[0]", () => {
    const first = itemsFor(s.schedule, day(), D)[0];
    for (const m of [100, at(8), first.min - 60]) {
      const l = itemsFor(s.schedule, day({ carry: { sing: ["stream-gym", m] } }), D);
      expect(l[0].id).toBe(first.id);
      expect(l.find((i) => i.id === "sing")?.min).toBe(first.min + 5);
    }
    expect(itemsFor(s.schedule, day({ carry: { sing: ["stream-gym", 5000] } }), D).find((i) => i.id === "sing")?.min).toBe(LAST);
  });
  it("reads at most 3 entries", () => {
    const carry: DayLog["carry"] = { sing: ["stream-gym", at(11)], trade: ["stream-gym", at(15)], gym: ["stream-gym", at(16)], clips: ["stream-gym", at(17)] };
    const l = itemsFor(s.schedule, day({ carry }), D);
    expect(l.filter((i) => i.carried).map((i) => i.id).sort()).toEqual(["gym", "sing", "trade"]);
  });
  it("carries only reschedulable ring items, never care rows, blocks, weigh or sleep", () => {
    const c = normalize({});
    applyLevel(c, "std", D);
    const base = itemsFor(c.schedule, day(), D).map((i) => i.id);
    const l = itemsFor(c.schedule, day({ carry: { "r-gym": ["stream-gym", at(17)], game: ["balanced", at(21)], "caf": ["stream-gym", at(16)] } }), D);
    expect(l.map((i) => i.id)).toEqual(base);
  });
  it("is scored, can be skipped and moved like any item", () => {
    const carry: DayLog["carry"] = { sing: ["stream-gym", at(11)] };
    const n = itemsFor(s.schedule, day(), D).filter((i) => i.ring).length;
    expect(itemsFor(s.schedule, day({ carry }), D).filter((i) => i.ring)).toHaveLength(n + 1);
    expect(dayScore(s, day({ carry, done: { sing: 1 } }))).toBeCloseTo(1 / (n + 1));
    expect(ids({ carry, skip: { sing: 1 } })).not.toContain("sing");
    const moved = itemsFor(s.schedule, day({ carry, moved: { sing: at(12) } }), D).find((i) => i.id === "sing")!;
    expect(moved).toMatchObject({ min: at(12), planMin: at(11), carried: true });
  });
});

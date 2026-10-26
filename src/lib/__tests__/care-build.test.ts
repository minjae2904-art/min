import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog, type State } from "../model";
import { buildDay, itemsFor, LAST, type Item } from "../schedule";
import { applyLevel } from "../care/progress";
import type { Routine } from "../care/types";
import { TEMPLATES } from "../templates";

const TODAY = "2026-10-27"; // Tuesday
const std = (): State => { const s = normalize({}); applyLevel(s, "std", TODAY); return s; };
const day = (type: string, o: Partial<DayLog> = {}): DayLog => ({ type, done: {}, waterMl: 0, ...o });
const byId = (l: Item[], id: string) => l.find((i) => i.id === id);
const custom = (anchor: Routine["anchor"], id = "u-a"): Routine => ({ id, name: "ของฉัน", anchor, remind: false, on: true, steps: [{ id: "x", title: "ทำ", tag: "mind" }] });

describe("care rows in the day", () => {
  it("places each routine after its anchor (stream season examples)", () => {
    const s = std();
    const g = itemsFor(s.schedule, day("stream-gym"), TODAY);
    expect(byId(g, "r-am")?.min).toBe(at(9, 40));
    expect(byId(g, "r-gym")?.min).toBe(at(17, 20));
    expect(byId(itemsFor(s.schedule, day("stream-mc"), TODAY), "r-gym")?.min).toBe(at(17, 5));
    expect(byId(g, "night")).toMatchObject({ min: at(0, 55), routine: "pm", title: "ก่อนนอน" });
    expect(byId(g, "stream-prep")).toMatchObject({ min: at(18, 30), routine: "prep", title: "ก่อนไลฟ์" });
    expect(byId(g, "r-am")).toMatchObject({ kind: "care", ring: "habit", routine: "am", remind: false, cue: "หลังชั่งน้ำหนัก" });
    expect(byId(g, "r-gym")?.cue).toBe("หลังยิม");
  });
  it("leaves out r-gym on stream-rest and the marathon", () => {
    const s = std();
    for (const t of ["stream-rest", "stream-marathon", "rest"]) expect(byId(itemsFor(s.schedule, day(t), TODAY), "r-gym")).toBeUndefined();
  });
  it("moves with shiftMin, the today-only shift and the taper; {at} follows the shift", () => {
    const s = std();
    s.schedule.care!.push(custom({ at: at(12) }));
    const base = itemsFor(s.schedule, day("stream-gym"), TODAY);
    const shifted = itemsFor(s.schedule, day("stream-gym", { shiftMin: 30 }), TODAY);
    expect(byId(shifted, "r-am")!.min - byId(base, "r-am")!.min).toBe(30);
    expect(byId(shifted, "r-u-a")!.min).toBe(at(12, 30));
    const g = itemsFor({ ...s.schedule, shiftMin: 15 }, day("stream-gym"), TODAY);
    expect(byId(g, "r-am")?.min).toBe(at(9, 55));
    expect(byId(g, "r-u-a")?.min).toBe(at(12, 15));
    const tp = { ...s.schedule, taper: { start: TODAY, fromMin: 60, stepMin: 30 } };
    expect(byId(itemsFor(tp, day("stream-gym"), TODAY), "r-am")?.min).toBe(at(10, 40));
  });
  it("never puts a care row first: an 08:30 {at} routine clamps to wake + 5", () => {
    const s = std();
    s.schedule.care!.push(custom({ at: at(8, 30) }));
    for (const t of ["stream-gym", "work", "off", "balanced"]) {
      const l = itemsFor(s.schedule, day(t), TODAY);
      expect(l[0].kind).not.toBe("care");
      expect(byId(l, "r-u-a")!.min).toBeGreaterThanOrEqual(l[0].min + 5);
    }
    expect(byId(itemsFor(s.schedule, day("stream-gym"), TODAY), "r-u-a")?.min).toBe(at(9, 35));
  });
  it("clamps at 07:59", () => {
    const s = std();
    s.schedule.care!.push(custom({ item: ["night"], off: 240 }));
    expect(byId(itemsFor(s.schedule, day("work"), TODAY), "r-u-a")?.min).toBe(LAST);
  });
  it("hosted rows keep id, time, ring, kind and CORE status; the sleep cue changes only when pm hosts", () => {
    const plain = normalize({});
    const s = std();
    for (const t of ["stream-gym", "work", "balanced"]) {
      const a = itemsFor(plain.schedule, day(t), TODAY), b = itemsFor(s.schedule, day(t), TODAY);
      const n0 = byId(a, "night")!, n1 = byId(b, "night")!;
      expect({ min: n1.min, ring: n1.ring, kind: n1.kind, remind: n1.remind, cue: n1.cue, dur: n1.dur }).toEqual({ min: n0.min, ring: n0.ring, kind: n0.kind, remind: n0.remind, cue: n0.cue, dur: n0.dur });
      expect(n1.routine).toBe("pm");
      expect(n1.sub).toBeUndefined();
      expect(byId(b, "sleep")?.cue).toBe("หลังกิจวัตรก่อนนอน");
      expect(byId(a, "sleep")?.cue).toBe("หลังเขียน journal");
      expect(n1.min).toBeLessThan(byId(b, "sleep")!.min);
    }
    const p0 = byId(itemsFor(plain.schedule, day("stream-gym"), TODAY), "stream-prep")!, p1 = byId(itemsFor(s.schedule, day("stream-gym"), TODAY), "stream-prep")!;
    expect({ ...p1, title: p0.title, sub: p0.sub, routine: undefined }).toEqual({ ...p0, routine: undefined });
    s.schedule.care!.find((r) => r.id === "pm")!.on = false;
    const off = itemsFor(s.schedule, day("stream-gym"), TODAY);
    expect(byId(off, "night")?.routine).toBeUndefined();
    expect(byId(off, "sleep")?.cue).toBe("หลังเขียน journal");
  });
  it("prep is hosted only on days with a stream-prep item", () => {
    expect(byId(itemsFor(std().schedule, day("balanced"), TODAY), "stream-prep")).toBeUndefined();
    expect(itemsFor(std().schedule, day("balanced"), TODAY).some((i) => i.routine === "prep")).toBe(false);
  });
  it("shows a disabled routine with {all} as defaultOff, and never otherwise", () => {
    const s = std();
    s.schedule.care!.find((r) => r.id === "am")!.on = false;
    expect(byId(buildDay("stream-gym", undefined, s.schedule, 0), "r-am")).toBeUndefined();
    expect(byId(buildDay("stream-gym", undefined, s.schedule, 0, { all: true }), "r-am")).toMatchObject({ defaultOff: true });
    s.schedule.care!.find((r) => r.id === "pm")!.on = false;
    expect(byId(buildDay("stream-gym", undefined, s.schedule, 0, { all: true }), "night")?.routine).toBeUndefined();
  });
  it("skips a routine without an on + required + daily step", () => {
    const s = std();
    s.schedule.care!.push({ ...custom({ at: at(12) }), steps: [{ id: "x", title: "ทำ", tag: "mind", opt: true }, { id: "y", title: "ทำ", tag: "mind", cad: "w:1" }] });
    expect(byId(itemsFor(s.schedule, day("stream-gym"), TODAY), "r-u-a")).toBeUndefined();
  });
  it("uses ring habit, the step minutes as length, and no cue for {at} rows", () => {
    const s = std();
    s.schedule.care!.push(custom({ at: at(12) }));
    const l = itemsFor(s.schedule, day("stream-gym"), TODAY);
    for (const i of l.filter((x) => x.kind === "care")) expect(i.ring).toBe("habit");
    expect(byId(l, "r-am")?.dur).toBe(4); // cl 2 + br 2 (std)
    expect(byId(l, "r-u-a")).toMatchObject({ dur: 10 });
    expect(byId(l, "r-u-a")?.cue).toBeUndefined();
  });
  it("normalize({}) builds identical days for every template", () => {
    const s = normalize({});
    const bare = { ...s.schedule, care: undefined };
    for (const t of TEMPLATES) for (const m of [undefined, "A", "B", "C"] as const) {
      expect(buildDay(t.id, m, s.schedule, 0, { date: TODAY })).toEqual(buildDay(t.id, m, bare, 0, { date: TODAY }));
      expect(buildDay(t.id, m, s.schedule, 0, { all: true })).toEqual(buildDay(t.id, m, bare, 0, { all: true }));
    }
  });
});

// v1.8 term core: sanitizeTerm, term days, class rows and the class-quiet helpers.
import { describe, expect, it } from "vitest";
import { at } from "../date";
import { mergeStates, normalize, type Term } from "../model";
import { itemsFor, type Item } from "../schedule";
import { classItems, classNow, classRuns, classesOn, clsSpan, dowOf, goOf, inClass, newClsId, quietAt, sanitizeTerm, termOn } from "../term";

const MON = "2026-11-02", TUE = "2026-11-03";
const C = (id: string, d: number, s: number, e: number, t = "วิชา " + id, r?: string) => ({ id, d, s, e, t, ...(r ? { r } : {}) });
const term = (over: Partial<Term> = {}): Term => ({ start: MON, end: "2027-03-05", cls: [], ...over });

describe("sanitizeTerm", () => {
  it("rejects bad shapes and dates", () => {
    for (const v of [null, 1, "x", [], {}, { start: MON }, { start: "2026-13-01", end: "2027-01-01", cls: [] }, { start: "2026-02-30", end: "2026-03-30" }])
      expect(sanitizeTerm(v)).toBeNull();
    expect(sanitizeTerm({ start: MON, end: "2026-11-01" })).toBeNull();
    expect(sanitizeTerm({ start: MON, end: "2027-12-31" })).toBeNull(); // > 400 days
    expect(sanitizeTerm({ start: MON, end: MON })).toEqual({ start: MON, end: MON, cls: [] });
  });
  it("keeps valid classes, drops the rest, sorts by weekday and start", () => {
    const t = sanitizeTerm({ start: MON, end: "2027-03-05", cls: [
      C("b", 3, 600, 690), C("a", 1, 780, 870, "  แคลคูลัส 1  ", " 301 "), C("a", 2, 600, 660), C("c", 1, 540, 600),
      C("BAD", 1, 600, 660), C("d", 7, 600, 660), C("e", 1, 601, 660), C("f", 1, 470, 540), C("g", 1, 1400, 1440),
      C("h", 1, 600, 610), C("i", 1, 600, 1205), C("j", 1, 600, 660, "   "), C("k", 1, 600, 660, "x".repeat(50), "   "), C("l", 1.5, 600, 660),
    ] })!;
    expect(t.cls.map((c) => c.id)).toEqual(["c", "k", "a", "b"]);
    expect(t.cls.find((c) => c.id === "a")).toEqual({ id: "a", d: 1, s: 780, e: 870, t: "แคลคูลัส 1", r: "301" });
    expect(t.cls.find((c) => c.id === "k")!.t).toHaveLength(40);
    expect(t.cls.find((c) => c.id === "k")!.r).toBeUndefined();
  });
  it("caps classes at 30 and off dates at 40; omits empty off; validates go", () => {
    const cls = Array.from({ length: 35 }, (_, i) => C("c" + i, i % 7, 480 + 60 * Math.floor(i / 7), 480 + 60 * Math.floor(i / 7) + 50));
    const off = Array.from({ length: 45 }, (_, i) => `2026-12-${String((i % 31) + 1).padStart(2, "0")}`);
    const t = sanitizeTerm({ start: MON, end: "2027-03-05", cls, off: [...off, "nope", "2027-01-05", "2027-01-01"], go: 45 })!;
    expect(t.cls).toHaveLength(30);
    expect(t.off).toHaveLength(33);
    expect([...t.off!]).toEqual([...t.off!].sort());
    expect(t.go).toBe(45);
    for (const go of [-5, 121, 7, "30", 2.5]) expect(sanitizeTerm({ start: MON, end: MON, go })!.go).toBeUndefined();
    expect(sanitizeTerm({ start: MON, end: MON, off: [] })!.off).toBeUndefined();
    const big = sanitizeTerm({ start: "2026-11-01", end: "2027-11-30", off: Array.from({ length: 50 }, (_, i) => `2027-0${1 + (i % 9)}-${String(1 + Math.floor(i / 9)).padStart(2, "0")}`) })!;
    expect(big.off).toHaveLength(40);
  });
});

describe("term days and classes", () => {
  const t = term({ cls: [C("b", 1, 780, 870), C("a", 1, 540, 660, "ฟิสิกส์", "201"), C("c", 2, 600, 660)], off: ["2026-11-09"] });
  it("termOn covers start..end except off dates", () => {
    expect([termOn(t, "2026-11-01"), termOn(t, MON), termOn(t, "2027-03-05"), termOn(t, "2027-03-06"), termOn(t, "2026-11-09"), termOn(null, MON)])
      .toEqual([false, true, true, false, false, false]);
  });
  it("classesOn gives that weekday sorted by start, [] off term", () => {
    expect(dowOf(MON)).toBe(1);
    expect(classesOn(t, MON).map((c) => c.id)).toEqual(["a", "b"]);
    expect(classesOn(t, TUE).map((c) => c.id)).toEqual(["c"]);
    expect(classesOn(t, "2026-11-09")).toEqual([]);
    expect(classesOn(t, "2026-10-26")).toEqual([]);
  });
  it("classItems are info rows", () => {
    expect(classItems(t, MON)[0]).toEqual({ id: "cls-a", min: 540, dur: 120, title: "ฟิสิกส์", sub: "ห้อง 201", kind: "class", remind: false });
    expect(classItems(t, MON)[1].sub).toBeUndefined();
    expect(clsSpan({ s: 540, e: 660 })).toBe("09:00-11:00");
    expect([goOf(null), goOf(term({ go: 0 })), goOf(term({ go: 45 }))]).toEqual([30, 0, 45]);
  });
  it("itemsFor adds cls-* rows only on term days and is unchanged without a term", () => {
    const s = normalize({});
    const day = { type: "stream-gym" };
    const plain = itemsFor(s.schedule, day, MON);
    s.schedule.term = t;
    const got = itemsFor(s.schedule, day, MON);
    expect(got.filter((i) => i.kind === "class").map((i) => i.id)).toEqual(["cls-a", "cls-b"]);
    expect(got.filter((i) => i.kind !== "class")).toEqual(plain);
    expect(got.map((i) => i.min)).toEqual([...got.map((i) => i.min)].sort((a, b) => a - b));
    expect(itemsFor(s.schedule, day, "2026-11-09")).toEqual(itemsFor({ ...s.schedule, term: null }, day, "2026-11-09"));
    expect(itemsFor(s.schedule, day)).toEqual(itemsFor({ ...s.schedule, term: null }, day));
    // template rows first at an equal minute
    s.schedule.term = term({ cls: [C("z", 1, 600, 660)] });
    const l = itemsFor(s.schedule, day, MON), k = l.findIndex((i) => i.id === "cls-z");
    expect(l[k - 1].min).toBe(600);
    expect(l.some((i) => i.ring && i.id === "cls-z")).toBe(false);
  });
});

describe("class runs and quiet", () => {
  const I = (id: string, min: number, dur: number): Item => ({ id, min, dur, title: id, kind: "class" });
  const items: Item[] = [I("a", at(9), 60), I("b", at(10, 30), 60), I("c", at(13), 60), I("d", at(14), 60), { id: "x", min: at(9, 30), title: "x", kind: "meal", ring: "food" }];
  it("classRuns groups gaps of 30 min or less", () => {
    expect(classRuns(items).map((r) => [r.start, r.end, r.items.map((i) => i.id)])).toEqual([[at(9), at(11, 30), ["a", "b"]], [at(13), at(15), ["c", "d"]]]);
    expect(classRuns([I("a", at(9), 60), I("b", at(10, 31), 30)])).toHaveLength(2);
  });
  it("classNow and inClass are end-exclusive", () => {
    expect(classNow(items, at(9, 59))?.end).toBe(at(10));
    expect(classNow(items, at(10))).toBeNull();
    expect([inClass(items, at(8, 59)), inClass(items, at(9)), inClass(items, at(11, 30))]).toEqual([false, true, false]);
  });
  it("quietAt chains back-to-back classes", () => {
    expect(quietAt(items, at(13, 30))).toBe(at(15));
    expect(quietAt(items, at(9, 15))).toBe(at(10));
    expect(quietAt(items, at(12))).toBe(at(12));
  });
  it("newClsId is unique in the term", () => {
    const now = 1_790_000_000_000, a = newClsId(null, now);
    expect(a).toMatch(/^[a-z0-9]{1,8}$/);
    expect(newClsId(term({ cls: [C(a, 1, 600, 660)] }), now)).not.toBe(a);
  });
});

describe("normalize and merge", () => {
  it("normalize sets term null or a sanitized copy", () => {
    expect(normalize({}).schedule.term).toBeNull();
    expect(normalize({ schedule: { shiftMin: 0, overrides: {}, custom: [], term: { start: "bad" } as unknown as Term } }).schedule.term).toBeNull();
    const n = normalize({ schedule: { shiftMin: 0, overrides: {}, custom: [], term: term({ cls: [C("a", 1, 600, 660), C("a", 2, 600, 660)] }) } });
    expect(n.schedule.term?.cls).toHaveLength(1);
  });
  it("mergeStates keeps the newer schedule.term", () => {
    const old = normalize({}), neu = normalize({});
    old.schedule.term = term({ cls: [C("a", 1, 600, 660)] });
    neu.schedule.term = term({ cls: [C("b", 2, 600, 660)] });
    expect(mergeStates(neu, old).schedule.term?.cls[0].id).toBe("b");
    neu.schedule.term = null;
    expect(mergeStates(neu, old).schedule.term).toBeNull();
  });
});

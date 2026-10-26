import { describe, expect, it } from "vitest";
import { normalize } from "../model";
import { addMonths, bpHigh, checkNext, patchDay, shopList, tasksOverdue2x, useBy, useByChip } from "../care/body";
import { cafCutoff, cafNote, cafTotal, logCaf } from "../care/track";
import type { Check, Product } from "../care/types";

const T = "2026-10-27";
const p = (o: Partial<Product>): Product => ({ id: "p1", name: "มอยส์", cat: "face", ...o });

describe("shelf", () => {
  it("addMonths clamps to the month's last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-27", 3)).toBe("2027-01-27");
    expect(addMonths("2026-10-27", 24)).toBe("2028-10-27");
  });
  it("useBy is the earlier of opened + PAO and the expiry", () => {
    expect(useBy(p({ opened: "2026-09-01", pao: 6 }))).toBe("2027-03-01");
    expect(useBy(p({ opened: "2026-09-01", pao: 12, exp: "2027-01-15" }))).toBe("2027-01-15");
    expect(useBy(p({ exp: "2027-01-15" }))).toBe("2027-01-15");
    expect(useBy(p({ opened: "2026-09-01" }))).toBeNull();
  });
  it("useByChip warns within 30 days and on expiry, with SPF copy", () => {
    expect(useByChip(p({ exp: "2027-01-15" }), T)).toEqual({ text: "ใช้ได้ถึง 15 ม.ค.", warn: false });
    expect(useByChip(p({ exp: "2026-11-26" }), T)).toEqual({ text: "ใช้ได้ถึง 26 พ.ย.", warn: true });
    expect(useByChip(p({ exp: "2026-11-27" }), T)?.warn).toBe(false);
    expect(useByChip(p({ exp: "2026-10-26" }), T)).toEqual({ text: "หมดอายุ", warn: true });
    expect(useByChip(p({ name: "กันแดด SPF50", exp: "2026-10-26" }), T)).toEqual({ text: "หมดอายุ · กันแดดหมดอายุอย่าใช้", warn: true });
    expect(useByChip(p({ exp: "2026-10-26", done: "2026-10-20" }), T)).toBeNull();
    expect(useByChip(p({}), T)).toBeNull();
  });
  it("shopList has low items and items within 14 days of use-by", () => {
    const s = normalize({});
    s.care.shelf = [p({ id: "a", low: true }), p({ id: "b", exp: "2026-11-10" }), p({ id: "c", exp: "2026-11-11" }), p({ id: "d", low: true, done: T })];
    expect(shopList(s.care, T).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("patchDay counts days 1-7 of an active test", () => {
    expect(patchDay(p({ patch: { start: T } }), T)).toBe(1);
    expect(patchDay(p({ patch: { start: "2026-10-21" } }), T)).toBe(7);
    expect(patchDay(p({ patch: { start: "2026-10-20" } }), T)).toBeNull();
    expect(patchDay(p({ patch: { start: T, res: "ok" } }), T)).toBeNull();
    expect(patchDay(p({}), T)).toBeNull();
  });
});

describe("health checks", () => {
  const c = (o: Partial<Check>): Check => ({ id: "dent", name: "ทำฟัน", everyM: 6, ...o });
  it("checkNext: symptoms-only, never done, due and not yet due", () => {
    expect(checkNext(c({ everyM: 0 }), T)).toMatchObject({ due: false, label: "เมื่อมีอาการ" });
    expect(checkNext(c({}), T).due).toBe(true);
    expect(checkNext(c({ last: "2026-04-27" }), T)).toMatchObject({ due: true, next: "2026-10-27" });
    expect(checkNext(c({ last: "2026-05-01" }), T)).toMatchObject({ due: false, next: "2026-11-01" });
  });
  it("bpHigh needs the latest readings on 2 different dates at 135/85 or more", () => {
    const bp = (r: [number, number, string][]) => bpHigh(c({ id: "bp", bp: r }));
    expect(bp([[140, 80, "2026-10-20"], [136, 80, "2026-10-21"]])).toBe(true);
    expect(bp([[120, 86, "2026-10-20"], [130, 85, "2026-10-21"]])).toBe(true);
    expect(bp([[140, 90, "2026-10-21"], [140, 90, "2026-10-21"]])).toBe(false); // same day
    expect(bp([[132, 82, "2026-10-20"], [132, 82, "2026-10-21"]])).toBe(false);
    expect(bp([[140, 90, "2026-10-19"], [140, 90, "2026-10-20"], [120, 70, "2026-10-21"]])).toBe(false); // latest is normal
    expect(bpHigh(undefined)).toBe(false);
  });
  it("tasksOverdue2x lists tasks at twice their interval", () => {
    const s = normalize({});
    s.care.tasks = [{ id: "a", title: "a", tag: "body", every: 7, on: true }, { id: "b", title: "b", tag: "body", every: 7, on: true }, { id: "c", title: "c", tag: "body", every: 7, on: true }, { id: "d", title: "d", tag: "body", every: 7, on: false }];
    s.care.last = { a: "2026-10-13", b: "2026-10-14", d: "2026-01-01" };
    expect(tasksOverdue2x(s, T).map((t) => t.id)).toEqual(["a"]);
    s.care.snooze["t:a"] = T; // postponed today
    expect(tasksOverdue2x(s, T)).toEqual([]);
  });
});

describe("caffeine", () => {
  const mg = { c: 100, t: 40, e: 80, p: 200 };
  it("totals and cutoffs", () => {
    expect(cafTotal({ type: "x", done: {}, waterMl: 0, caf: { c: 2, e: 1, p: 1 } }, mg)).toBe(480);
    expect(cafTotal(undefined, mg)).toBe(0);
    expect(cafCutoff(1530)).toEqual({ coffee: 990, pre: 750 }); // sleep 01:30 -> 16:30 / 12:30
  });
  it("counts late only for coffee/tea/energy past the cutoff; notes are neutral except 400 mg", () => {
    const s = normalize({});
    logCaf(s, T, "c", 900, 1530);
    logCaf(s, T, "p", 1000, 1530);
    expect(s.days[T].caf).toEqual({ c: 1, p: 1, pl: 1 });
    expect(cafNote(s.days[T], mg, 1000, 1530)).toEqual({ over: false, late: false, preLate: true });
    logCaf(s, T, "e", 1000, 1530);
    expect(s.days[T].caf).toEqual({ c: 1, p: 1, pl: 1, e: 1, late: 1 });
    logCaf(s, T, "t", 1000, 1530);
    expect(cafNote(s.days[T], mg, 1000, 1530)).toEqual({ over: true, late: true, preLate: true });
  });
  it("an early pre-workout never shows the late info line later in the day", () => {
    const s = normalize({});
    logCaf(s, T, "p", 600, 1530);
    expect(cafNote(s.days[T], mg, 1000, 1530).preLate).toBe(false);
  });
});

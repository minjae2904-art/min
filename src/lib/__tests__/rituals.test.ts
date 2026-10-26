import { describe, expect, it } from "vitest";
import { moveItem } from "../actions";
import { applyLevel, tickStep } from "../care/progress";
import { addDays, at } from "../date";
import { dayFor, normalize, type State } from "../model";
import { itemsFor, type Item } from "../schedule";
import { planEpoch } from "../ticks";
import {
  applyFix, carryItem, mergeUiBlob, nightOn, nightUntil, overcommit, planLines, ritualNow, shutdownList, themeColor, tomorrowFirst, undoCarry,
} from "../rituals";

const D = "2026-10-27"; // Tuesday
const T = addDays(D, 1);
const mk = (type = "stream-gym", tmr: string | null = "stream-gym"): State => {
  const s = normalize({});
  s.days[D] = { type, done: {}, waterMl: 0 };
  if (tmr) s.days[T] = { type: tmr, done: {}, waterMl: 0 };
  return s;
};
const item = (s: State, id: string, date = D): Item => itemsFor(s.schedule, dayFor(s, date), date).find((i) => i.id === id)!;

describe("overcommit", () => {
  it("is null on a normal stream-gym day", () => {
    expect(overcommit(mk(), D, at(10))).toBeNull();
  });
  it("a +90 today shift flags short sleep as a neutral info line; season days get no shift fix", () => {
    const s = mk();
    s.days[D].shiftMin = 90;
    const o = overcommit(s, D, at(10))!;
    expect(o).toMatchObject({ overBy: 0, sleepH: 6.5 });
    expect(o.info).toBe("ตามตารางวันนี้นอนได้ราว 6.5 ชม.");
    expect(o.fixes).toEqual([]);
  });
  it("offers only the unshift fix on a non-season day with overBy 0 and sleep under 7 h", () => {
    const s = mk("balanced", "balanced");
    s.days[D].shiftMin = 90;
    const o = overcommit(s, D, at(14))!;
    expect(o.overBy).toBe(0);
    expect(o.sleepH).toBe(6.5);
    expect(o.fixes).toEqual([{ k: "unshift", label: "คืนตารางตามแผน (ยกเลิกเลื่อน +90 น.)", gain: 90 }]);
    applyFix(s, D, o.fixes[0]);
    expect(s.days[D].shiftMin).toBeUndefined();
    expect(overcommit(s, D, at(14))).toBeNull();
  });
  it("a moved-late item gives unmove and skip with gains bounded by end - cutoff; items ending before the cutoff get none", () => {
    const s = mk();
    moveItem(s, D, item(s, "sing"), at(0, 50)); // ends 01:15, cutoff 01:00
    const o = overcommit(s, D, at(10))!;
    expect(o.overBy).toBe(15);
    expect(o.bed).toBe(at(1, 45));
    expect(o.info).toBeNull();
    expect(o.fixes.map((f) => [f.k, f.id, f.gain])).toEqual([["unmove", "sing", 15], ["skip", "sing", 15]]);
    expect(o.fixes[0].label).toBe("คืนเวลาเดิม ร้องเพลง (สั้น) 10:45");
    expect(o.fixes[1].label).toBe("ข้าม ร้องเพลง (สั้น) วันนี้ (+15 น.)");
    applyFix(s, D, o.fixes[0]);
    expect(s.days[D].moved).toBeUndefined();
    expect(overcommit(s, D, at(10))).toBeNull();
  });
  it("never offers to skip CORE, stream or done items; shows a hint when no fix is left", () => {
    const s = mk();
    moveItem(s, D, item(s, "meal3"), at(1)); // CORE: unmove only
    const o = overcommit(s, D, at(10))!;
    expect(o.fixes.map((f) => f.k)).toEqual(["unmove"]);
    s.days[D].done.meal3 = Date.now();
    expect(overcommit(s, D, at(10))).toBeNull();
    const u = mk();
    u.schedule.overrides["stream-gym:meal3"] = { min: at(1, 10) }; // planned late, CORE, not moved
    const h = overcommit(u, D, at(10))!;
    expect(h.overBy).toBe(40); // 01:10 + 30 min meal - 01:00
    expect(h.fixes).toEqual([]);
    expect(h.hint).toBe("ลองปิดไลฟ์ตรง 00:30 แล้วเข้านอน 01:30");
  });
  it("skip fix applies skipItem", () => {
    const s = mk();
    moveItem(s, D, item(s, "sing"), at(0, 50));
    const f = overcommit(s, D, at(10))!.fixes.find((x) => x.k === "skip")!;
    applyFix(s, D, f);
    expect(s.days[D].skip?.sing).toBeGreaterThan(0);
  });
  it("early wake (weigh before 08:00) wraps sleep length correctly", () => {
    const s = mk();
    s.schedule.shiftMin = -120; // wake 07:30 (450), sleep 23:30
    expect(item(s, "weigh").min).toBe(450);
    expect(overcommit(s, D, at(8))).toBeNull();
    moveItem(s, D, item(s, "sing"), 1400); // ends 23:45, cutoff 23:00
    const o = overcommit(s, D, at(8))!;
    expect(o.overBy).toBe(45);
    expect(o.wakeTmr).toBe(450);
    expect(o.sleepH).toBeCloseTo(7.25);
  });
  it("returns null without a sleep item", () => {
    const s = mk();
    s.schedule.overrides["stream-gym:sleep"] = { enabled: false };
    expect(overcommit(s, D, at(10))).toBeNull();
  });
});

describe("planLines / tomorrowFirst / ritualNow", () => {
  it("lists wake/sleep, gym, live, trade, singing and the item count", () => {
    const l = planLines(mk(), D);
    expect(l[0]).toBe("ตื่น 09:30 · นอน 01:30");
    expect(l.find((x) => x.startsWith("ยิม "))).toMatch(/^ยิม D1 \S.* 16:00$/);
    expect(l).toContain("ไลฟ์ 19:00-00:30 (5.5 ชม.)");
    expect(l).toContain("เทรด London 15:00");
    expect(l).toContain("ร้องเพลง 25 น.");
    expect(l[l.length - 1]).toMatch(/^\d+ รายการ$/);
  });
  it("tomorrow line: template, wake, first item, next gym code, live start", () => {
    const s = mk();
    s.workouts.push({ date: D, code: "D1" });
    const t = tomorrowFirst(s, D);
    expect(t).toMatchObject({ tpl: "ไลฟ์ + ยิม", wake: "09:30", gym: "D2", live: "19:00" });
    expect(t.first?.id).toBe("posture");
    expect(tomorrowFirst(mk("stream-gym", "stream-rest"), D).gym).toBeNull();
  });
  it("plan window from wake to wake + 4 h until planAt; shutdown window sleep - 90 .. sleep + 60", () => {
    const s = mk();
    expect(ritualNow(s, D, at(9))).toBeNull();
    expect(ritualNow(s, D, at(9, 30))).toBe("plan");
    expect(ritualNow(s, D, at(13, 29))).toBe("plan");
    expect(ritualNow(s, D, at(13, 30))).toBeNull();
    s.days[D].wakeAt = 1;
    expect(ritualNow(s, D, at(9))).toBe("plan");
    s.days[D].planAt = 1;
    expect(ritualNow(s, D, at(10))).toBeNull();
    expect(ritualNow(s, D, at(23, 59))).toBeNull();
    expect(ritualNow(s, D, at(0))).toBe("shut");
    expect(ritualNow(s, D, at(2, 29))).toBe("shut");
    expect(ritualNow(s, D, at(2, 30))).toBeNull();
    s.days[D].shutAt = 1;
    expect(ritualNow(s, D, at(0, 30))).toBeNull();
  });
});

describe("shutdownList", () => {
  it("lists past undone ring rows only, without sleep, night, presleep, stream, stream-prep or future rows", () => {
    const s = mk();
    const ids = shutdownList(s, D, at(20)).map((r) => r.item.id);
    expect(ids).toContain("sing");
    expect(ids).toContain("meal3");
    for (const x of ["stream", "stream-prep", "snack", "presleep", "night", "sleep", "caf"]) expect(ids).not.toContain(x);
    const late = shutdownList(s, D, at(1, 45)).map((r) => r.item.id);
    for (const x of ["stream", "stream-prep", "presleep", "night", "sleep"]) expect(late).not.toContain(x);
    expect(late).toContain("snack");
    s.days[D].done.sing = 1;
    s.days[D].skip = { clips: 1 };
    const after = shutdownList(s, D, at(20)).map((r) => r.item.id);
    expect(after).not.toContain("sing");
    expect(after).not.toContain("clips");
  });
  it("CORE rows are done-only, routine rows done + skip, others done / carry / skip", () => {
    const s = mk();
    applyLevel(s, "std", D);
    const rows = shutdownList(s, D, at(20));
    const acts = (id: string) => rows.find((r) => r.item.id === id)?.acts;
    expect(acts("gym")).toEqual(["done"]);
    expect(acts("meal1")).toEqual(["done"]);
    expect(acts("r-am")).toEqual(["done", "skip"]);
    expect(acts("r-gym")).toEqual(["done", "skip"]);
    expect(acts("sing")).toEqual(["done", "carry", "skip"]);
    expect(rows.some((r) => r.item.id === "night" || r.item.id === "stream-prep")).toBe(false); // hosted pm / prep rows
  });
});

describe("shutdown jr tick", () => {
  it("promote-only tick keeps an already-done hosted night row done", () => {
    const s = mk();
    applyLevel(s, "std", D);
    const d = dayFor(s, D); d.done.night = 1; s.days[D] = d;
    tickStep(s, D, "pm", "jr", true, true);
    expect(s.days[D].done.night).toBeTruthy();
    expect(s.days[D].care?.pm).toContain("jr");
    tickStep(s, D, "pm", "jr", true);
    expect(s.days[D].done.night).toBeFalsy(); // a plain tick still syncs the row to its required steps
  });
});

describe("carryItem", () => {
  const NOW = 1_800_000_000_000;
  it("refuses CORE, routine and non-reschedulable rows", () => {
    const s = mk("stream-gym", "stream-rest");
    applyLevel(s, "std", D);
    const before = JSON.stringify(s);
    expect(carryItem(s, D, item(s, "gym"), NOW)).toBe("refused");
    expect(carryItem(s, D, item(s, "r-am"), NOW)).toBe("refused");
    expect(carryItem(s, D, item(s, "weigh"), NOW)).toBe("refused");
    expect(carryItem(s, D, item(s, "stream"), NOW)).toBe("refused");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("an id tomorrow already has: skip today only and 'exists'", () => {
    const s = mk("stream-gym", "stream-gym");
    expect(carryItem(s, D, item(s, "sing"), NOW)).toBe("exists");
    expect(s.days[D].skip?.sing).toBeGreaterThan(0);
    expect(s.days[D].reschedAt).toBe(NOW);
    expect(s.days[T].carry).toBeUndefined();
  });
  it("'carried' writes [tpl, planMin ?? min], skipWhy na and both reschedAt values", () => {
    const s = mk("stream-gym", "stream-rest");
    expect(carryItem(s, D, item(s, "sing"), NOW)).toBe("carried");
    expect(s.days[D].skip?.sing).toBeGreaterThan(0);
    expect(s.days[D].skipWhy?.sing).toBe("na");
    expect(s.days[D].reschedAt).toBe(NOW);
    expect(s.days[T].carry).toEqual({ sing: ["stream-gym", at(10, 45)] });
    expect(s.days[T].reschedAt).toBe(NOW);
    const c = item(s, "sing", T);
    expect(c).toMatchObject({ min: at(10, 45), carried: true });
    expect(itemsFor(s.schedule, s.days[T], T).filter((i) => i.id === "sing")).toHaveLength(1);
    const m = mk("stream-gym", "stream-rest");
    moveItem(m, D, item(m, "snack2"), at(23));
    expect(carryItem(m, D, item(m, "snack2"), NOW)).toBe("carried");
    expect(m.days[T].carry?.snack2).toEqual(["stream-gym", at(15, 40)]);
  });
  it("creates tomorrow's log when missing; undo drops the carry, bumps both clocks and un-skips today", () => {
    const s = mk("stream-gym", null);
    s.settings.weekPlan = ["stream-rest", "stream-rest", "stream-rest", "stream-rest", "stream-rest", "stream-rest", "stream-rest"];
    const it = item(s, "sing");
    expect(carryItem(s, D, it, NOW)).toBe("carried");
    expect(s.days[T]?.type).toBe("stream-rest");
    undoCarry(s, D, it, NOW + 5);
    expect(s.days[T].carry).toBeUndefined();
    expect(s.days[T].reschedAt).toBe(NOW + 5);
    expect(s.days[D].reschedAt).toBe(NOW + 5);
    expect(s.days[D].skip).toBeUndefined();
    expect(s.days[D].skipWhy).toBeUndefined();
  });
  it("caps tomorrow's carry at 3 entries", () => {
    const s = mk("stream-gym", "stream-rest");
    s.days[T].carry = { a: ["stream-gym", 600], b: ["stream-gym", 600], c: ["stream-gym", 600] };
    expect(carryItem(s, D, item(s, "sing"), NOW)).toBe("refused");
    expect(s.days[D].skip).toBeUndefined();
    expect(Object.keys(s.days[T].carry!)).toHaveLength(3);
  });
  it("a carried item clamps inside 08:00-07:59 and never duplicates", () => {
    const s = mk("stream-gym", "stream-rest");
    s.days[T].carry = { sing: ["stream-gym", 99999] };
    const l = itemsFor(s.schedule, s.days[T], T).filter((i) => i.id === "sing");
    expect(l).toHaveLength(1);
    expect(l[0].min).toBe(at(7, 59));
  });
});

describe("Night theme", () => {
  const ms = (min: number) => planEpoch(D, min);
  const on = (s: State, min: number) => nightOn(s, D, min, ms(min));
  it("follows wind-down, sleep, live and the pre-wake tail", () => {
    const s = mk();
    expect(on(s, at(12))).toBe(false);
    expect(on(s, at(20))).toBe(true); // live block
    expect(on(s, at(0, 45))).toBe(true); // wind-down after stream-end
    expect(on(s, at(2))).toBe(true); // sleep
    expect(on(s, at(9))).toBe(true); // before wake
    s.days[D].wakeAt = ms(at(8, 50));
    expect(on(s, at(9))).toBe(false); // woke up already
  });
  it("Live mode and a finished shutdown turn it on until the next wake", () => {
    const s = mk();
    s.run = { k: "live", date: D, at: ms(at(12)), b: 60, slot: 0, ok: 0, seen: 0, br: 0 };
    expect(on(s, at(12))).toBe(true);
    s.run = { ...s.run, k: "sing" };
    expect(on(s, at(12))).toBe(false);
    s.run = null;
    s.days[D].wakeAt = ms(at(9, 30));
    s.days[D].shutAt = ms(at(23));
    expect(on(s, at(23, 5))).toBe(true);
  });
  it("a stale live run (yesterday or 12 h+) does not keep the day dark", () => {
    const s = mk();
    s.run = { k: "live", date: addDays(D, -1), at: planEpoch(addDays(D, -1), at(19)), b: 60, slot: 0, ok: 0, seen: 0, br: 0 };
    expect(on(s, at(13))).toBe(false);
    s.run = { ...s.run, date: D, at: ms(at(9, 30)) };
    expect(on(s, at(13))).toBe(true);
    expect(nightOn(s, D, at(21, 45), ms(at(21, 45)) + 0)).toBe(true); // live block anyway
    expect(nightOn(s, D, at(13), ms(at(9, 30)) + 13 * 3600_000)).toBe(false); // 13 h after the start, outside night phases
  });
  it("is off with the setting off or a forced light theme", () => {
    const s = mk();
    s.settings.night = false;
    expect(on(s, at(20))).toBe(false);
    s.settings.night = true;
    s.settings.theme = "light";
    expect(on(s, at(20))).toBe(false);
    s.settings.theme = "dark";
    expect(on(s, at(20))).toBe(true);
  });
  it("nightUntil is the next planned wake", () => {
    const s = mk();
    expect(nightUntil(s, D, ms(at(9)))).toBe(ms(at(9, 30)));
    expect(nightUntil(s, D, ms(at(20)))).toBe(planEpoch(T, at(9, 30)));
  });
  it("themeColor: night is black, else the Gate formula", () => {
    expect(themeColor("auto", false, true)).toBe("#000000");
    expect(themeColor("light", false, true)).toBe("#000000");
    expect(themeColor("auto", false, false)).toBe("#f2f2f7");
    expect(themeColor("auto", true, false)).toBe("#000000");
    expect(themeColor("dark", false, false)).toBe("#000000");
    expect(themeColor("light", true, false)).toBe("#f2f2f7");
  });
  it("mergeUiBlob keeps every key through both writers and survives bad JSON", () => {
    let raw: string | null = null;
    raw = mergeUiBlob(raw, { theme: "dark", motion: "off", accent: "green", fs: "xl" });
    raw = mergeUiBlob(raw, { nu: 123 });
    raw = mergeUiBlob(raw, { theme: "auto", motion: "", accent: "green", fs: "xl" });
    expect(JSON.parse(raw)).toEqual({ theme: "auto", motion: "", accent: "green", fs: "xl", nu: 123 });
    raw = mergeUiBlob(raw, { nu: 0 });
    expect(JSON.parse(raw)).toMatchObject({ theme: "auto", accent: "green", fs: "xl", nu: 0 });
    expect(JSON.parse(mergeUiBlob("{bad", { nu: 5 }))).toEqual({ nu: 5 });
    expect(JSON.parse(mergeUiBlob("[1]", { nu: 5 }))).toEqual({ nu: 5 });
    expect(JSON.parse(mergeUiBlob("null", { theme: "dark" }))).toEqual({ theme: "dark" });
  });
});

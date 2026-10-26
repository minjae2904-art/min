// v1.8 term clashes: detection, tap-only fixes, apply and undo.
import { describe, expect, it } from "vitest";
import { applyTermFix, classWindowsFor, EARLY_NOTE, isTermWeek, overlapCount, snapFix, termClashes, undoFix, weekClashes, weekFix } from "../clash";
import { at } from "../date";
import { normalize, type Cls, type State } from "../model";
import { itemsFor } from "../schedule";
import { WEEK_PRESETS } from "../templates";

const MON = "2026-11-02", TUE = "2026-11-03", SUN = "2026-11-01";
const STREAM = WEEK_PRESETS[3].days, TERM = WEEK_PRESETS[4].days;
const C = (id: string, d: number, s: number, e: number, t = "วิชา" + id): Cls => ({ id, d, s, e, t });
function mk(cls: Cls[], o: { week?: string[]; day?: string; go?: number } = {}): State {
  const s = normalize({});
  s.schedule.term = { start: "2026-11-01", end: "2027-03-05", cls, ...(o.go !== undefined ? { go: o.go } : {}) };
  s.settings.weekPlan = [...(o.week ?? STREAM)];
  if (o.day) s.days[MON] = { type: o.day, done: {}, waterMl: 0 };
  return s;
}
const ids = (l: ReturnType<typeof termClashes>, kind = "overlap") => l.filter((c) => c.kind === kind).map((c) => c.item?.id);

describe("overlap clashes", () => {
  it("stream-gym Monday, class 10:00-12:00: meal1, sing, clips; tpl fix term-gym, move, week", () => {
    const s = mk([C("a", 1, at(10), at(12))], { day: "stream-gym" });
    const l = termClashes(s, MON, { today: true });
    expect(ids(l)).toEqual(["meal1", "sing", "clips"]);
    const m1 = l.find((c) => c.item?.id === "meal1")!;
    expect(m1.text).toBe("วิชาa 10:00-12:00 ชนกับ มื้อหลัก 1 10:00");
    expect(m1.fixes.map((f) => f.k)).toEqual(["tpl", "move", "week"]);
    expect(m1.fixes[0]).toMatchObject({ tpl: "term-gym", label: 'ใช้แผน "เรียน + ยิม + ไลฟ์" วันนี้' });
    expect(m1.fixes[1]).toMatchObject({ id: "meal1", to: at(12, 15), label: "ย้าย มื้อหลัก 1 ไป 12:15" });
    expect(m1.fixable).toBe(true);
    // not today: template and week fixes only
    expect(termClashes(s, MON).find((c) => c.item?.id === "meal1")!.fixes.map((f) => f.k)).toEqual(["tpl", "week"]);
    expect(overlapCount(s, MON)).toBe(3);
    expect(overlapCount(s, MON, "term-gym")).toBe(0);
  });
  it("class 18:00-20:00 on stream-gym hits meal3, prep and the live block; term-gym would not help", () => {
    const s = mk([C("a", 1, at(18), at(20))], { day: "stream-gym" });
    const l = termClashes(s, MON, { today: true });
    expect(ids(l)).toEqual(["meal3", "stream-prep", "stream"]);
    expect(l.flatMap((c) => c.fixes).some((f) => f.k === "tpl")).toBe(false);
    const st = l.find((c) => c.item?.id === "stream")!;
    expect(st.fixes.map((f) => f.k)).toEqual(["week"]);
    // already on the term week: the live clash has no fix, a hint, and never raises the notice
    s.settings.weekPlan = [...TERM];
    const st2 = termClashes(s, MON, { today: true }).find((c) => c.item?.id === "stream")!;
    expect(st2.fixable).toBe(false);
    expect(st2.hint).toBe("ลองไลฟ์หลังเลิกเรียน หรือใช้แผนช่วงเปิดเทอม");
  });
  it("class 16:00-18:00 on balanced: the gym moves to the nearest valid slot", () => {
    const s = mk([C("a", 1, at(16), at(18))], { day: "balanced" });
    const gym = termClashes(s, MON, { today: true }).find((c) => c.item?.id === "gym")!;
    expect(gym.fixes.find((f) => f.k === "move")).toMatchObject({ to: at(18, 15) });
  });
  it("class 16:00-18:00 on term-gym (busy morning): no gym slot, term-live swap and the gym hint", () => {
    const s = mk([C("a", 1, at(16), at(18)), C("b", 1, at(8, 30), at(15, 50))], { day: "term-gym" });
    const gym = termClashes(s, MON, { today: true }).find((c) => c.item?.id === "gym")!;
    expect(gym.fixes.some((f) => f.k === "move")).toBe(false);
    expect(gym.fixes[0]).toMatchObject({ k: "tpl", tpl: "term-live" });
    expect(gym.hint).toBe("ย้ายยิมไปวันที่ไม่มีเรียนบ่าย");
    const mcCheck = termClashes(s, MON, { today: true }).find((c) => c.item?.id === "mc-check")!;
    expect(mcCheck.fixes.some((f) => f.k === "skip" && f.label === "ข้าม เช็กเซิฟ 10 นาที วันนี้")).toBe(true);
  });
  it("done items do not clash; a swap that drops a done item is not offered", () => {
    const s = mk([C("a", 1, at(10), at(12))], { day: "stream-gym" });
    s.days[MON].done.meal1 = 1;
    expect(ids(termClashes(s, MON, { today: true }))).toEqual(["sing", "clips"]);
    s.days[MON].done.clips = 1; // term-gym has no clips row
    expect(termClashes(s, MON, { today: true }).flatMap((c) => c.fixes).some((f) => f.k === "tpl")).toBe(false);
  });
});

describe("early and sleep clashes", () => {
  it("early class on a non-season day with an existing day shift: the shift fix is additive", () => {
    const s = mk([C("a", 1, at(14), at(15))], { day: "balanced" });
    s.days[MON].shiftMin = 30;
    const e = termClashes(s, MON, { today: true }).find((c) => c.kind === "early")!;
    expect(e.text).toBe("วิชาa เริ่ม 14:00 แต่ตามแผนจะถึงราว 14:50");
    const f = e.fixes.find((x) => x.k === "shift")!;
    expect(f).toMatchObject({ by: -60, label: "ตื่นเร็วขึ้น 60 นาทีวันนี้ (ทั้งวันเลื่อนตาม)" });
    applyTermFix(s, MON, f);
    expect(s.days[MON].shiftMin).toBe(-30);
    expect(termClashes(s, MON, { today: true }).some((c) => c.kind === "early")).toBe(false);
  });
  it("no shift below 08:00: hint instead", () => {
    const s = mk([C("a", 1, at(9), at(10))], { day: "balanced" });
    const e = termClashes(s, MON, { today: true }).find((c) => c.kind === "early")!;
    expect(e.fixes.some((f) => f.k === "shift")).toBe(false);
    expect(e.hint).toBe(EARLY_NOTE);
  });
  it("early class on a term day: no fix, not fixable, EARLY_NOTE", () => {
    const s = mk([C("a", 1, at(9), at(10))], { day: "term-gym" });
    const l = termClashes(s, MON, { today: true });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "early", fixes: [], fixable: false, hint: EARLY_NOTE });
  });
  it("term preset weeknight with an 08:00 class tomorrow: no sleep clash", () => {
    const s = mk([C("a", 2, at(8), at(10))], { week: TERM });
    expect(termClashes(s, MON, { today: true }).some((c) => c.kind === "sleep")).toBe(false);
  });
  it("stream-gym night before an 08:00 class: sleep clash with the term-gym and week fixes and a bedtime hint", () => {
    const s = mk([C("a", 2, at(8), at(10))]);
    const c = termClashes(s, MON, { today: true }).find((x) => x.kind === "sleep")!;
    expect(c.text).toBe("พรุ่งนี้เรียน 08:00 · ตามแผนนอน 01:30 จะนอนได้ไม่ถึง 7 ชม.");
    expect(c.fixes.map((f) => [f.k, f.tpl])).toEqual([["tpl", "term-gym"], ["week", undefined]]);
    expect(c.hint).toBe("คืนนี้ลองเข้านอนก่อน 00:30");
    expect(weekFix(s)).toEqual({ k: "week", label: "ใช้แผนสัปดาห์ช่วงเปิดเทอม" });
  });
  it("no bedtime hint when it would fall inside live", () => {
    const s = mk([C("a", 2, at(8), at(10))], { go: 60 });
    expect(termClashes(s, MON, { today: true }).find((x) => x.kind === "sleep")!.hint).toBeUndefined();
  });
  it("no clashes without a term or outside it", () => {
    const s = mk([C("a", 1, at(10), at(12))], { day: "stream-gym" });
    expect(termClashes({ ...s, schedule: { ...s.schedule, term: null } }, MON, { today: true })).toEqual([]);
    s.schedule.term!.off = [MON];
    expect(termClashes(s, MON, { today: true })).toEqual([]);
  });
});

describe("apply and undo", () => {
  it("move, tpl and week restore through undoFix and bump reschedAt", () => {
    const s = mk([C("a", 1, at(10), at(12))], { day: "stream-gym" });
    const l = termClashes(s, MON, { today: true });
    const snap = snapFix(s, MON);
    applyTermFix(s, MON, l[0].fixes.find((f) => f.k === "move")!);
    expect(s.days[MON].moved).toEqual({ meal1: at(12, 15) });
    applyTermFix(s, MON, l[0].fixes.find((f) => f.k === "tpl")!);
    applyTermFix(s, MON, l[0].fixes.find((f) => f.k === "week")!);
    expect(s.days[MON].type).toBe("term-gym");
    expect(isTermWeek(s)).toBe(true);
    undoFix(s, snap, 123);
    expect(s.days[MON].type).toBe("stream-gym");
    expect(s.days[MON].moved).toBeUndefined();
    expect(s.days[MON].reschedAt).toBe(123);
    expect(s.settings.weekPlan).toEqual(STREAM);
    expect(s.settings.planAsked).toBe(false);
  });
  it("skip and shift restore; an unlogged day gets its planned type back", () => {
    const s = mk([C("a", 1, at(16), at(18)), C("b", 1, at(8, 30), at(15, 50))], { week: TERM });
    const snap = snapFix(s, MON);
    const sk = termClashes(s, MON, { today: true }).find((c) => c.item?.id === "mc-check")!.fixes.find((f) => f.k === "skip")!;
    applyTermFix(s, MON, sk);
    applyTermFix(s, MON, { k: "tpl", tpl: "term-live", label: "" });
    applyTermFix(s, MON, { k: "shift", by: -15, label: "" });
    expect([s.days[MON].skip?.["mc-check"] !== undefined, s.days[MON].type, s.days[MON].shiftMin]).toEqual([true, "term-live", -15]);
    undoFix(s, snap, 5);
    expect(s.days[MON]).toMatchObject({ type: "term-gym", reschedAt: 5 });
    expect(s.days[MON].skip).toBeUndefined();
    expect(s.days[MON].shiftMin).toBeUndefined();
    expect(itemsFor(s.schedule, s.days[MON], MON).some((i) => i.id === "mc-check")).toBe(true);
  });
  it("undo without reschedule changes leaves reschedAt alone", () => {
    const s = mk([], { day: "stream-gym" });
    const snap = snapFix(s, MON);
    applyTermFix(s, MON, { k: "tpl", tpl: "term-gym", label: "" });
    undoFix(s, snap, 9);
    expect(s.days[MON].reschedAt).toBeUndefined();
  });
});

describe("week view and windows", () => {
  it("weekClashes counts clashes and fixable ones per date", () => {
    const s = mk([C("a", 1, at(10), at(12)), C("b", 3, at(9), at(10))]);
    s.days[SUN] = { type: "stream-rest", done: {}, waterMl: 0 };
    const w = weekClashes(s, SUN, 7, SUN);
    expect(w.map((r) => r.date)[1]).toBe(MON);
    expect(w[1]).toMatchObject({ tpl: "stream-gym", classes: 1, span: "10:00-12:00", clashes: 4, fixable: 4 });
    expect(w[2]).toMatchObject({ classes: 0, span: "", clashes: 0, fixable: 0 });
    expect(w[3]).toMatchObject({ tpl: "stream-mc", classes: 1 });
    expect(w[3].clashes).toBeGreaterThan(0);
  });
  it("classWindowsFor lists class windows of days using that template", () => {
    const s = mk([C("a", 1, at(10), at(12)), C("b", 2, at(14), at(15)), C("c", 3, at(9), at(10)), C("d", 4, at(10), at(12))]);
    expect(classWindowsFor(s, "stream-gym", SUN)).toEqual([[at(10), at(12)], [at(14), at(15)]]);
    expect(classWindowsFor(s, "stream-mc", SUN)).toEqual([[at(9), at(10)]]);
    expect(classWindowsFor(s, "balanced", SUN)).toEqual([]);
  });
  it("isTermWeek and weekFix", () => {
    const s = mk([C("a", 1, at(10), at(12))], { week: TERM });
    expect([isTermWeek(s), weekFix(s)]).toEqual([true, null]);
    expect(weekFix(mk([]))).toBeNull();
    expect(TUE).toBe("2026-11-03");
  });
});

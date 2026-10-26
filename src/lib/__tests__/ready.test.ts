// v1.8 morning readiness: parts, weights, visibility, tips with apply/undo.
import { describe, expect, it } from "vitest";
import { addDays, at } from "../date";
import { normalize, type State } from "../model";
import { READY_LABEL, applyReadyTip, readyOf, readyWindow, snapReady, undoReady } from "../ready";
import { WEEK_PRESETS } from "../templates";
import { compileAction } from "../brain/actions";
import { build, dowOf, tsAt, type DayOpt } from "./brain-fixtures";

const TUE = "2026-11-10", MON = "2026-11-09";
const TERM = WEEK_PRESETS[4].days;
const H = 3_600_000;
const ready = (s: State, today = TUE) => readyOf(s, today);

// A plan-adherent term week ending on Tuesday: 7.5 h nights, bed on plan, check-in 3/3; today awake (no bedtime yet).
function termWeek(o: (date: string, i: number) => DayOpt = () => ({}), n = 8) {
  return build(n, (date, i) => ({ tpl: TERM[dowOf(date)], sleepH: 7.5, checkin: [3, 3, 3], ...(i === n - 1 ? { bedLate: null, untick: ["gym"] } : {}), ...o(date, i) }), { today: TUE });
}
// One night only: yesterday's bedtime on plan (term-gym 00:30), today's wake after h hours, an optional check-in.
function oneNight(h: number, e?: number, m?: number, type = "term-gym", lateBed = 0): State {
  const s = normalize({});
  const sleepAt = tsAt(MON, at(0, 30) + lateBed);
  s.days[MON] = { type, done: {}, waterMl: 0, sleepAt };
  s.days[TUE] = { type, done: {}, waterMl: 0, wakeAt: sleepAt + h * H, ...(e ? { checkin: { energy: e, mood: m ?? e, sleep: 3 } } : {}) };
  return s;
}

describe("readyOf parts and score", () => {
  it("renormalizes weights over the present parts and lists the missing ones", () => {
    const r = ready(oneNight(7.5, 1, 1));
    expect(r.parts.map((p) => [p.k, p.score])).toEqual([["sleep", 100], ["reg", null], ["bed", 100], ["load", null], ["voice", null], ["mood", 0]]);
    expect(r.score).toBe(70); // (30 * 100 + 15 * 100 + 20 * 0) / 65 = 69.2
    expect(r.level).toBe("mid");
    expect(r.missing).toEqual([READY_LABEL.reg, READY_LABEL.load, READY_LABEL.voice]);
    expect(r.parts[0].text).toBe("นอนราว 7.5 ชม.");
    expect(r.parts[5].text).toBe("พลังงาน 1/5 อารมณ์ 1/5");
  });
  it("level thresholds", () => {
    expect(ready(oneNight(7.5, 5, 5))).toMatchObject({ score: 100, level: "high" });
    expect(ready(oneNight(5, 1, 1, "term-gym", 120))).toMatchObject({ score: 0, level: "low" });
    expect(ready(oneNight(6.25, 3, 3))).toMatchObject({ level: "mid" }); // 50, 100, 67
  });
  it("bed part: on plan, late, very late", () => {
    expect(ready(oneNight(7.5, 3, 3, "term-gym", 10)).parts[2]).toMatchObject({ score: 100, text: "เข้านอนตรงแผน" });
    expect(ready(oneNight(7.5, 3, 3, "term-gym", 70)).parts[2]).toMatchObject({ score: 48, text: "ช้ากว่าแผนราว 75 นาที" });
    expect(ready(oneNight(7.5, 3, 3, "term-gym", 150)).parts[2].score).toBe(0);
  });
  it("load: two lifting days in a row cost nothing, a third does; soreness and a volume spike", () => {
    const s = oneNight(7.5, 3, 3);
    s.workouts.push({ date: MON, code: "D1" }, { date: addDays(MON, -1), code: "D2" });
    expect(ready(s).parts[3]).toMatchObject({ score: 100, text: "ร่างกายพร้อม" });
    s.workouts.push({ date: addDays(MON, -2), code: "D3" });
    expect(ready(s).parts[3]).toMatchObject({ score: 80, text: "ยก 3 วันติด" });
    s.days[TUE].sore = 2;
    expect(ready(s).parts[3]).toMatchObject({ score: 30, text: "ยก 3 วันติด · เมื่อยมาก" });
    const v = oneNight(7.5, 3, 3);
    v.days[TUE].sore = 0;
    for (let i = 6; i >= 2; i--) v.gym.log.push({ d: addDays(MON, -i), c: "D1", at: 1, min: 60, x: [["bp", "60x8,60x8"]] });
    v.gym.log.push({ d: MON, c: "D2", at: 1, min: 60, x: [["bp", "80x8,80x8"]] });
    expect(ready(v).parts[3]).toMatchObject({ score: 85, text: "เมื่อวานยกหนักกว่าปกติ" });
  });
  it("voice: yesterday's live recap, strain chip or today's voice symptom", () => {
    const s = oneNight(7.5, 3, 3);
    s.days[MON].live = { min: 300, n: 1, at: 1, end: 2, ok: 0, seen: 0, br: 0, v: 2 };
    expect(ready(s).parts[4]).toMatchObject({ score: 20, text: "เสียงล้า" });
    s.days[MON].live.v = 0;
    expect(ready(s).parts[4]).toMatchObject({ score: 100, text: "เสียงปกติ" });
    s.days[MON].sing = { strain: true };
    expect(ready(s).parts[4]).toMatchObject({ score: 60, text: "แหบนิดหน่อย" });
    s.days[TUE].sym = ["voice"];
    expect(ready(s).parts[4].score).toBe(20);
  });
});

describe("readyOf visibility", () => {
  it("hidden without 5 nights in 14 days", () => {
    const r = ready(termWeek(() => ({}), 4)); // 3 nights
    expect(r.show).toBe(false);
    expect(r.need).toBe("ต้องมีเวลานอนอีก 2 คืน (กดเข้านอน/ตื่นแล้ว)");
  });
  it("hidden with sleep-only inputs until a check-in or soreness chip", () => {
    const s = build(8, (_d, i) => ({ tpl: "term-rest", sleepH: 7.5, checkin: null, ...(i === 7 ? { bedLate: null } : {}) }), { today: TUE });
    expect(ready(s)).toMatchObject({ show: false, need: "เช็กอินตอนเช้าเพื่อดูความพร้อม" });
    s.days[TUE].sore = 0;
    expect(ready(s)).toMatchObject({ show: true, need: null });
  });
  it("hidden without last night's sleep, when asleep, or with the setting off", () => {
    const s = termWeek();
    expect(ready(s).show).toBe(true);
    delete s.days[TUE].wakeAt;
    expect(ready(s)).toMatchObject({ show: false, need: "ยังไม่มีเวลานอนเมื่อคืน" });
    const z = termWeek();
    z.days[TUE].sleepAt = z.days[TUE].wakeAt! + 16 * H;
    expect(ready(z).show).toBe(false);
    const off = termWeek();
    off.settings.ready = false;
    expect(ready(off)).toMatchObject({ show: false, need: null });
  });
  it("a plan-adherent term-gym week scores high", () => {
    const r = ready(termWeek());
    expect(r.show).toBe(true);
    expect(r.level).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
  it("readyWindow runs from wake to 5 h after the planned wake", () => {
    const s = termWeek();
    expect(readyWindow(s, TUE, at(7, 59))).toBe(false);
    expect(readyWindow(s, TUE, at(8))).toBe(true);
    expect(readyWindow(s, TUE, at(13))).toBe(true);
    expect(readyWindow(s, TUE, at(13, 1))).toBe(false);
  });
  it("a wake before 08:00 filed on its own new day (wakeTarget) reads as early morning", () => {
    const s = termWeek();
    s.days[TUE].wakeAt = tsAt(MON, at(7, 50)); // Tue 07:50, stored on Tue
    expect(readyWindow(s, TUE, at(8))).toBe(true);
    expect(readyWindow(s, TUE, at(8, 30))).toBe(true);
    expect(readyWindow(s, TUE, at(7))).toBe(false); // Wed 07:00 is outside Tue's window
    const reg = ready(s).parts[1];
    expect(reg.score).toBeGreaterThan(0);
    expect(reg.text).not.toMatch(/[0-9]{3}/); // no "ราว ±645 นาที"
    const b = oneNight(8, 5, 5, "balanced"); // planned wake 13:00
    b.days[MON].sleepAt = tsAt(MON, at(0));
    b.days[TUE].wakeAt = tsAt(MON, at(7)); // early, not late: no shift tip
    b.days[TUE].done.gym = 1;
    expect(ready(b).tip).toBeNull();
  });
});

describe("tips", () => {
  const tired = () => { const s = oneNight(5, 1, 1, "term-gym", 120); s.days[MON].live = { min: 300, n: 1, at: 1, end: 2, ok: 0, seen: 0, br: 0, v: 2 }; return s; };
  it("priority: voice, then rest, then light, then go", () => {
    const s = tired();
    expect(ready(s).tip).toMatchObject({ k: "voice", act: "พักเสียงวันนี้" });
    s.days[TUE].voiceRest = true;
    expect(ready(s).tip).toMatchObject({ k: "rest", tpl: "term-rest", act: 'ใช้แผน "พักฟื้น + ไลฟ์ชิล (ก่อนวันเรียน)" วันนี้' });
    const mid = oneNight(7.5, 1, 1, "term-gym", 120); // (3000 + 0 + 0) / 65 = 46
    expect(ready(mid)).toMatchObject({ score: 45 });
    expect(ready(mid).tip).toMatchObject({ k: "light", act: "เล่นเบาวันนี้" });
    expect(ready(oneNight(7.5, 5, 5)).tip).toMatchObject({ k: "go", act: null });
    const done = oneNight(7.5, 5, 5);
    done.days[TUE].done.gym = 1;
    expect(ready(done).tip).toBeNull();
  });
  it("rest tip on a class day passes the class-clash gate and prefers the in-term no-gym swap", () => {
    const withClass = (s: number, e: number) => { const x = tired(); x.days[TUE].voiceRest = true; x.schedule.term = { start: "2026-11-02", end: "2027-03-05", cls: [{ id: "a", d: 2, s, e, t: "Calc" }] }; return x; };
    for (const [s0, e0] of [[at(9), at(12)], [at(13), at(16)]]) {
      const x = withClass(s0, e0);
      const tip = ready(x).tip;
      expect(tip?.tpl).not.toBe("term-rest");
      if (tip?.k === "rest") expect(compileAction(x, { k: "set_day_template", date: TUE, tpl: tip.tpl! }, TUE, "brief").ok).toBe(true);
    }
    expect(ready(withClass(at(9), at(12))).tip).toMatchObject({ k: "rest", tpl: "term-live" });
    const none = tired(); none.days[TUE].voiceRest = true; // no term: unchanged
    expect(ready(none).tip).toMatchObject({ k: "rest", tpl: "term-rest" });
  });
  it("light never overwrites a 7-day deload slot; a past 1-day entry is fine", () => {
    const s = oneNight(7.5, 1, 1, "term-gym", 120);
    s.brain.deload = { from: addDays(TUE, -2), to: addDays(TUE, 4) };
    expect(ready(s).tip?.k).not.toBe("light");
    s.brain.deload = { from: addDays(TUE, -20), to: addDays(TUE, -14) };
    expect(ready(s).tip?.k).not.toBe("light");
    s.brain.deload = { from: MON, to: MON };
    expect(ready(s).tip?.k).toBe("light");
  });
  it("shift only on non-season templates without a shift", () => {
    const s = oneNight(8, 5, 5, "balanced"); // planned wake 13:00
    s.days[TUE].wakeAt = tsAt(TUE, at(14));
    s.days[MON].sleepAt = tsAt(MON, at(5));
    s.days[TUE].done.gym = 1;
    expect(ready(s).tip).toMatchObject({ k: "shift", by: 60, act: "เลื่อน +60 นาที" });
    s.days[TUE].shiftMin = 30;
    expect(ready(s).tip).toBeNull();
    const t = oneNight(9, 5, 5); // term-gym, woke 09:30 vs 08:00 plan
    t.days[TUE].done.gym = 1;
    expect(ready(t).tip).toBeNull();
  });
  it("apply + undo per tip", () => {
    const run = (s: State) => {
      const tip = ready(s).tip!;
      const snap = snapReady(s, TUE), before = structuredClone({ day: s.days[TUE], deload: s.brain.deload });
      applyReadyTip(s, TUE, tip);
      const after = structuredClone({ day: s.days[TUE], deload: s.brain.deload });
      undoReady(s, TUE, snap);
      expect({ day: s.days[TUE], deload: s.brain.deload }).toEqual(before);
      return after;
    };
    expect(run(tired()).day.voiceRest).toBe(true);
    const r = tired(); r.days[TUE].voiceRest = true;
    expect(run(r).day.type).toBe("term-rest");
    expect(run(oneNight(7.5, 1, 1, "term-gym", 120)).deload).toEqual({ from: TUE, to: TUE });
    const sh = oneNight(8, 5, 5, "balanced");
    sh.days[TUE].wakeAt = tsAt(TUE, at(14)); sh.days[MON].sleepAt = tsAt(MON, at(5)); sh.days[TUE].done.gym = 1;
    expect(run(sh).day.shiftMin).toBe(60);
  });
  it("undo keeps ticks logged after the tip and falls back to the planned type", () => {
    const s = tired();
    delete s.days[TUE].checkin;
    const snap = { ...snapReady(s, TUE), day: null };
    applyReadyTip(s, TUE, { k: "rest", text: "", act: "", tpl: "term-rest" });
    s.days[TUE].done.weigh = 5;
    undoReady(s, TUE, snap);
    expect(s.days[TUE].type).toBe(s.settings.weekPlan[2] ?? "work");
    expect(s.days[TUE].done.weigh).toBe(5);
  });
});

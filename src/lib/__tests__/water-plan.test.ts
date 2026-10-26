import { describe, expect, it } from "vitest";
import { normalize, type DayLog, type State } from "../model";
import { applyLevel } from "../care/progress";
import { waterGoal, waterPlan } from "../stats";

const D = "2026-10-27";
const day = (type: string, o: Partial<DayLog> = {}): DayLog => ({ type, done: {}, waterMl: 0, ...o });
const on = (): State => { const s = normalize({}); applyLevel(s, "std", D); return s; };

describe("waterPlan", () => {
  it("matches the stream-season examples at 67 kg", () => {
    const s = on();
    expect(waterGoal(s, day("stream-gym"), 67)).toBe(3650);
    expect(waterGoal(s, day("stream-gym", { hot: 1.76e12 }), 67)).toBe(4150);
    expect(waterGoal(s, day("stream-mc"), 67)).toBe(3600);
    expect(waterGoal(s, day("stream-rest"), 67)).toBe(3050);
    expect(waterGoal(s, day("stream-marathon"), 67)).toBe(3550);
  });
  it("lists the parts with Thai labels", () => {
    const p = waterPlan(on(), day("stream-gym", { hot: 1 }), 67);
    expect(p.parts.map((x) => [x.k, x.ml])).toEqual([["base", 2345], ["gym", 625], ["live", 688], ["hot", 500]]);
    expect(p.parts.map((x) => x.label)).toEqual(["ฐาน (35 ml/กก.)", "ยิม 75 นาที", "ไลฟ์ 5.5 ชม. (ค่าประมาณ ปิดได้)", "วันร้อน/กลางแจ้ง"]);
    expect(p).toMatchObject({ fixed: false, capped: false });
  });
  it("caps at 4.5 L", () => {
    expect(waterPlan(on(), day("stream-gym", { hot: 1 }), 85)).toMatchObject({ goal: 4500, capped: true });
  });
  it("a fixed goal wins and keeps the parts", () => {
    const s = on();
    s.settings.waterGoalMl = 3000;
    const p = waterPlan(s, day("stream-gym"), 67);
    expect(p).toMatchObject({ goal: 3000, fixed: true });
    expect(p.parts.length).toBe(3);
  });
  it("live hours can be switched off", () => {
    const s = on();
    s.care.water.live = false;
    expect(waterGoal(s, day("stream-gym"), 67)).toBe(2950);
  });
  it("counts cardio when planned on a non-rest template, and on rest only when ticked", () => {
    const s = on();
    expect(waterPlan(s, day("stream-mc"), 67).parts.some((x) => x.k === "cardio")).toBe(true);
    expect(waterPlan(s, day("stream-rest"), 67).parts.some((x) => x.k === "cardio")).toBe(false);
    expect(waterGoal(s, day("stream-rest", { done: { cardio: 1 } }), 67)).toBe(3600);
    s.schedule.templates = [{ id: "u-a", name: "พักของฉัน", from: "stream-rest" }];
    expect(waterGoal(s, day("u-a"), 67)).toBe(3050);
  });
  it("keeps the legacy rule while the level is null or the plan is off", () => {
    const plain = normalize({});
    const s = on();
    s.care.water.plan = false;
    for (const t of ["stream-gym", "stream-rest", "work", "off", "balanced", "rest"]) for (const o of [{}, { done: { cardio: 1 } }, { hot: 1 }]) {
      const legacy = waterGoal(plain, day(t, o), 67);
      expect(waterGoal(s, day(t, o), 67)).toBe(legacy);
      expect(waterPlan(plain, day(t, o), 67)).toEqual({ goal: legacy, parts: [], fixed: false, capped: false });
    }
    expect(waterGoal(plain, day("stream-gym"), 67)).toBe(2950); // 67 x 35 + 1.25 h x 500, rounded
    plain.settings.waterGoalMl = 2500;
    expect(waterGoal(plain, day("stream-gym"), 67)).toBe(2500);
  });
});

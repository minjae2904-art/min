import "./tz";
import { describe, expect, it } from "vitest";
import type { State } from "../model";
import { blockEnd, itemsFor } from "../schedule";
import { applyLevel } from "../care/progress";
import { compileVariant } from "../brain/actions";
import { scoreAreas } from "../brain/areas";
import { ITEM_LABEL, itemLabel } from "../brain/copy";
import { brainReport } from "../brain/report";
import { extractDays } from "../brain/signals";
import { isBrainAction } from "../brain/state";
import type { AreaKey } from "../brain/types";
import { build, TODAY, tsAt } from "./brain-fixtures";

const area = (s: State, k: AreaKey) => scoreAreas(extractDays(s, TODAY, 28), s, TODAY).find((a) => a.key === k)!;
const ruleIds = (s: State, mode: "brief" | "weekly") => brainReport(s, TODAY, mode).candidates.map((c) => c.rule);
const withCare = (s: State) => { applyLevel(s, "std", "2026-09-01"); };

describe("recovery care part", () => {
  it("is null and leaves recovery unchanged without care rows", () => {
    const r = area(build(35), "recovery");
    expect(r.parts.care).toBeNull();
    expect(r.ev.carePlanned).toBe(0);
    expect(r.score).toBe(100);
  });
  it("is weighted .15 when care rows are planned", () => {
    const done = area(build(35, () => ({}), { extra: withCare }), "recovery");
    expect(done.parts.care).toBe(100);
    expect(done.score).toBe(100);
    const miss = area(build(35, () => ({ untick: ["r-am", "r-gym"] }), { extra: withCare }), "recovery");
    expect(miss.parts.care).toBe(0);
    expect(miss.score).toBe(Math.round(100 / 1.15));
    expect(miss.ev.carePlanned).toBeGreaterThanOrEqual(5);
  });
  it("needs 3 planned care rows", () => {
    const s = build(3, () => ({ untick: ["r-am"] }), { extra: (x) => { withCare(x); x.schedule.care!.find((r) => r.id === "gym")!.on = false; } });
    expect(area(s, "recovery").ev.carePlanned).toBe(2);
    expect(area(s, "recovery").parts.care).toBeNull();
  });
});

describe("R23 minimum self-care", () => {
  const low = () => build(14, () => ({ untick: ["r-am", "r-gym"] }), { extra: withCare });
  it("fires weekly and stays quiet in the brief", () => {
    expect(ruleIds(low(), "weekly")).toContain("R23");
    expect(ruleIds(low(), "brief")).not.toContain("R23");
    const c = brainReport(low(), TODAY, "weekly").candidates.find((x) => x.rule === "R23")!;
    expect(c.sig).toBe("R23:care");
    expect(c.area).toBe("recovery");
    expect(c.variants.map((v) => v.actions[0].k)).toEqual(["focus_step", "tip"]);
    expect(c.evalSpec).toEqual({ metric: "recovery.care", windowDays: 7, dir: 1, min: 0.15 });
  });
  it("stays quiet at 50% or more", () => {
    expect(ruleIds(build(14, () => ({ untick: ["r-gym"] }), { extra: withCare }), "weekly")).not.toContain("R23");
  });
  it("stays quiet during burnout (C11)", () => {
    const s = build(35, (_d, i) => ({ checkin: i >= 28 ? [2, 2, 3] : [4, 4, 4], untick: ["r-am", "r-gym"] }), { extra: withCare });
    const ids = ruleIds(s, "weekly");
    expect(ids).toContain("R18");
    expect(ids).not.toContain("R23");
  });
  it("R19 never names a self-care row missed twice", () => {
    const s = build(7, (_d, i) => ({ untick: i >= 4 && i <= 5 ? ["r-am"] : [] }), { extra: withCare });
    const r19 = brainReport(s, TODAY, "brief").candidates.filter((c) => c.rule === "R19");
    expect(r19.every((c) => !c.sig.startsWith("R19:r-"))).toBe(true);
    expect(r19).toHaveLength(0);
    const meal = build(7, (_d, i) => ({ untick: i >= 4 && i <= 5 ? ["r-am", "meal1"] : [] }), { extra: withCare });
    expect(brainReport(meal, TODAY, "brief").candidates.find((c) => c.rule === "R19")?.sig).toBe("R19:meal1");
  });
  it("its actions pass the whitelist", () => {
    expect(isBrainAction({ k: "focus_step", area: "recovery", ref: "care-min" })).toBe(true);
    expect(isBrainAction({ k: "tip", ref: "spf-door" })).toBe(true);
  });
});

describe("live signal and leisure", () => {
  const streamWeek = (overMin: number | null) => {
    const s = build(14, () => ({ tpl: "stream-gym" }));
    if (overMin === null) return s;
    for (const [date, d] of Object.entries(s.days)) {
      if (date >= TODAY) continue;
      const items = itemsFor(s.schedule, d, date), st = items.find((i) => i.id === "stream")!, end = blockEnd(items, st)!;
      d.live = { min: 330, n: 1, at: tsAt(date, st.min), end: tsAt(date, end + overMin), ok: 0, seen: 0, br: 0 };
    }
    return s;
  };
  it("is unchanged without live logs", () => {
    const sig = extractDays(streamWeek(null), TODAY, 14).at(-2)!;
    expect(sig.live).toEqual({ min: null, over: null });
    expect(area(streamWeek(null), "leisure").parts.contained).toBeNull();
  });
  it("fills min and over from the log", () => {
    const sig = extractDays(streamWeek(20), TODAY, 14).at(-2)!;
    expect(sig.live).toEqual({ min: 330, over: 20 });
  });
  it("treats a live close 60+ min past the plan as not contained", () => {
    expect(area(streamWeek(0), "leisure").parts.contained).toBe(100);
    expect(area(streamWeek(90), "leisure").parts.contained).toBe(0);
    expect(area(streamWeek(0), "leisure").ev.liveH).toBe(33);
  });
});

describe("voice strain clamp", () => {
  it("strainFree stays within 0..1 with 5 strain days and 2 sing days", () => {
    const s = build(14, (_d, i) => ({ tpl: "stream-gym", untick: i >= 12 ? [] : ["sing"], sing: i >= 9 ? { min: 20, strain: true } : undefined }));
    const v = area(s, "voice");
    expect(v.ev.strain).toBe(5);
    expect(v.parts.strainFree).toBe(0);
  });
});

describe("care labels and levers", () => {
  it("labels routine rows", () => {
    expect(ITEM_LABEL["r-am"]).toBe("กิจวัตรเช้า");
    expect(itemLabel(undefined, "stream-gym", "r-u-abc")).toBe("กิจวัตรที่สร้างเอง");
    expect(itemLabel(undefined, "stream-gym", "r-u-abc", { canonical: true })).toBe("กิจวัตรที่สร้างเอง");
  });
  it("set_reminder refuses a care row", () => {
    const s = build(7, () => ({ tpl: "stream-gym" }), { extra: withCare });
    const r = compileVariant(s, [{ k: "set_reminder", tpl: "stream-gym", item: "r-am", on: true }], TODAY, "brief");
    expect(r.ok).toBe(false);
  });
});

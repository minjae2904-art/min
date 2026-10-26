import "./tz";
import { describe, expect, it } from "vitest";
import { addDays, at } from "../date";
import { normalize, type DayLog, type State } from "../model";
import { itemsFor } from "../schedule";
import { rangeStats, toCsv } from "../stats";
import { applyLevel } from "../care/progress";
import { tsAt } from "./brain-fixtures";

const D = "2026-10-27";
const d1 = addDays(D, -2), d2 = addDays(D, -1);
const day = (o: Partial<DayLog> = {}): DayLog => ({ type: "stream-gym", done: {}, waterMl: 2000, ...o });

function state(): State {
  const s = normalize({});
  applyLevel(s, "full", "2026-10-01");
  s.days[d1] = day({
    done: { "r-am": tsAt(d1, at(9, 50)) }, care: { am: "cl,spf,br" }, veg: 3, caf: { c: 2, late: 1 }, hot: tsAt(d1, at(10)),
    live: { min: 300, n: 1, at: tsAt(d1, at(19)), end: tsAt(d1, at(0, 40)), ok: 3, seen: 4, br: 2 },
    trade: { count: 1, result: "win", gate: 7 },
  });
  s.days[d2] = day({
    care: { pm: "desk,br" },
    live: { min: 200, n: 2, at: tsAt(d2, at(19)), end: tsAt(d2, at(1, 10)), ok: 1, seen: 3, br: 1 },
    trade: { count: 1, result: "loss", gate: 3 },
  });
  s.gym.log = [
    { d: addDays(D, -20), c: "D4", at: 1, min: 50, x: [["ohp", "40x8"]] },
    { d: d1, c: "D1", at: tsAt(d1, at(16)), min: 60, x: [["sq", "60x8,60x8"], ["ab", "0x15"]] },
  ];
  return s;
}

describe("rangeStats v1.7 additions", () => {
  it("counts self-care rows and light trackers", () => {
    const s = state();
    const r = rangeStats(s, D, 7);
    const planned = [d1, d2].reduce((n, d) => n + itemsFor(s.schedule, s.days[d], d).filter((i) => i.kind === "care").length, 0);
    expect(r.care).toEqual({ planned, done: 1, spf: 1, veg: 3, caf: 200, cafLateDays: 1, moveMin: 5, hot: 1 });
  });
  it("sums real live sessions against the plan", () => {
    expect(rangeStats(state(), D, 7).live).toEqual({ days: 2, min: 500, planMin: 660, onTime: 1, br: 3, ok: 4, seen: 7 });
  });
  it("counts logged gym sessions and volume in range", () => {
    expect(rangeStats(state(), D, 7).gym).toEqual({ logged: 1, vol: 960 });
    expect(rangeStats(state(), D, 30).gym).toEqual({ logged: 2, vol: 1280 });
  });
  it("counts trades with the full 3-tick gate", () => {
    const r = rangeStats(state(), D, 7);
    expect(r.trade.gated).toBe(1);
    expect(r.trade.days).toBe(2);
  });
  it("stays empty for a fresh state", () => {
    const r = rangeStats(normalize({}), D, 7);
    expect(r.care).toEqual({ planned: 0, done: 0, spf: 0, veg: null, caf: null, cafLateDays: 0, moveMin: 0, hot: 0 });
    expect(r.live).toEqual({ days: 0, min: 0, planMin: 0, onTime: 0, br: 0, ok: 0, seen: 0 });
    expect(r.gym).toEqual({ logged: 0, vol: 0 });
    expect(r.trade.gated).toBe(0);
  });
  it("leaves toCsv unchanged", () => {
    const r = rangeStats(state(), D, 7);
    const rows = toCsv(r).split("\n");
    expect(rows[0]).toBe("date,type,plan,logged,completion_pct,water_ml,water_goal_ml");
    expect(rows).toHaveLength(8);
    expect(rows.every((x) => x.split(",").length === 7)).toBe(true);
    expect(rows[5].startsWith(`${d1},stream-gym,`)).toBe(true);
  });
});

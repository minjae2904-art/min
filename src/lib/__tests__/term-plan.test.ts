// v1.8 term season: templates, preset invariants, the 08:00 floor, brain and AI awareness.
process.env.TZ = "Asia/Bangkok";
import { describe, expect, it } from "vitest";
import { startTermSeason, taperOffer } from "../actions";
import { aiSummary } from "../ai-summary";
import { compileAction } from "../brain/actions";
import { buildAiContext } from "../brain/context";
import { brainReport } from "../brain/report";
import { SYSTEM_BRAIN } from "../brain/schema";
import { isRestTpl, planDays, restFor } from "../brain/signals";
import { addDays, at } from "../date";
import { normalize, type Cls, type ScheduleCfg, type State } from "../model";
import { accessoryFor } from "../phase";
import { blockEnd, buildDay, maxDayShift } from "../schedule";
import { TEMPLATES, TERM_IDS, WEEK_PRESETS } from "../templates";
import { arrangeNotices } from "../today";
import { build } from "./brain-fixtures";

const MON = "2026-11-02", SUN = "2026-11-01";
const TERM = WEEK_PRESETS[4].days;
const C = (id: string, d: number, s: number, e: number, t = "SENTINEL_CLS"): Cls => ({ id, d, s, e, t });
const cfg = (o: Partial<ScheduleCfg> = {}): ScheduleCfg => ({ shiftMin: 0, overrides: {}, custom: [], ...o });
function termState(cls: Cls[], start = "2026-11-01"): State {
  const s = normalize({});
  s.schedule.term = { start, end: "2027-03-05", cls };
  s.settings.weekPlan = [...TERM];
  return s;
}

describe("term preset", () => {
  it("is appended at index 4", () => {
    expect([WEEK_PRESETS[3].id, WEEK_PRESETS[4].id, WEEK_PRESETS.length]).toEqual(["stream", "term", 5]);
    expect(TERM).toEqual(["term-rest", "term-gym", "term-gym", "term-live", "term-gym", "term-gym", "stream-marathon"]);
  });
  it("keeps 7 h+ in bed every night, 5 h+ live every day and 4 gym days", () => {
    const s = termState([]);
    const p = planDays(s, MON, 7);
    for (const d of p) {
      expect(d.sleepWinH).toBeGreaterThanOrEqual(7);
      expect(d.streamMin).toBeGreaterThanOrEqual(300);
    }
    expect(p.reduce((a, d) => a + d.gym, 0)).toBe(4);
    expect(p.map((d) => d.sleepWinH)).toEqual([7.5, 7.5, 7.5, 7.5, 9, 7.5, 7.5]);
  });
  it("class-day templates: wake 08:00, live 18:45-23:45, gym ends 60 min before live, sleep 00:30", () => {
    for (const id of ["term-gym", "term-live"]) {
      const d = buildDay(id, undefined, cfg(), 0, { date: MON });
      const g = (x: string) => d.find((i) => i.id === x);
      expect([g("weigh")?.min, g("stream")?.min, blockEnd(d, g("stream")!), g("sleep")?.min]).toEqual([at(8), at(18, 45), at(23, 45), at(0, 30)]);
      if (g("gym")) expect(blockEnd(d, g("gym")!)! + 60).toBeLessThanOrEqual(g("stream")!.min);
      // nothing but the morning between 08:30 and 16:00 except lunch and the server check
      expect(d.filter((i) => i.ring && i.min > at(8, 30) && i.min < at(16)).map((i) => i.id)).toEqual(["meal2", "mc-check"]);
    }
    const r = buildDay("term-rest", undefined, cfg(), 0, { date: SUN });
    expect([r.find((i) => i.id === "weigh")?.min, r.find((i) => i.id === "sleep")?.min, r.some((i) => i.id === "trade")]).toEqual([at(9), at(0, 30), false]);
  });
});

describe("08:00 floor", () => {
  it("term templates never start before 08:00 and ignore negative shifts", () => {
    for (const id of TERM_IDS) {
      for (const sh of [-120, -60]) {
        for (const d of [buildDay(id, undefined, cfg({ shiftMin: sh })), buildDay(id, undefined, cfg(), sh)])
          expect(d.filter((i) => i.ring).every((i) => i.min >= 480)).toBe(true);
      }
      if (id === "term-rest") continue; // wakes 09:00, so up to -60 is a real shift
      expect(buildDay(id, undefined, cfg(), -60)).toEqual(buildDay(id, undefined, cfg()));
      expect(buildDay(id, undefined, cfg({ shiftMin: -120 }))).toEqual(buildDay(id, undefined, cfg()));
    }
    // term-rest wakes 09:00: a -90 shift moves it only to 08:00
    expect(buildDay("term-rest", undefined, cfg(), -90).find((i) => i.id === "weigh")?.min).toBe(480);
    expect(buildDay("term-rest", undefined, cfg(), -30).find((i) => i.id === "weigh")?.min).toBe(510);
  });
  it("an absolute override keeps its set minute under a negative global shift", () => {
    const o = cfg({ shiftMin: -60, overrides: { "term-gym:gym": { min: at(15) } } });
    const d = buildDay("term-gym", undefined, o, 0, { date: MON });
    expect(d.find((i) => i.id === "gym")?.min).toBe(at(15));
    expect(d.find((i) => i.id === "trade")?.min).toBe(at(16));
    expect(buildDay("term-gym", undefined, cfg({ overrides: { "term-gym:gym": { min: at(15) } } }), 0, { date: MON }).find((i) => i.id === "gym")?.min).toBe(at(15));
  });
  it("term templates have 449 min of day shift (sleep 00:30)", () => {
    for (const id of TERM_IDS) expect(maxDayShift(id, undefined, cfg())).toBe(449);
  });
  it("other templates keep their v1.7 pre-08:00 behaviour", () => {
    expect(buildDay("stream-gym", undefined, cfg({ shiftMin: -120 })).find((i) => i.id === "weigh")?.min).toBe(450);
    expect(TEMPLATES.filter((t) => TERM_IDS.has(t.id)).map((t) => t.season)).toEqual(["stream", "stream", "stream"]);
  });
});

describe("season levers", () => {
  it("taperOffer reaches the term bedtime and startTermSeason applies the term week", () => {
    const s = normalize({});
    s.settings.weekPlan = [...WEEK_PRESETS[3].days];
    const o = taperOffer(s, SUN, 30, "term")!;
    expect(o).toMatchObject({ start: SUN, fromMin: 30, stepMin: 30 });
    expect(taperOffer(s, SUN)).toBeNull(); // already on the stream bedtime
    const x = structuredClone(s);
    startTermSeason(x, SUN, true);
    expect(x.settings.weekPlan).toEqual(TERM);
    expect(x.settings.planAsked).toBe(true);
    expect(x.schedule.taper).toEqual({ start: SUN, fromMin: 30, stepMin: 30 });
    startTermSeason(x, SUN, false);
    expect(x.schedule.taper).toBeNull();
  });
  it("restFor and isRestTpl know the term rest day", () => {
    const c = cfg({ templates: [{ id: "u-t", name: "x", from: "term-live" }] });
    expect([restFor(c, "term-gym"), restFor(c, "u-t"), restFor(c, "stream-gym"), restFor(c, "balanced")]).toEqual(["term-rest", "term-rest", "stream-rest", "rest"]);
    expect([isRestTpl("term-rest"), isRestTpl("term-gym")]).toEqual([true, false]);
  });
  it("planDays adds class minutes to the day and its load", () => {
    const base = planDays(termState([]), MON, 1)[0];
    const p = planDays(termState([C("a", 1, at(9), at(12))]), MON, 1)[0];
    expect([base.classMin, p.classMin]).toEqual([0, 180]);
    expect(p.load).toBeGreaterThan(base.load);
  });
});

describe("brain levers respect class times", () => {
  it("move_item into a class window is rejected", () => {
    const s = termState([C("a", 1, at(15), at(16))]);
    const r = compileAction(s, { k: "move_item", tpl: "term-gym", item: "trade", delta: -30 }, SUN, "brief");
    expect(r).toEqual({ ok: false, reason: "ชนเวลาเรียน" });
    expect(compileAction(termState([]), { k: "move_item", tpl: "term-gym", item: "trade", delta: -30 }, SUN, "brief").ok).toBe(true);
  });
  it("set_day_template and set_week_slot reject new class overlaps", () => {
    const s = termState([C("a", 1, at(10), at(12))]);
    expect(compileAction(s, { k: "set_day_template", date: MON, tpl: "stream-gym" }, SUN, "brief")).toEqual({ ok: false, reason: "ชนเวลาเรียน" });
    expect(compileAction(s, { k: "set_day_template", date: MON, tpl: "term-live" }, SUN, "brief").ok).toBe(true);
    expect(compileAction(s, { k: "set_week_slot", dow: 1, tpl: "stream-gym" }, SUN, "weekly")).toEqual({ ok: false, reason: "ชนเวลาเรียน" });
    expect(compileAction(s, { k: "set_week_slot", dow: 1, tpl: "term-live" }, SUN, "weekly").ok).toBe(true);
  });
});

describe("AI context and summary", () => {
  const TODAY = "2026-11-03"; // Tuesday, a term day
  const seeded = (term: boolean) => build(14, () => ({ tpl: "stream-gym" }), {
    today: TODAY,
    extra: (x) => { if (term) x.schedule.term = { start: "2026-11-01", end: "2027-03-05", cls: [C("a", 2, at(10), at(12)), C("b", 4, at(13), at(14), "SENTINEL_TWO")] }; },
  });
  it("plan7 carries class hours, never class titles", () => {
    const s = seeded(true);
    const ctx = buildAiContext(brainReport(s, TODAY, "brief"), s, TODAY, "brief");
    expect(ctx.plan7.map((d) => (d as { classH?: number }).classH ?? 0)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("SENTINEL");
    expect(aiSummary(s, TODAY)).not.toContain("SENTINEL");
    expect(aiSummary(s, TODAY)).toContain("ช่วงเปิดเทอม: เรียน 3 ชม./สัปดาห์ ไลฟ์ ~");
    expect(aiSummary(s, TODAY)).not.toContain("ช่วงก่อนเปิดเทอม");
  });
  it("aiSummary is unchanged off-term", () => {
    const plain = seeded(false), later = seeded(false);
    later.schedule.term = { start: "2026-12-01", end: "2027-03-05", cls: [C("a", 2, at(10), at(12))] };
    expect(aiSummary(later, TODAY)).toBe(aiSummary(plain, TODAY));
    expect(addDays(TODAY, 0)).toBe(TODAY);
  });
  it("the brain prompt knows classH and still ends with the JSON rule", () => {
    expect(SYSTEM_BRAIN).toContain("plan7[].classH");
    expect(SYSTEM_BRAIN).toContain("ไม่ใช่ streak");
    expect(SYSTEM_BRAIN.endsWith("ตอบเป็น JSON ตาม schema เท่านั้น")).toBe(true);
    expect(SYSTEM_BRAIN).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("Today surfaces", () => {
  it("accessoryFor shows a running class after the live block", () => {
    const s = termState([C("a", 1, at(9), at(11))]);
    const d = { type: "term-gym", done: {}, waterMl: 0 };
    expect(accessoryFor(s, d, MON, at(10))).toEqual({ kind: "class", label: "เรียน", left: 60, color: "var(--info)", key: "cls-a" });
    expect(accessoryFor(s, d, MON, at(11)).kind).toBe("phase");
    expect(accessoryFor(s, d, MON, at(20)).kind).toBe("live");
  });
  it("arrangeNotices puts term right after intro", () => {
    const n = (key: Parameters<typeof arrangeNotices>[0][number]["key"]) => ({ key });
    expect(arrangeNotices([n("care"), n("term"), n("intro"), n("stream")], 5).shown.map((x) => x.key)).toEqual(["stream", "intro", "term", "care"]);
    expect(arrangeNotices([n("daymsg"), n("term")], 2).shown.map((x) => x.key)).toEqual(["term"]);
  });
});

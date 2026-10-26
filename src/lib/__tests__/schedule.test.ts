import { describe, expect, it } from "vitest";
import { at, sessionDelta } from "../date";
import { normalize, type DayLog, type ScheduleCfg } from "../model";
import { anchorsFor, baseDay, blockEnd, buildDay, canReschedule, fillTimes, itemsFor, LAST as SLAST, maxDayShift, taperDone, taperShift } from "../schedule";
import { dayScore } from "../stats";
import { TEMPLATES, TERM_IDS } from "../templates";

const LAST = at(7, 59); // 1919: nothing may cross the 08:00 rollover
const cfg = (over: Partial<ScheduleCfg> = {}): ScheduleCfg => ({ shiftMin: 0, overrides: {}, custom: [], ...over });
const byId = (items: ReturnType<typeof buildDay>, id: string) => items.find((i) => i.id === id);

describe("baseDay", () => {
  it("is sorted and has the anchors", () => {
    const d = baseDay("work", "A");
    expect(d.map((i) => i.min)).toEqual([...d.map((i) => i.min)].sort((a, b) => a - b));
    expect(byId(d, "weigh")?.min).toBe(at(13));
    expect(byId(d, "work-in")?.min).toBe(at(16));
    expect(byId(d, "sleep")?.min).toBe(at(5));
  });
  it("meal2 options change the late items", () => {
    expect(byId(baseDay("work", "B"), "snack-b")?.min).toBe(at(23, 45));
    const c = baseDay("work", "C");
    expect(byId(c, "meal2")).toBeUndefined();
    expect(byId(c, "meal2c")?.min).toBe(at(2, 5));
    expect(byId(c, "supp2")).toBeUndefined();
    expect(byId(c, "gym")?.min).toBe(at(3));
  });
});

describe("buildDay", () => {
  it("without cfg equals baseDay", () => {
    expect(buildDay("off")).toEqual(baseDay("off"));
  });
  it("shifts ring items but not work start/end", () => {
    const d = buildDay("work", "A", cfg({ shiftMin: 60 }));
    expect(byId(d, "weigh")?.min).toBe(at(14));
    expect(byId(d, "work-in")?.min).toBe(at(16));
    expect(byId(d, "work-out")?.min).toBe(at(2));
  });
  it("trims a positive shift as one block so no ring item crosses 08:00", () => {
    const d = buildDay("work", "A", cfg({ shiftMin: 180 }), 240);
    const rings = d.filter((i) => i.ring);
    expect(Math.max(...rings.map((i) => i.min))).toBe(LAST);
    expect(rings.every((i) => i.min <= LAST)).toBe(true);
    expect(byId(d, "weigh")?.min).toBe(959);
    expect(byId(d, "sleep")?.min).toBe(LAST);
    expect(byId(d, "meal3")?.min).toBe(LAST - 60); // spacing kept, no burst at 07:59
  });
  it("moves overrides by the same trimmed amount, keeping their order", () => {
    const d = buildDay("work", "A", cfg({ overrides: { "work:posture": { min: at(13, 15) } } }), 240);
    expect(byId(d, "weigh")?.min).toBe(at(13) + 179);
    expect(byId(d, "posture")?.min).toBe(at(13, 15) + 179);
    expect(d.map((i) => i.id).indexOf("posture")).toBeLessThan(d.map((i) => i.id).indexOf("meal1"));
  });
  it("never trims a positive shift below 0 nor touches a zero/negative one", () => {
    const late = [{ id: "c1", title: "Late", min: LAST, ring: "habit" as const, days: "both" as const }];
    expect(byId(buildDay("work", "A", cfg({ custom: late, shiftMin: 60 })), "weigh")?.min).toBe(at(13));
    expect(byId(buildDay("work", "A", cfg({ shiftMin: -180 })), "weigh")?.min).toBe(at(10));
  });
  it("pins a custom item stored past 07:59 without dragging the day earlier or blocking a shift", () => {
    const custom = [{ id: "c1", title: "Late", min: at(7, 30) + 180, ring: "habit" as const, days: "both" as const }];
    const d = buildDay("work", "A", cfg({ custom }));
    expect(byId(d, "weigh")?.min).toBe(at(13));
    expect(byId(d, "sleep")?.min).toBe(at(5));
    expect(byId(d, "c1")?.min).toBe(LAST);
    expect(byId(buildDay("work", "A", cfg({ custom, shiftMin: 60 })), "weigh")?.min).toBe(at(14));
    expect(byId(buildDay("work", "A", cfg({ custom, shiftMin: -180 })), "c1")?.min).toBe(at(7, 30));
  });
  it("maxDayShift is the room buildDay applies untrimmed", () => {
    expect(maxDayShift("work", "A", cfg())).toBe(179);
    expect(maxDayShift("work", "C", cfg())).toBe(149);
    expect(maxDayShift("work", "A", cfg({ shiftMin: 60 }))).toBe(119);
    expect(maxDayShift("work", "A", cfg({ shiftMin: 180 }))).toBe(0);
    expect(byId(buildDay("work", "C", cfg(), 149), "weigh")?.min).toBe(at(13) + 149);
  });
  it("applies overrides: disable, retime, rename, remind", () => {
    const d = buildDay("work", "A", cfg({ overrides: { "work:posture": { enabled: false }, "work:trade": { min: at(15, 30), title: "Trade", remind: false } } }));
    expect(byId(d, "posture")).toBeUndefined();
    const trade = byId(d, "trade");
    expect(trade?.min).toBe(at(15, 30));
    expect(trade?.title).toBe("Trade");
    expect(trade?.remind).toBe(false);
    expect(byId(d, "weigh")?.remind).toBe(true);
  });
  it("adds custom items for the matching day type only", () => {
    const custom = [
      { id: "c1", title: "Stretch", min: at(14), ring: "habit" as const, days: "both" as const },
      { id: "c2", title: "Walk", min: at(17), ring: "body" as const, days: "off" as const },
    ];
    const work = buildDay("work", "A", cfg({ custom, shiftMin: 30 }));
    expect(byId(work, "c1")?.min).toBe(at(14, 30));
    expect(byId(work, "c1")?.custom).toBe(true);
    expect(byId(work, "c2")).toBeUndefined();
    expect(byId(buildDay("off", undefined, cfg({ custom })), "c2")?.min).toBe(at(17));
  });
});

describe("templates", () => {
  const CORE = ["weigh", "posture", "meal1", "supp1", "snack", "meal3", "night", "sleep"];
  for (const t of TEMPLATES) {
    for (const m of [undefined, "A", "B", "C"] as const) {
      it(`${t.id} / meal2 ${m ?? "-"} keeps the invariants`, () => {
        for (const d of [buildDay(t.id, m, cfg()), buildDay(t.id, m, cfg(), 0, { all: true })]) {
          const ids = d.map((i) => i.id);
          for (const id of CORE) expect(ids).toContain(id);
          expect(ids).toContain(t.work && m === "C" ? "meal2c" : "meal2");
          expect(d.filter((i) => i.kind === "sleep")).toHaveLength(1);
          expect(d.find((i) => i.ring)?.id).toBe("weigh");
          expect(ids.includes("gym") && ids.includes("cardio")).toBe(false);
          expect(new Set(ids).size).toBe(ids.length);
          expect(d.filter((i) => i.kind === "game").every((i) => !i.ring)).toBe(true);
          expect(d.every((i) => i.min <= LAST)).toBe(true);
        }
      });
    }
    const room = TERM_IDS.has(t.id) ? 449 : t.season ? 389 : 179; // v1.8 term templates sleep at 00:30
    it(`${t.id} has unique phase keys and ${room} min of day shift`, () => {
      const keys = (t.phases ?? []).map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(maxDayShift(t.id, undefined, cfg())).toBe(room);
    });
  }
  it("legacy work/off equal baseDay and an unknown id falls back to off", () => {
    expect(buildDay("work", "B")).toEqual(baseDay("work", "B"));
    expect(buildDay("off")).toEqual(baseDay("off"));
    expect(buildDay("nope", undefined, cfg())).toEqual(buildDay("off", undefined, cfg()));
  });
  it("sessionDelta follows New York DST", () => {
    expect(sessionDelta("2026-10-30", "ny")).toBe(0);
    expect(sessionDelta("2026-11-01", "ny")).toBe(60);
    expect(sessionDelta("2026-11-02", "ny")).toBe(60);
    expect(sessionDelta(undefined, "ny")).toBe(0);
  });
  it("balanced moves the NY-session items from 1 Nov", () => {
    const oct = buildDay("balanced", undefined, cfg(), 0, { date: "2026-10-20" });
    const nov = buildDay("balanced", undefined, cfg(), 0, { date: "2026-11-02" });
    expect([byId(oct, "trade")?.min, byId(nov, "trade")?.min]).toEqual([at(19, 15), at(20, 15)]);
    expect([byId(oct, "meal3")?.min, byId(nov, "meal3")?.min]).toEqual([at(20, 45), at(21, 45)]);
    expect([byId(oct, "game")?.min, byId(nov, "game")?.min]).toEqual([at(21, 15), at(22, 15)]);
    expect([byId(oct, "game-stop")?.min, byId(nov, "game-stop")?.min]).toEqual([at(3), at(3)]);
  });
  it("defaultOff items need an enabled override or all", () => {
    expect(byId(buildDay("balanced", undefined, cfg()), "persona")).toBeUndefined();
    expect(byId(buildDay("balanced", undefined, cfg({ overrides: { "balanced:persona": { enabled: true } } })), "persona")).toBeDefined();
    expect(byId(buildDay("balanced", undefined, cfg(), 0, { all: true }), "persona")).toBeDefined();
  });
  it("game blocks move with the day shift, work start does not", () => {
    const d = buildDay("balanced", undefined, cfg(), 60);
    expect(byId(d, "game")?.min).toBe(at(22, 15));
    expect(byId(d, "game-stop")?.min).toBe(at(4));
    expect(byId(d, "caf")?.min).toBe(at(0));
    expect(byId(buildDay("work-plus", undefined, cfg({ shiftMin: 60 })), "work-in")?.min).toBe(at(16));
  });
  it("override keys are per template", () => {
    const o = cfg({ overrides: { "balanced:sing": { min: at(15) }, "work:sing": { min: at(16, 30) } } });
    expect(byId(buildDay("balanced", undefined, o), "sing")?.min).toBe(at(15));
    expect(byId(buildDay("work-plus", undefined, o), "sing")?.min).toBe(at(14, 30));
  });
  it("custom items match the template key, its base, or both", () => {
    const custom = [
      { id: "cw", title: "W", min: at(14), ring: "habit" as const, days: "work" },
      { id: "cb", title: "B", min: at(14), ring: "habit" as const, days: "balanced" },
      { id: "ca", title: "A", min: at(14), ring: "habit" as const, days: "both" },
    ];
    const has = (t: string, id: string) => !!byId(buildDay(t, undefined, cfg({ custom })), id);
    expect([has("work-plus", "cw"), has("work-game", "cw"), has("balanced", "cw")]).toEqual([true, true, false]);
    expect([has("balanced", "cb"), has("game-max", "cb"), has("off", "cb")]).toEqual([true, false, false]);
    expect(TEMPLATES.every((t) => has(t.id, "ca"))).toBe(true);
  });
  it("a user copy has its built-in's items under its own override key", () => {
    const templates = [{ id: "u-abc", name: "x", from: "balanced" }];
    const ids = (d: ReturnType<typeof buildDay>) => d.map((i) => i.id);
    expect(ids(buildDay("u-abc", undefined, cfg({ templates })))).toEqual(ids(buildDay("balanced", undefined, cfg())));
    expect(byId(buildDay("u-abc", undefined, cfg({ templates, overrides: { "u-abc:sing": { min: at(15) } } })), "sing")?.min).toBe(at(15));
    expect(byId(buildDay("u-abc", undefined, cfg({ templates, overrides: { "balanced:sing": { min: at(15) } } })), "sing")?.min).toBe(at(14, 15));
  });
  it("itemsFor hides singing on a voice-rest day", () => {
    expect(byId(itemsFor(cfg(), { type: "balanced" }), "sing")).toBeDefined();
    expect(byId(itemsFor(cfg(), { type: "balanced", voiceRest: true }), "sing")).toBeUndefined();
  });
  it("blockEnd uses endAt, dur, or the gym default", () => {
    const b = buildDay("balanced", undefined, cfg());
    expect(blockEnd(b, byId(b, "game")!)).toBe(byId(b, "game-stop")?.min);
    const g = buildDay("game-max", undefined, cfg());
    expect(blockEnd(g, byId(g, "game1")!)).toBe(at(15) + 90);
    const w = buildDay("work-game", undefined, cfg());
    expect(blockEnd(w, byId(w, "game")!)).toBe(at(3, 45));
    const l = buildDay("work", "A", cfg());
    expect(blockEnd(l, byId(l, "gym")!)).toBe(at(2, 30) + 75);
  });
});

describe("v1.4 stream season templates", () => {
  const SEASON = TEMPLATES.filter((t) => t.season === "stream" && !TERM_IDS.has(t.id)); // v1.8 term templates: term-plan.test.ts
  it("has the 4 season templates", () => {
    expect(SEASON.map((t) => t.id)).toEqual(["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]);
  });
  for (const t of SEASON) {
    it(`${t.id}: wake 09:30, sleep 01:30, live >= 5 h, no session items, order invariants`, () => {
      const d = buildDay(t.id, undefined, cfg(), 0, { date: "2026-11-02" });
      const g = (id: string) => byId(d, id);
      expect(g("weigh")?.min).toBe(570);
      expect(g("sleep")?.min).toBe(1530);
      const lv = g("stream")!, end = blockEnd(d, lv)!;
      expect(end).toBe(g("stream-end")!.min);
      expect(end - lv.min).toBeGreaterThanOrEqual(300);
      expect(end - lv.min).toBe(t.id === "stream-marathon" ? 570 : 330);
      expect(d.some((i) => i.session)).toBe(false);
      const gym = g("gym");
      if (gym) {
        const ge = blockEnd(d, gym)!;
        expect(g("meal2")!.min + 45).toBeLessThanOrEqual(gym.min);
        expect(ge + 60).toBeLessThanOrEqual(g("sleep")!.min);
        expect(ge + 60).toBeLessThanOrEqual(lv.min);
        const sing = g("sing");
        if (sing) expect(sing.min >= ge && sing.min <= ge + 60).toBe(false);
      }
      if (t.id === "stream-marathon") expect(g("meal3")!.min > lv.min && g("meal3")!.min < end).toBe(true);
      else expect(g("meal3")!.min).toBeLessThan(lv.min);
      expect(end + 60).toBeLessThanOrEqual(g("sleep")!.min);
      for (const id of ["presleep", "night", "meal3"]) expect(g(id)!.min).toBeLessThan(g("sleep")!.min);
      expect(d.filter((i) => i.ring).at(-1)?.id).toBe("sleep");
    });
  }
  it("marathon and stream-rest have no trade or gym; stream-gym trades 14:45 and lifts 16:00", () => {
    for (const id of ["stream-marathon", "stream-rest"]) {
      const d = buildDay(id, undefined, cfg());
      expect([byId(d, "trade"), byId(d, "gym")]).toEqual([undefined, undefined]);
    }
    const g = buildDay("stream-gym", undefined, cfg());
    expect([byId(g, "trade")?.min, byId(g, "gym")?.min]).toEqual([885, 960]);
  });
  const tp = { start: "2026-10-26", fromMin: 180, stepMin: 30 };
  const tc = (over: Partial<typeof tp & { stop: string }> = {}, extra: Partial<ScheduleCfg> = {}) => cfg({ taper: { ...tp, ...over }, ...extra });
  const wake = (c: ScheduleCfg, date?: string, id = "stream-gym") => byId(buildDay(id, undefined, c, 0, { date }), "weigh")?.min;
  it("the taper moves the whole season day by date", () => {
    const d = buildDay("stream-gym", undefined, tc(), 0, { date: "2026-10-26" });
    expect([byId(d, "weigh")?.min, byId(d, "stream")?.min, byId(d, "stream-end")?.min, byId(d, "sleep")?.min]).toEqual([750, 1320, 1650, 1710]);
    expect(wake(tc(), "2026-10-27")).toBe(720);
    expect(wake(tc(), "2026-11-01")).toBe(570);
    expect(wake(tc(), "2026-10-25")).toBe(570);
    expect([taperShift(tp, "2026-10-31"), taperShift(tp, "2026-11-05"), taperDone(tp)]).toEqual([30, 0, "2026-11-01"]);
  });
  it("the taper needs a date and a season template", () => {
    expect(wake(tc())).toBe(570);
    expect(buildDay("balanced", undefined, tc(), 0, { date: "2026-10-26" })).toEqual(buildDay("balanced", undefined, cfg(), 0, { date: "2026-10-26" }));
  });
  it("stop ends the taper from that date and keeps earlier days", () => {
    expect(wake(tc({ stop: "2026-10-28" }), "2026-10-28")).toBe(570);
    expect(wake(tc({ stop: "2026-10-28" }), "2026-10-27")).toBe(720);
  });
  it("season subs carry the built times (taper, global shift, disabled anchors)", () => {
    const sub = (c: ScheduleCfg, id: string, tpl = "stream-gym", date = "2026-10-26") => byId(buildDay(tpl, undefined, c, 0, { date }), id)?.sub ?? "";
    expect(sub(cfg(), "stream-prep")).toContain("ไลฟ์ 19:00");
    expect(sub(tc(), "stream-prep")).toContain("ไลฟ์ 22:00");
    expect(sub(cfg({ shiftMin: 30 }), "stream-prep")).toContain("ไลฟ์ 19:30");
    expect(sub(cfg(), "stream", "stream-marathon")).toContain("BRB มื้อเย็น 17:45-18:15 · ปิด 00:30");
    expect(sub(cfg(), "meal3", "stream-marathon")).toContain("กลับมาไลฟ์ 18:15");
    const off = tc({}, { overrides: { "stream-marathon:caf": { enabled: false } } });
    expect(sub(off, "stream-prep", "stream-marathon")).toContain("ก่อน 19:30");
    for (const t of ["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]) {
      for (const i of buildDay(t, undefined, tc(), 0, { date: "2026-10-26", all: true })) expect(i.sub ?? "").not.toMatch(/\{/);
    }
    const a = anchorsFor(tc(), { type: "stream-gym" }, "2026-10-26");
    expect([a.get("stream"), a.get("caf"), a.get("sleep")]).toEqual([1320, 1170, 1710]);
    expect(fillTimes("x {stream} {nope} {sleep+15}", a)).toBe("x 22:00 {nope} 04:45");
  });
  it("a user copy of stream-gym follows the taper", () => {
    expect(wake(tc({}, { templates: [{ id: "u-s", name: "x", from: "stream-gym" }] }), "2026-10-26", "u-s")).toBe(750);
  });
  it("legacy off custom items stay off season days; both items show everywhere", () => {
    const custom = [
      { id: "co", title: "O", min: at(14), ring: "habit" as const, days: "off" },
      { id: "cb", title: "B", min: at(14), ring: "habit" as const, days: "both" },
    ];
    const has = (t: string, id: string) => !!byId(buildDay(t, undefined, cfg({ custom })), id);
    expect([has("stream-gym", "co"), has("off", "co"), has("balanced", "co")]).toEqual([false, true, true]);
    expect([has("stream-gym", "cb"), has("off", "cb")]).toEqual([true, true]);
  });
});

describe("itemsFor today-only reschedule", () => {
  const c = cfg();
  const d = (o: Partial<DayLog> = {}) => ({ type: "work", meal2: "A" as const, shiftMin: 0, ...o });
  it("exports LAST as 07:59", () => expect(SLAST).toBe(LAST));
  it("a moved item takes its new minute, keeps planMin and re-sorts", () => {
    const l = itemsFor(c, d({ moved: { posture: at(15, 40) } }));
    expect(byId(l, "posture")).toMatchObject({ min: at(15, 40), planMin: at(13, 10) });
    expect(l.map((i) => i.min)).toEqual([...l.map((i) => i.min)].sort((a, b) => a - b));
    expect(l.findIndex((i) => i.id === "posture")).toBeGreaterThan(l.findIndex((i) => i.id === "trade"));
    expect(byId(l, "meal1")?.planMin).toBeUndefined();
    expect(itemsFor(c, d()).every((i) => i.planMin === undefined)).toBe(true);
  });
  it("ignores invalid and out-of-range values", () => {
    const base = itemsFor(c, d());
    for (const v of [at(8) - 1, LAST + 1, 900.5, Number.NaN, Infinity, "900" as unknown as number]) {
      expect(itemsFor(c, d({ moved: { posture: v } }))).toEqual(base);
    }
    expect(byId(itemsFor(c, d({ moved: { posture: LAST } })), "posture")?.min).toBe(LAST);
    expect(byId(itemsFor(c, d({ moved: { posture: at(8) } })), "posture")?.min).toBe(at(8));
    expect(itemsFor(c, d({ moved: { nope: at(14) }, skip: { nope: 1 } }))).toEqual(base);
  });
  it("weigh, sleep, info items and the stream block never move or skip", () => {
    const base = itemsFor(c, d());
    const ids = { weigh: at(14), sleep: at(3), "work-in": at(17) };
    expect(itemsFor(c, d({ moved: ids }))).toEqual(base);
    expect(itemsFor(c, d({ skip: { weigh: 1, sleep: 1, "work-in": 1 } }))).toEqual(base);
    const sd = { type: "stream-gym", shiftMin: 0 };
    const sb = itemsFor(c, sd, "2026-10-26");
    const stream = byId(sb, "stream")!;
    expect(stream.endAt).toBe("stream-end");
    expect(canReschedule(stream)).toBe(false);
    expect(itemsFor(c, { ...sd, moved: { stream: stream.min + 60 }, skip: { stream: 1 } }, "2026-10-26")).toEqual(sb);
    const ok = base.filter(canReschedule).map((i) => i.id);
    for (const id of ["weigh", "sleep", "work-in", "work-out"]) expect(ok).not.toContain(id);
    expect(canReschedule(byId(base, "posture")!)).toBe(true);
  });
  it("skip removes the item from itemsFor and from the dayScore denominator", () => {
    expect(byId(itemsFor(c, d({ skip: { posture: 1 } })), "posture")).toBeUndefined();
    const s = normalize({});
    const day: DayLog = { type: "work", meal2: "A", done: { meal1: 1 }, waterMl: 0 };
    const n = itemsFor(s.schedule, day).filter((i) => i.ring).length;
    expect(dayScore(s, day)).toBeCloseTo(1 / n);
    expect(dayScore(s, { ...day, skip: { posture: 1 } })).toBeCloseTo(1 / (n - 1));
  });
});

import { describe, expect, it } from "vitest";
import { at, sessionDelta } from "../date";
import type { ScheduleCfg } from "../model";
import { baseDay, blockEnd, buildDay, itemsFor, maxDayShift } from "../schedule";
import { TEMPLATES } from "../templates";

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
    it(`${t.id} has unique phase keys and 179 min of day shift`, () => {
      const keys = (t.phases ?? []).map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(maxDayShift(t.id, undefined, cfg())).toBe(179);
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

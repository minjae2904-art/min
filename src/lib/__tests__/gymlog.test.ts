import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type GymEx, type GymLog, type State } from "../model";
import { GYM_CYCLE, nextInCycle } from "../rotation";
import {
  DEFAULT_PLAN, addExercise, addSet, applyHint, dec, e1rm, enc, exById, finishGym, fmtKg, hint, history, lastSets, planFor, removeSet,
  runProgress, setVal, startGym, summaryOf, tickSet, volumeTrend,
} from "../gymlog";
import { clearRest, restLeft } from "../session";
import { sanitizeGym } from "../model";
import { planEpoch } from "../ticks";

const DATE = "2026-10-26";
const T0 = planEpoch(DATE, at(17, 30));
const fresh = (type = "stream-gym"): State => { const s = normalize({}); s.days[DATE] = { type, done: {}, waterMl: 0 }; return s; };
const log = (d: string, c: string, x: [string, string][], min = 60): GymLog => ({ d, c, at: planEpoch(d, at(17)), min, x });
const BP = DEFAULT_PLAN.D2[0]; // bench 3 x 6-8, step 2.5
const tickAll = (s: State, i: number) => s.gym.run!.x[i].s.forEach((_, j) => tickSet(s, i, j, true, T0));

describe("encode / format", () => {
  it("round-trips sets and formats kg compactly", () => {
    const sets: [number, number][] = [[60, 8], [57.5, 7], [61.25, 6]];
    expect(enc(sets)).toBe("60x8,57.5x7,61.25x6");
    expect(dec(enc(sets))).toEqual(sets);
    expect(enc([[0, 12]])).toBe("0x12");
    expect(fmtKg(60)).toBe("60");
    expect(fmtKg(57.5)).toBe("57.5");
    expect(e1rm(100, 0)).toBe(0);
    expect(e1rm(100, 30)).toBeCloseTo(140); // reps capped at 12
  });
});

describe("plans", () => {
  it("defaults per code, user plan wins, exById searches every code", () => {
    const s = fresh();
    expect(planFor(s, "D1").map((e) => e.id)).toEqual(["sq", "rdl", "lp", "lc", "calf", "ab"]);
    expect(planFor(s, "R")).toEqual([]);
    s.gym.plan.D1 = [{ ...DEFAULT_PLAN.D1[0], name: "ฟรอนต์สควอท" }];
    expect(planFor(s, "D1").length).toBe(1);
    expect(exById(s, "sq")?.name).toBe("ฟรอนต์สควอท");
    expect(exById(s, "ohp")?.name).toBe("โอเวอร์เฮดเพรส");
  });
});

describe("startGym prefill", () => {
  it("empty history -> sets x [0, lo]", () => {
    const s = fresh();
    startGym(s, DATE, "D2", T0);
    expect(s.gym.run!.x[0]).toEqual({ id: "bp", s: [[0, 6, 0], [0, 6, 0], [0, 6, 0]] });
    expect(s.gym.run!.x[5].s.length).toBe(2);
  });
  it("pads with the last set or trims to ex.sets", () => {
    const s = fresh();
    s.gym.log = [log("2026-10-20", "D2", [["bp", "60x8,60x7"], ["fly", "20x12,20x12,20x11,20x10"]])];
    startGym(s, DATE, "D2", T0);
    expect(s.gym.run!.x[0].s).toEqual([[60, 8, 0], [60, 7, 0], [60, 7, 0]]);
    expect(s.gym.run!.x[2].s).toEqual([[20, 12, 0], [20, 12, 0], [20, 11, 0]]);
    expect(lastSets(s, "bp", "2026-10-20")).toBeNull();
  });
  it("deload halves the sets", () => {
    const s = fresh();
    s.brain.deload = { from: "2026-10-25", to: "2026-10-31" };
    startGym(s, DATE, "D2", T0);
    expect(s.gym.run!.x[0].s.length).toBe(2);
    expect(s.gym.run!.x[5].s.length).toBe(1);
  });
  it("ignores rest codes", () => { const s = fresh(); startGym(s, DATE, "R", T0); expect(s.gym.run).toBeNull(); });
});

describe("set edits", () => {
  it("setVal clamps and rounds to 0.25; tick starts the exercise rest", () => {
    const s = fresh();
    startGym(s, DATE, "D2", T0);
    setVal(s, 0, 0, 61.3, 8.4);
    expect(s.gym.run!.x[0].s[0]).toEqual([61.25, 8, 0]);
    setVal(s, 0, 0, 900, -3);
    expect(s.gym.run!.x[0].s[0]).toEqual([500, 0, 0]);
    tickSet(s, 0, 1, true, T0);
    expect(s.gym.run!.x[0].s[1][2]).toBe(1);
    expect(s.gym.run!.rest).toEqual({ end: T0 + 120_000, ex: "bp", dur: 120 });
    expect(restLeft(s, T0 + 30_000)).toBe(90);
    tickSet(s, 4, 0, true, T0 + 1000);
    expect(s.gym.run!.rest!.dur).toBe(60);
    expect(runProgress(s)).toEqual({ code: "D2", done: 2, total: 17 });
  });
  it("add / remove sets within 1-6, extras max 2, applyHint skips ticked sets", () => {
    const s = fresh();
    startGym(s, DATE, "D2", T0);
    for (let k = 0; k < 5; k++) addSet(s, 0);
    expect(s.gym.run!.x[0].s.length).toBe(6);
    for (let k = 0; k < 8; k++) removeSet(s, 0);
    expect(s.gym.run!.x[0].s.length).toBe(1);
    addExercise(s, "bp"); // already in
    addExercise(s, "ohp"); addExercise(s, "lat"); addExercise(s, "rdf");
    expect(s.gym.run!.x.map((e) => e.id).slice(6)).toEqual(["ohp", "lat"]);
    addSet(s, 0); addSet(s, 0);
    tickSet(s, 0, 0, true, T0);
    applyHint(s, 0, 62.5);
    expect(s.gym.run!.x[0].s.map((t) => t[0])).toEqual([0, 62.5, 62.5]);
  });
});

describe("hint", () => {
  const ex = (o: Partial<GymEx> = {}): GymEx => ({ ...BP, ...o });
  it("up: all sets at top reps with the same kg", () => {
    expect(hint(ex(), [[60, 8], [60, 8], [60, 8]], [])).toEqual({ k: "up", text: "ครบ 8 ครั้งทุกเซ็ต · ครั้งหน้าลอง 62.5 kg", kg: 62.5 });
    expect(hint(ex({ bw: 1 }), [[0, 8], [0, 9], [0, 8]], [])!.text).toContain("เพิ่มน้ำหนักถ่วง 2.5 kg");
  });
  it("rep: every set at least lo", () => {
    expect(hint(ex(), [[60, 8], [60, 7], [60, 6]], [])).toEqual({ k: "rep", text: "คงน้ำหนัก 60 kg · เพิ่มทีละ 1 ครั้งจนครบ 8", kg: 60 });
    expect(hint(ex(), [[60, 8], [60, 8]], [])!.k).toBe("rep"); // fewer sets than planned is not "up"
    expect(hint(ex(), [[0, 8], [0, 7], [0, 6]], [])!.text).toBe("คงน้ำหนัก 0 kg · เพิ่มทีละ 1 ครั้งจนครบ 8"); // not bodyweight
  });
  it("down: three sessions stuck under lo at the same top kg", () => {
    const stuck: [number, number][] = [[80, 6], [80, 5], [80, 4]];
    expect(hint(ex(), stuck, [stuck, stuck])).toEqual({ k: "down", text: "ค้าง 3 ครั้ง · ลองลดเหลือ 72.5 kg แล้วไต่ใหม่", kg: 72.5 });
    expect(hint(ex(), stuck, [stuck, [[77.5, 6], [77.5, 5]]])!.k).toBe("hold");
  });
  it("hold otherwise; null without counted sets", () => {
    expect(hint(ex(), [[80, 6], [80, 5]], [])).toEqual({ k: "hold", text: "คงน้ำหนักเดิม ทำให้ครบ 6 ครั้งก่อน", kg: 80 });
    expect(hint(ex(), [[80, 0]], [])).toBeNull();
  });
});

describe("finishGym", () => {
  it("zero ticked sets drops the run and returns null", () => {
    const s = fresh();
    startGym(s, DATE, "D2", T0);
    expect(finishGym(s, T0 + 3_600_000)).toBeNull();
    expect(s.gym.run).toBeNull();
    expect(s.gym.log).toEqual([]);
    expect(s.days[DATE].done.gym).toBeUndefined();
  });
  it("stamps the last set tick (lt) that survives a skipped rest; finishing leaves a merge tombstone", () => {
    const s = fresh();
    startGym(s, DATE, "D2", T0);
    setVal(s, 0, 0, 60, 8);
    tickSet(s, 0, 0, true, T0 + 40 * 60_000);
    clearRest(s);
    expect(s.gym.run!.lt).toBe(T0 + 40 * 60_000);
    expect(sanitizeGym(JSON.parse(JSON.stringify(s.gym))).run!.lt).toBe(T0 + 40 * 60_000);
    const sum = finishGym(s, s.gym.run!.lt!)!;
    expect(sum.min).toBe(40);
    expect(s.gym.end).toBe(T0);
  });
  it("logs ticked sets, ticks gym at run.at with src now, keeps the rotation", () => {
    const s = fresh();
    s.workouts = [{ date: "2026-10-24", code: "D1" }];
    startGym(s, DATE, "D2", T0);
    setVal(s, 0, 0, 60, 8); setVal(s, 0, 1, 60, 8); setVal(s, 0, 2, 57.5, 7);
    tickAll(s, 0);
    setVal(s, 1, 0, 20, 10); tickSet(s, 1, 0, true, T0);
    const sum = finishGym(s, T0 + 70 * 60_000)!;
    expect(s.gym.run).toBeNull();
    expect(s.gym.log).toEqual([{ d: DATE, c: "D2", at: T0, min: 70, x: [["bp", "60x8,60x8,57.5x7"], ["idb", "20x10"]] }]);
    expect(s.days[DATE].done.gym).toBe(T0);
    expect(s.days[DATE].doneSrc?.gym?.src).toBe("now");
    expect(s.workouts.find((w) => w.date === DATE)?.code).toBe("D2");
    expect(nextInCycle(GYM_CYCLE, s.workouts)).toBe("D3");
    expect(sum.vol).toBe(Math.round(60 * 8 * 2 + 57.5 * 7 + 200));
    expect(sum.sets).toBe(4);
    expect(sum.ticked).toBe(true);
    expect(sum.ex[0]).toMatchObject({ name: "เบนช์เพรส", top: "60 x 8", pr: false });
  });
  it("a rest-day session upserts workouts without a gym item", () => {
    const s = fresh("stream-rest");
    startGym(s, DATE, "D4", T0);
    setVal(s, 0, 0, 30, 8); tickSet(s, 0, 0, true, T0);
    expect(finishGym(s, T0 + 600_000)?.ticked).toBe(false); // the summary must not claim "เข้ายิม" was ticked
    expect(s.days[DATE].done.gym).toBeUndefined();
    expect(s.workouts).toEqual([{ date: DATE, code: "D4" }]);
  });
  it("replaces the same date|code and caps the log at 24", () => {
    const s = fresh();
    s.gym.log = Array.from({ length: 24 }, (_, i) => log(`2026-09-${String(i + 1).padStart(2, "0")}`, "D1", [["sq", "60x8"]]));
    s.gym.log.push(log(DATE, "D2", [["bp", "50x8"]]));
    s.gym.log.sort((a, b) => a.d.localeCompare(b.d));
    startGym(s, DATE, "D2", T0);
    setVal(s, 0, 0, 55, 8); tickSet(s, 0, 0, true, T0);
    finishGym(s, T0 + 600_000);
    expect(s.gym.log.length).toBe(24);
    expect(s.gym.log.filter((l) => l.d === DATE)).toEqual([expect.objectContaining({ x: [["bp", "55x8"]] })]);
    expect(s.gym.log[0].d).toBe("2026-09-02");
  });
  it("pr needs an earlier log and a better best e1RM", () => {
    const s = fresh();
    const first = log("2026-10-19", "D2", [["bp", "60x8"]]);
    s.gym.log = [first];
    expect(summaryOf(s, first).ex[0].pr).toBe(false);
    const better = log(DATE, "D2", [["bp", "62.5x8"]]);
    s.gym.log.push(better);
    expect(summaryOf(s, better).ex[0].pr).toBe(true);
    const same = log("2026-10-27", "D2", [["bp", "62.5x8"]]);
    s.gym.log.push(same);
    expect(summaryOf(s, same).ex[0].pr).toBe(false);
  });
});

describe("history and trend", () => {
  it("per exercise newest first, volume trend per code oldest first", () => {
    const s = fresh();
    s.gym.log = [
      log("2026-10-12", "D2", [["bp", "55x8,55x8"]]),
      log("2026-10-16", "D1", [["sq", "80x6"]]),
      log("2026-10-19", "D2", [["bp", "60x8,60x6"], ["tpd", "20x12"]]),
    ];
    expect(history(s, "bp")).toEqual([
      { d: "2026-10-19", best: "60 x 8", top: 76, vol: 840 },
      { d: "2026-10-12", best: "55 x 8", top: 69.7, vol: 880 },
    ]);
    expect(history(s, "bp", 1).length).toBe(1);
    expect(volumeTrend(s, "D2")).toEqual([{ d: "2026-10-12", vol: 880 }, { d: "2026-10-19", vol: 1080 }]);
    expect(volumeTrend(s, "D3")).toEqual([]);
  });
});

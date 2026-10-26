import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { setDone } from "../actions";
import { compileAction } from "../brain/actions";
import { dayFor, mergeStates, normalize, type State } from "../model";
import { dueReminders } from "../reminders";
import { itemsFor } from "../schedule";
import { dayScore } from "../stats";
import { applyLevel, careIds, careSub, completeRoutine, lastReqDaily, doTask, dueTasks, restoreCare, rowOf, rowState, setPack, skipRow, skipStep, skipTask, snapCare, snoozeTask, tickStep, untickRoutine } from "../care/progress";

const D = "2026-10-27"; // Tuesday
const mk = (level: "lite" | "std" | "full" = "std", type = "stream-gym"): State => {
  const s = normalize({});
  applyLevel(s, level, D);
  s.days[D] = { type, done: {}, waterMl: 0 };
  return s;
};
const R = (s: State, id: string) => s.schedule.care!.find((r) => r.id === id)!;
const st = (s: State, rid: string) => rowState(R(s, rid), dayFor(s, D), D, s.days[addDays(D, -1)]);

describe("routine progress", () => {
  it("ticks the row only when every required due step is done; optional steps never count", () => {
    const s = mk("lite");
    expect(st(s, "am")).toMatchObject({ done: 0, total: 2, complete: false });
    tickStep(s, D, "am", "spf", true);
    expect(s.days[D].done["r-am"]).toBeUndefined();
    tickStep(s, D, "am", "br", true);
    expect(s.days[D].done["r-am"]).toBeGreaterThan(0);
    expect(careIds(s.days[D], "am")).toEqual(new Set(["spf", "br"]));
    tickStep(s, D, "am", "br", false);
    expect(s.days[D].done["r-am"]).toBeUndefined();
    const t = mk("std");
    tickStep(t, D, "am", "mo", true); // optional
    expect(st(t, "am")).toMatchObject({ done: 0, total: 3, optLeft: 1 });
    expect(t.days[D].done["r-am"]).toBeUndefined();
    for (const id of ["cl", "spf", "br"]) tickStep(t, D, "am", id, true);
    expect(t.days[D].done["r-am"]).toBeGreaterThan(0);
  });
  it("completeRoutine ticks required due steps and the row; untick clears both; undo restores the snapshot", () => {
    const s = mk("std");
    const snap = snapCare(s, D, "pm");
    completeRoutine(s, D, "pm");
    expect(s.days[D].done.night).toBeGreaterThan(0);
    expect(careIds(s.days[D], "pm")).toEqual(new Set(["sh", "cl", "mo", "br"]));
    restoreCare(s, D, "pm", snap);
    expect(s.days[D].done.night).toBeUndefined();
    expect(s.days[D].care).toBeUndefined();
    completeRoutine(s, D, "pm");
    tickStep(s, D, "pm", "fl", true);
    untickRoutine(s, D, "pm");
    expect(s.days[D].done.night).toBeUndefined();
    expect(careIds(s.days[D], "pm")).toEqual(new Set(["fl"]));
  });
  it("skipStep is for optional/cadence steps; a skipped optional step leaves the row alone", () => {
    const s = mk("std");
    skipStep(s, D, "pm", "cl", true); // required daily: refused
    expect(s.days[D].care).toBeUndefined();
    skipStep(s, D, "pm", "fl", true);
    expect(careIds(s.days[D], "pm").has("-fl")).toBe(true);
    expect(st(s, "pm").optLeft).toBe(2); // dim, jr
    tickStep(s, D, "pm", "fl", true);
    expect(careIds(s.days[D], "pm")).toEqual(new Set(["fl"]));
  });
  it("careSub lists what is left", () => {
    const s = mk("lite");
    expect(careSub(st(s, "am"))).toBe("กันแดด · แปรงฟัน");
    tickStep(s, D, "am", "spf", true);
    expect(careSub(st(s, "am"))).toBe("แปรงฟัน");
    tickStep(s, D, "am", "br", true);
    expect(careSub(st(s, "am"))).toBe("ครบแล้ว");
    expect(careSub(st(mk("std"), "am"))).toBe("ล้างหน้า · กันแดด · +1 · +2 ไม่บังคับ");
  });
  it("skipRow drops the row from the score and reminders and keeps the reason; a tick clears both", () => {
    const s = mk("std");
    R(s, "am").remind = true;
    const now = new Date("2026-10-27T09:42:00+07:00");
    expect(dueReminders(s, now, now.getTime()).reminders.map((r) => r.key)).toContain("r-am:due");
    const n = itemsFor(s.schedule, s.days[D], D).filter((i) => i.ring).length;
    const item = rowOf(s, D, "am")!;
    skipRow(s, D, item, "travel");
    expect(s.days[D].skipWhy).toEqual({ "r-am": "travel" });
    expect(itemsFor(s.schedule, s.days[D], D).filter((i) => i.ring)).toHaveLength(n - 1);
    expect(dueReminders(s, now, now.getTime()).reminders.map((r) => r.key)).not.toContain("r-am:due");
    s.days[D].done.meal1 = 1;
    expect(dayScore(s, s.days[D])).toBeCloseTo(1 / (n - 1));
    setDone(s, D, item, true);
    expect(s.days[D].skip).toBeUndefined();
    expect(s.days[D].skipWhy).toBeUndefined();
    skipRow(s, D, item, "rest"); // done rows are never skipped
    expect(s.days[D].skipWhy).toBeUndefined();
    setDone(s, D, item, false);
    skipRow(s, D, item, "sick");
    skipRow(s, D, item, null);
    expect(s.days[D].skip).toBeUndefined();
    expect(s.days[D].skipWhy).toBeUndefined();
  });
});

describe("applyLevel", () => {
  it("counts added/off steps and tasks and is idempotent", () => {
    const s = normalize({});
    expect(applyLevel(s, "lite", D)).toEqual({ added: 5, off: 0, water: true });
    expect(applyLevel(s, "lite", D)).toEqual({ added: 0, off: 0, water: false });
    expect(applyLevel(s, "std", D)).toEqual({ added: 23, off: 0, water: false });
    expect(applyLevel(s, "std", D)).toEqual({ added: 0, off: 0, water: false });
    expect(applyLevel(s, "full", D)).toEqual({ added: 10, off: 0, water: false });
    expect(applyLevel(s, "lite", D)).toEqual({ added: 0, off: 33, water: false });
    expect(R(s, "gym").on).toBe(false);
    expect(R(s, "prep").on).toBe(false);
    expect(R(s, "am").on && R(s, "pm").on).toBe(true);
    expect(s.care).toMatchObject({ level: "lite", asked: true, track: { veg: false } });
    expect(s.schedule.care!.map((r) => r.id)).toEqual(["am", "gym", "prep", "pm"]);
  });
  it("the first choice adds the health checks and turns on the water plan", () => {
    const s = normalize({});
    expect(s.care.water.plan).toBe(false);
    applyLevel(s, "std", D);
    expect(s.care.water.plan).toBe(true);
    expect(s.care.checks.map((c) => c.id)).toEqual(["annual", "bp", "dent", "lab", "vitd", "eye", "ear"]);
    expect(s.care.track.veg).toBe(true);
    s.care.water.plan = false;
    applyLevel(s, "full", D);
    expect(s.care.water.plan).toBe(false);
    expect(s.care.checks).toHaveLength(7);
  });
  it("sets opt from the level unless the step was edited", () => {
    const s = mk("lite");
    expect(R(s, "am").steps.find((x) => x.id === "spf")?.opt).toBeUndefined();
    applyLevel(s, "std", D);
    expect(R(s, "am").steps.find((x) => x.id === "cl")?.opt).toBeUndefined();
    const mo = R(s, "pm").steps.find((x) => x.id === "mo")!;
    Object.assign(mo, { opt: true, ed: true, title: "มอยส์ของฉัน" });
    const cl = R(s, "pm").steps.find((x) => x.id === "cl")!;
    cl.opt = true;
    applyLevel(s, "full", D);
    expect(mo).toMatchObject({ opt: true, ed: true, title: "มอยส์ของฉัน" });
    expect(cl.opt).toBeUndefined();
  });
  it("keeps opt-in packs (acne, humid) across levels and starts the retinoid ramp today", () => {
    const s = mk("std");
    setPack(s, "acne", true, D);
    setPack(s, "humid", true, D);
    expect(R(s, "pm").steps.find((x) => x.id === "ret")).toMatchObject({ cad: "r@" + D, irr: "ret", opt: true });
    expect(R(s, "am").steps.find((x) => x.id === "nia")?.on).toBeUndefined();
    applyLevel(s, "lite", D);
    expect(s.care.packs).toEqual(expect.arrayContaining(["acne", "humid"]));
    for (const [r, id] of [["pm", "ret"], ["pm", "bha"], ["am", "nia"], ["gym", "bpw"]]) expect(R(s, r).steps.find((x) => x.id === id)?.on).toBeUndefined();
    expect(s.care.tasks.find((t) => t.id === "keto")?.on).toBe(true);
    expect(s.care.tasks.find((t) => t.id === "dand")?.on).toBe(false);
    setPack(s, "acne", false, "2026-11-01");
    expect(R(s, "pm").steps.find((x) => x.id === "ret")?.on).toBe(false);
    setPack(s, "acne", true, "2026-11-03");
    expect(R(s, "pm").steps.find((x) => x.id === "ret")?.cad).toBe("r@2026-11-03");
  });
  it("toggling one pack leaves hidden steps and tasks of other packs alone", () => {
    const s = mk("std");
    R(s, "am").steps.find((x) => x.id === "lip")!.on = false;
    s.care.tasks.find((t) => t.id === "pillow")!.on = false;
    const res = setPack(s, "acne", true, D);
    expect(res).toEqual({ added: 4, off: 0 });
    expect(R(s, "am").steps.find((x) => x.id === "lip")?.on).toBe(false);
    expect(s.care.tasks.find((t) => t.id === "pillow")?.on).toBe(false);
    expect(setPack(s, "acne", false, D)).toEqual({ added: 0, off: 4 });
    expect(R(s, "am").steps.find((x) => x.id === "lip")?.on).toBe(false);
  });
  it("creates hair and dand off", () => {
    const s = mk("full");
    expect(s.care.tasks.find((t) => t.id === "hair")?.on).toBe(false);
    expect(s.care.tasks.find((t) => t.id === "mole")?.on).toBe(true);
  });
});

describe("periodic tasks", () => {
  it("are due when never done or past their interval, and snooze hides them until date + days", () => {
    const s = mk("std");
    expect(dueTasks(s, D).map((t) => t.id)).toEqual(["nailh", "nailf", "pillow", "pads", "sheet", "brush"]);
    doTask(s, "nailh", D);
    expect(dueTasks(s, addDays(D, 6)).some((t) => t.id === "nailh")).toBe(false);
    expect(dueTasks(s, addDays(D, 7)).some((t) => t.id === "nailh")).toBe(true);
    snoozeTask(s, "pillow", D);
    expect(dueTasks(s, D).some((t) => t.id === "pillow")).toBe(false);
    expect(dueTasks(s, addDays(D, 1)).some((t) => t.id === "pillow")).toBe(false);
    expect(dueTasks(s, addDays(D, 2)).some((t) => t.id === "pillow")).toBe(true);
    doTask(s, "pillow", D);
    expect(s.care.snooze["t:pillow"]).toBeUndefined();
    s.care.tasks.find((t) => t.id === "sheet")!.on = false;
    expect(dueTasks(s, D).some((t) => t.id === "sheet")).toBe(false);
  });
});

describe("restoreCare and the merge clock", () => {
  it("an undone skip stays undone after merging with a copy pushed while it was skipped (log kept, clock forward)", () => {
    for (const hadLog of [true, false]) {
      const s = mk("std");
      if (!hadLog) delete s.days[D];
      const item = rowOf(s, D, "am")!;
      const snap = snapCare(s, D, "am");
      skipRow(s, D, item, "travel");
      s.days[D].reschedAt = 1_000;
      const pushed = structuredClone(s);
      restoreCare(s, D, "am", snap, 2_000);
      expect(s.days[D]).toBeDefined();
      expect(s.days[D].skip).toBeUndefined();
      expect(s.days[D].reschedAt).toBe(2_000);
      for (const m of [mergeStates(s, pushed), mergeStates(pushed, s)]) {
        expect(m.days[D].skip).toBeUndefined();
        expect(m.days[D].skipWhy).toBeUndefined();
      }
    }
  });
  it("an undo that does not touch skips leaves the clock alone", () => {
    const s = mk("std");
    s.days[D].reschedAt = 500;
    const snap = snapCare(s, D, "am");
    tickStep(s, D, "am", "spf", true);
    restoreCare(s, D, "am", snap, 9_000);
    expect(s.days[D].reschedAt).toBe(500);
  });
});

describe("lastReqDaily (CareSheet quick-menu guard)", () => {
  it("flags the last on + required + daily step so hiding it or changing its days cannot drop the row", () => {
    const s = mk("lite");
    const am = () => s.schedule.care!.find((r) => r.id === "am")!;
    expect(lastReqDaily(am(), "spf")).toBe(false); // br is still required daily
    am().steps.find((x) => x.id === "spf")!.on = false;
    expect(lastReqDaily(am(), "br")).toBe(true);
    expect(lastReqDaily(am(), "spf")).toBe(false); // hidden steps are never "last"
    am().steps.find((x) => x.id === "br")!.cad = "w:1,3,5";
    expect(lastReqDaily(am(), "br")).toBe(false);
  });
});

describe("skipTask", () => {
  it("counts the round as passed: last = date, snooze cleared, due again on date + every", () => {
    const s = mk("std");
    s.care.last.pillow = addDays(D, -15);
    snoozeTask(s, "pillow", D);
    skipTask(s, "pillow", D);
    expect(s.care.last.pillow).toBe(D);
    expect(s.care.snooze["t:pillow"]).toBeUndefined();
    expect(dueTasks(s, addDays(D, 6)).some((t) => t.id === "pillow")).toBe(false);
    expect(dueTasks(s, addDays(D, 7)).some((t) => t.id === "pillow")).toBe(true);
  });
});

describe("set_day_template with care rows", () => {
  const c = (s: State, tpl: string) => compileAction(s, { k: "set_day_template", date: D, tpl }, D, "brief");
  it("is not blocked by step progress (DayLog.care)", () => {
    const s = mk("std");
    tickStep(s, D, "gym", "sh", true);
    expect(c(s, "stream-rest").ok).toBe(true);
  });
  it("is blocked by a ticked r-gym going to a template without it, like gym", () => {
    const s = mk("std");
    completeRoutine(s, D, "gym");
    expect(s.days[D].done["r-gym"]).toBeGreaterThan(0);
    expect(c(s, "stream-rest").ok).toBe(false);
    expect(c(s, "stream-mc").ok).toBe(true); // r-gym follows cardio there
  });
  it("treats hosted night exactly like plain night", () => {
    const plain = normalize({}); plain.days[D] = { type: "stream-gym", done: { night: 1, meal1: 1 }, waterMl: 0 };
    const s = normalize({});
    applyLevel(s, "lite", D);
    R(s, "am").on = false;
    s.days[D] = { type: "stream-gym", done: { night: 1, meal1: 1 }, waterMl: 0 };
    expect(itemsFor(s.schedule, s.days[D], D).map((i) => i.id)).toEqual(itemsFor(plain.schedule, plain.days[D], D).map((i) => i.id));
    expect(dayScore(s, s.days[D])).toBe(dayScore(plain, plain.days[D]));
    for (const tpl of ["stream-rest", "stream-marathon", "balanced"]) expect(c(s, tpl).ok).toBe(c(plain, tpl).ok);
  });
});

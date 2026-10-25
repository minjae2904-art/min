import { describe, expect, it } from "vitest";
import { at } from "../date";
import { targets } from "../health";
import { mergeStates, type State } from "../model";
import { weightStats } from "../stats";
import { applyOps, budgetDelta, compileAction, compileVariant, describeOps, invertOps, isStale, lastDeload7, lostOps, undoOps, type Compiled } from "../brain/actions";
import type { BrainAction, Mode } from "../brain/types";
import { perfect, TODAY } from "./brain-fixtures";

const okOf = (r: Compiled) => { if (!r.ok) throw new Error(r.reason); return r; };
const c = (s: State, a: BrainAction, mode: Mode = "brief") => compileAction(s, a, TODAY, mode);
const fresh = () => perfect(21);

describe("compileAction bounds", () => {
  it("clips a 90 min move to 60 and says so", () => {
    const r = okOf(c(fresh(), { k: "move_item", tpl: "game-max", item: "game-stop", delta: -90 }));
    expect(r.ops[0]).toMatchObject({ t: "override", key: "game-max:game-stop", field: "min", before: undefined, after: at(3) - 60 });
    expect(r.clipped).toContain("ขยับได้ไม่เกิน 60 นาทีต่อครั้ง");
  });
  it("rejects work items, session items, custom items, core toggles, unknown and deleted templates", () => {
    const s = fresh();
    s.schedule.custom.push({ id: "c-1", title: "x", min: at(14), ring: "habit", days: "balanced" });
    s.schedule.templates = [{ id: "u-a", name: "mine", from: "balanced" }];
    expect(c(s, { k: "move_item", tpl: "work-plus", item: "work-in", delta: 15 }).ok).toBe(false);
    expect(c(s, { k: "move_item", tpl: "work-plus", item: "gym", delta: 15 }).ok).toBe(false); // after work-in
    expect(c(s, { k: "move_item", tpl: "work-plus", item: "sing", delta: -15 }).ok).toBe(true); // before work-in
    expect(c(s, { k: "move_item", tpl: "balanced", item: "trade", delta: 15 }).ok).toBe(false); // NY session
    expect(c(s, { k: "move_item", tpl: "balanced", item: "meal3", delta: 15 }).ok).toBe(false); // NY session
    expect(c(s, { k: "move_item", tpl: "balanced", item: "c-1", delta: 15 }).ok).toBe(false);
    expect(c(s, { k: "toggle_item", tpl: "balanced", item: "meal1", on: false }).ok).toBe(false);
    expect(c(s, { k: "toggle_item", tpl: "balanced", item: "gym", on: false }).ok).toBe(false);
    expect(c(s, { k: "move_item", tpl: "nope", item: "sing", delta: 15 }).ok).toBe(false);
    expect(c(s, { k: "move_item", tpl: "u-gone", item: "sing", delta: 15 }).ok).toBe(false);
    expect(c(s, { k: "move_item", tpl: "u-a", item: "sing", delta: 15 }).ok).toBe(true);
    expect(c(s, { k: "setDone", item: "gym" } as unknown as BrainAction).ok).toBe(false);
  });
  it("rejects past dates and out-of-window dates", () => {
    const s = fresh();
    expect(c(s, { k: "set_day_template", date: "2026-10-19", tpl: "rest" }).ok).toBe(false);
    expect(c(s, { k: "set_day_template", date: "2026-10-28", tpl: "rest" }).ok).toBe(false);
    expect(c(s, { k: "set_voice_rest", date: "2026-10-24" }).ok).toBe(false);
    expect(c(s, { k: "set_voice_rest", date: "2026-10-23" }).ok).toBe(true);
    expect(c(s, { k: "plan_deload", from: "2026-10-19", days: 7 }).ok).toBe(false);
  });
  it("deload: the 21-day gap holds after the record left the applied cap; a 1-day deload inside a running week is a no-op", () => {
    const s = fresh();
    s.brain.deload = { from: "2026-10-06", to: "2026-10-12" }; // a 7-day deload whose record was pushed out
    expect(c(s, { k: "plan_deload", from: "2026-10-22", days: 7 }).ok).toBe(false);
    expect(lastDeload7(s)).toBe("2026-10-12");
    s.brain.deload = { from: "2026-09-01", to: "2026-09-07" };
    expect(c(s, { k: "plan_deload", from: "2026-10-22", days: 7 }).ok).toBe(true);
    s.brain.deload = { from: "2026-10-14", to: "2026-10-20" };
    expect(c(s, { k: "plan_deload", from: TODAY, days: 1 }).ok).toBe(false);
  });
  it("kcal: step and total bounds", () => {
    const s = fresh();
    expect(c(s, { k: "kcal_adjust", delta: 300 }).ok).toBe(false);
    expect(c(s, { k: "kcal_adjust", delta: 120 }).ok).toBe(false);
    s.settings.kcalAdjust = 450;
    const r = okOf(c(s, { k: "kcal_adjust", delta: 100 }));
    expect(r.ops[0]).toMatchObject({ before: 450, after: 500 });
    expect(r.clipped.length).toBe(1);
    s.settings.kcalAdjust = 500;
    expect(c(s, { k: "kcal_adjust", delta: 50 }).ok).toBe(false);
    s.weights = s.weights.slice(-3);
    s.settings.kcalAdjust = 0;
    expect(c(s, { k: "kcal_adjust", delta: 150 }).ok).toBe(false);
  });
  it("week slots only in the weekly review, at most 2 per variant", () => {
    const s = fresh();
    expect(c(s, { k: "set_week_slot", dow: 2, tpl: "rest" }, "brief").ok).toBe(false);
    expect(c(s, { k: "set_week_slot", dow: 2, tpl: "rest" }, "weekly").ok).toBe(true);
    const three: BrainAction[] = [2, 3, 4].map((dow) => ({ k: "set_week_slot", dow, tpl: "rest" }));
    expect(compileVariant(s, three, TODAY, "weekly").ok).toBe(false);
  });
  it("only notifyLastMatch on; game break only when off or longer", () => {
    const s = fresh();
    expect(c(s, { k: "set_flag", key: "notifyLastMatch", on: true }).ok).toBe(true);
    expect(c(s, { k: "set_flag", key: "goodDay", on: true } as unknown as BrainAction).ok).toBe(false);
    expect(c(s, { k: "set_game_break", min: 90 }).ok).toBe(false); // 60 now
    s.settings.gameBreakMin = 0;
    expect(c(s, { k: "set_game_break", min: 60 }).ok).toBe(true);
  });
});

describe("order invariants (no regression)", () => {
  it("game-stop moved within 60 min of sleep is rejected", () => {
    const s = fresh();
    s.schedule.overrides["game-max:sleep"] = { min: at(4, 30) };
    const r = c(s, { k: "move_item", tpl: "game-max", item: "game-stop", delta: 45 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("หยุดเกมแข่งก่อนนอน");
  });
  it("sing moved into gym end + 60 is rejected", () => {
    const s = fresh();
    s.schedule.overrides["balanced:sing"] = { min: at(18, 15) };
    expect(c(s, { k: "move_item", tpl: "balanced", item: "sing", delta: 60 }).ok).toBe(false);
  });
  it("a pre-existing unrelated violation does not block a valid move", () => {
    const s = fresh();
    s.schedule.overrides["balanced:presleep"] = { min: at(5, 30) }; // already after sleep
    expect(c(s, { k: "move_item", tpl: "balanced", item: "sing", delta: -15 }).ok).toBe(true);
    expect(compileVariant(s, [{ k: "move_item", tpl: "balanced", item: "sing", delta: -15 }], TODAY, "brief").ok).toBe(true);
  });
  it("set_day_template today keeps every ticked id", () => {
    const s = fresh(); // today = game-max, fully ticked incl. game items? ticks are ring items
    expect(c(s, { k: "set_day_template", date: TODAY, tpl: "work-game" }).ok).toBe(false); // mc-check/game1 ticks would vanish
    s.days[TODAY].done = { weigh: 1, meal1: 1 };
    expect(c(s, { k: "set_day_template", date: TODAY, tpl: "rest" }).ok).toBe(true);
  });
  it("a user template override key uses its u- key", () => {
    const s = fresh();
    s.schedule.templates = [{ id: "u-abc", name: "ของฉัน", from: "game-max" }];
    const r = okOf(c(s, { k: "move_item", tpl: "u-abc", item: "game-stop", delta: -15 }));
    expect(r.ops[0]).toMatchObject({ key: "u-abc:game-stop" });
  });
});

describe("apply -> invert round trip", () => {
  const cases: [string, (s: State) => void, BrainAction[], Mode][] = [
    ["move_item", () => {}, [{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }], "brief"],
    ["reset_time", (s) => { s.schedule.overrides["balanced:sing"] = { min: at(14, 45), remind: false }; }, [{ k: "reset_time", tpl: "balanced", item: "sing" }], "brief"],
    ["toggle_item off", () => {}, [{ k: "toggle_item", tpl: "balanced", item: "posture", on: false }], "brief"],
    ["toggle_item on (defaultOff)", () => {}, [{ k: "toggle_item", tpl: "balanced", item: "persona", on: true }], "brief"],
    ["set_reminder", (s) => { s.schedule.overrides["balanced:meal3"] = { remind: false }; }, [{ k: "set_reminder", tpl: "balanced", item: "meal3", on: true }], "brief"],
    ["set_day_template existing", () => {}, [{ k: "set_day_template", date: TODAY, tpl: "game-max" }], "brief"],
    ["set_day_template created", () => {}, [{ k: "set_day_template", date: "2026-10-22", tpl: "rest" }], "brief"],
    ["set_week_slot", () => {}, [{ k: "set_week_slot", dow: 4, tpl: "rest" }], "weekly"],
    ["set_voice_rest created", () => {}, [{ k: "set_voice_rest", date: "2026-10-22" }], "brief"],
    ["set_voice_rest existing", () => {}, [{ k: "set_voice_rest", date: TODAY }], "brief"],
    ["set_game_break", (s) => { s.settings.gameBreakMin = 0; }, [{ k: "set_game_break", min: 60 }], "brief"],
    ["set_water_goal", (s) => { s.settings.waterGoalMl = 3000; }, [{ k: "set_water_goal", ml: 0 }], "brief"],
    ["set_water_every", () => {}, [{ k: "set_water_every", min: 90 }], "brief"],
    ["kcal_adjust", () => {}, [{ k: "kcal_adjust", delta: 200 }], "brief"],
    ["plan_deload", () => {}, [{ k: "plan_deload", from: "2026-10-22", days: 7 }], "brief"],
    ["set_flag", () => {}, [{ k: "set_flag", key: "notifyLastMatch", on: true }], "brief"],
    ["focus_step", () => {}, [{ k: "focus_step", area: "sleep", ref: "sleep-anchor" }], "brief"],
    ["tip", () => {}, [{ k: "tip", ref: "mvd" }], "brief"],
    ["burnout combo (voice rest + day template on one new day)", () => {}, [{ k: "set_voice_rest", date: "2026-10-21" }, { k: "set_day_template", date: "2026-10-21", tpl: "rest" }], "brief"],
  ];
  for (const [name, setup, actions, mode] of cases) {
    it(name, () => {
      const s = fresh();
      if (name.startsWith("set_day_template existing")) s.days[TODAY].type = "balanced";
      setup(s);
      const orig = structuredClone(s);
      const r = okOf(compileVariant(s, actions, TODAY, mode));
      expect(s).toEqual(orig); // compiling never touches the state
      const x = structuredClone(s);
      applyOps(x, r.ops);
      if (name !== "tip") expect(x).not.toEqual(orig);
      applyOps(x, invertOps(r.ops));
      expect(x).toEqual(orig);
    });
  }
  it("created-then-logged: undo keeps the day and only removes what the brain set", () => {
    const s = fresh();
    const r = okOf(compileVariant(s, [{ k: "set_voice_rest", date: "2026-10-22" }], TODAY, "brief"));
    applyOps(s, r.ops);
    s.days["2026-10-22"].waterMl = 500;
    applyOps(s, undoOps(s, r.ops).inverse);
    expect(s.days["2026-10-22"]).toBeDefined();
    expect(s.days["2026-10-22"].voiceRest).toBeUndefined();
    expect(s.days["2026-10-22"].waterMl).toBe(500);
    const t = fresh();
    const r2 = okOf(compileVariant(t, [{ k: "set_day_template", date: "2026-10-22", tpl: "rest" }], TODAY, "brief"));
    applyOps(t, r2.ops);
    t.days["2026-10-22"].done.weigh = 1;
    applyOps(t, undoOps(t, r2.ops).inverse);
    expect(t.days["2026-10-22"]).toMatchObject({ type: "balanced", done: { weigh: 1 } }); // Thursday slot = balanced
  });
});

describe("stale, partial undo, lost", () => {
  const acts: BrainAction[] = [{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }, { k: "set_game_break", min: 60 }];
  it("isStale after a manual edit", () => {
    const s = fresh();
    s.settings.gameBreakMin = 0;
    const r = okOf(compileVariant(s, acts, TODAY, "brief"));
    expect(isStale(s, r.ops)).toBe(false);
    s.schedule.overrides["game-max:game-stop"] = { min: at(2, 45) };
    expect(isStale(s, r.ops)).toBe(true);
  });
  it("partial undo after a conflicting edit", () => {
    const s = fresh();
    s.settings.gameBreakMin = 0;
    const r = okOf(compileVariant(s, acts, TODAY, "brief"));
    applyOps(s, r.ops);
    s.settings.gameBreakMin = 90; // user changed it afterwards
    const u = undoOps(s, r.ops);
    expect(u.partial).toBe(true);
    expect(u.inverse).toHaveLength(1);
    applyOps(s, u.inverse);
    expect(s.schedule.overrides["game-max:game-stop"]).toBeUndefined();
    expect(s.settings.gameBreakMin).toBe(90);
  });
  it("lost after mergeStates(remoteNewer, local)", () => {
    const local = fresh();
    const remote = structuredClone(local);
    const r = okOf(compileVariant(local, [acts[0]], TODAY, "brief"));
    applyOps(local, r.ops);
    local.updatedAt = 10;
    remote.updatedAt = 20;
    remote.settings.goodDay = 0.8;
    const m = mergeStates(remote, local);
    expect(lostOps(m, { ops: r.ops })).toHaveLength(1);
    expect(lostOps(local, { ops: r.ops })).toHaveLength(0);
  });
});

describe("describeOps / budgetDelta", () => {
  it("Thai before -> after lines", () => {
    const s = fresh();
    const lines = (a: BrainAction[], mode: Mode = "brief") => okOf(compileVariant(s, a, TODAY, mode)).diff.map((d) => d.text);
    expect(lines([{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }])).toEqual(["เกมจัดเต็ม · หยุดเกมแข่ง 03:00 -> 02:30"]);
    expect(lines([{ k: "set_day_template", date: "2026-10-21", tpl: "game-max" }])).toEqual(["แผนวันพุธ 21 ต.ค.: วันลุยเซิฟ -> เกมจัดเต็ม"]);
    expect(lines([{ k: "set_voice_rest", date: "2026-10-23" }])).toEqual(["พักเสียง: ศุกร์ 23 ต.ค."]);
    expect(lines([{ k: "plan_deload", from: "2026-10-21", days: 7 }])).toEqual(["สัปดาห์ deload: 21-27 ต.ค."]);
    expect(lines([{ k: "set_week_slot", dow: 3, tpl: "rest" }], "weekly")).toEqual(["แผนสัปดาห์ วันพุธ: วันลุยเซิฟ -> วันพัก (พักเสียง พักยิม)"]);
    const kg = weightStats(s, "9999-12-31").cur;
    const k0 = targets(s.profile, kg, 0).kcal, k1 = targets(s.profile, kg, 200).kcal;
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(lines([{ k: "kcal_adjust", delta: 200 }])).toEqual([`เป้าแคลอรี่: ${fmt(k0)} -> ${fmt(k1)} kcal`]);
    expect(k1 - k0).toBe(200);
  });
  it("canonical labels never use user names or titles", () => {
    const s = fresh();
    s.schedule.templates = [{ id: "u-abc", name: "SENTINEL_T", from: "game-max" }];
    s.schedule.overrides["u-abc:game-stop"] = { title: "SENTINEL_O" };
    const r = okOf(compileAction(s, { k: "move_item", tpl: "u-abc", item: "game-stop", delta: -15 }, TODAY, "brief"));
    expect(describeOps(s, r.ops, { canonical: true })[0].text).toBe("เกมจัดเต็ม (สำเนา #1) · หยุดเกมแข่ง 03:00 -> 02:45");
    expect(describeOps(s, r.ops)[0].text).toBe("SENTINEL_T · SENTINEL_O 03:00 -> 02:45");
  });
  it("budgetDelta for a game-stop move", () => {
    const s = fresh(); // next 7 days have 2 game-max days (Tue today, Fri)
    const r = okOf(compileVariant(s, [{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }], TODAY, "brief"));
    expect(budgetDelta(s, r.ops, TODAY)).toBe("เกม -1 ชม.");
    const v = okOf(compileVariant(s, [{ k: "set_voice_rest", date: "2026-10-22" }], TODAY, "brief"));
    expect(budgetDelta(s, v.ops, TODAY)).toBe("ร้อง -45 น.");
  });
});

describe("move_item on work templates", () => {
  it("never moves a pre-shift item so it ends inside the work shift", () => {
    const s = perfect();
    for (const delta of [30, 60]) {
      const r = compileAction(s, { k: "move_item", tpl: "work-plus", item: "snack", delta }, TODAY, "brief");
      expect(r.ok).toBe(false);
    }
    const ok = compileAction(s, { k: "move_item", tpl: "work-plus", item: "snack", delta: -15 }, TODAY, "brief");
    expect(ok.ok).toBe(true);
  });
});

describe("v1.4 stream invariants", () => {
  const no = (r: Compiled) => (r.ok ? "" : r.reason);
  it("the gym and dinner may not run into go-live", () => {
    expect(no(c(fresh(), { k: "move_item", tpl: "stream-gym", item: "gym", delta: 60 }))).toBe("ลำดับเสีย: ยิมจบก่อนเริ่มไลฟ์อย่างน้อย 1 ชม.");
    expect(no(c(fresh(), { k: "move_item", tpl: "stream-gym", item: "meal3", delta: 60 }))).toBe("ลำดับเสีย: มื้อเย็นก่อนเริ่มไลฟ์");
    expect(c(fresh(), { k: "move_item", tpl: "stream-gym", item: "gym", delta: -30 }).ok).toBe(true);
  });
  it("set_week_slot counts stream-rest as the week's rest day", () => {
    const s = fresh();
    s.settings.weekPlan = ["stream-rest", "stream-gym", "stream-gym", "stream-mc", "stream-gym", "stream-gym", "stream-marathon"];
    expect(no(c(s, { k: "set_week_slot", dow: 0, tpl: "stream-gym" }, "weekly"))).toBe("จะไม่เหลือวันไม่ยกหรือวันพักในสัปดาห์");
    expect(c(s, { k: "set_week_slot", dow: 3, tpl: "stream-gym" }, "weekly").ok).toBe(true);
  });
});

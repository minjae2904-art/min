import { describe, expect, it } from "vitest";
import { addDays, at } from "../date";
import { normalize, type State } from "../model";
import { CORE, compileVariant } from "../brain/actions";
import { brainReport, composeBrief, rulesBrief } from "../brain/report";
import { isBrainAction } from "../brain/state";
import type { AiPlan, AppliedRec, Mode, RuleId } from "../brain/types";
import { build, dowOf, perfect, TODAY } from "./brain-fixtures";

const rules = (s: State, mode: Mode = "brief") => brainReport(s, TODAY, mode).candidates;
const ruleIds = (s: State, mode: Mode = "brief") => rules(s, mode).map((c) => c.rule);

// One fixture per rule trigger (built from real templates).
const FIX: Record<RuleId, () => State> = {
  R01: () => build(14, (d) => ({ tpl: "game-max", bedLate: d >= "2026-10-17" ? 80 : 0, sleepH: 6.5 })),
  R02: () => build(21, (_d, i) => ({ sleepH: i % 2 ? 5 : 10 })),
  R03: () => build(14, (d) => ({ tpl: "balanced", sleepH: 5, untick: d === TODAY ? ["gym"] : [] })),
  R04: () => build(28, (d) => ({ tpl: [1, 2, 3, 4, 5].includes(dowOf(d)) ? "work-plus" : "balanced", bedLate: dowOf(d) === 5 || dowOf(d) === 6 ? 150 : 0 })),
  R05: () => build(28, () => ({}), { kg: () => 67 }),
  R06: () => build(28, () => ({}), { kg: (i) => 67 + i * 0.15 }),
  R07: () => build(14, () => ({ tpl: "mc-build", late: { meal3: 70 } })),
  R08: () => build(14, () => ({ water: 500 })),
  R09: () => build(14, () => ({ tpl: "balanced", late: { gym: 60 } })),
  R10: () => build(14, () => ({ tpl: "balanced", late: { meal2: 40 } })),
  R11: () => perfect(42),
  R12: () => build(14, () => ({ tpl: "balanced" })),
  R13: () => build(14, () => ({}), { extra: (s) => { s.schedule.overrides["balanced:sing"] = { min: at(19, 15) }; } }),
  R14: () => build(14, () => ({ untick: ["sing"] })),
  R15: () => build(14, (d) => ({ trade: d === "2026-10-15" ? { count: 3, result: "win" } : null })),
  R16: () => build(14, (d) => ({ trade: d === "2026-10-15" ? { count: 2, result: "loss" } : null })),
  R17: () => build(14, () => ({ untick: ["mc", "mc2"] })),
  R18: () => build(35, (_d, i) => ({ checkin: i >= 28 ? [2, 2, 3] : [4, 4, 4] })),
  R19: () => build(14, (d) => (d === "2026-10-18" || d === "2026-10-19" ? { untick: ["posture"] } : {})),
  R20: () => build(14, () => ({}), { extra: (s) => { s.schedule.overrides["balanced:weigh"] = { min: at(11, 30) }; } }),
  R21: () => { const s = perfect(); s.settings.weekPlan = Array(7).fill("balanced"); delete s.days[TODAY]; return s; },
  R22: () => build(14, () => ({ bedLate: null, sleepH: null })),
};
const WEEKLY: RuleId[] = ["R20", "R21"];

describe("runRules triggers", () => {
  it("a perfect month has no candidates", () => {
    expect(ruleIds(perfect(), "weekly")).toEqual([]);
  });
  for (const [rule, f] of Object.entries(FIX) as [RuleId, () => State][]) {
    it(`${rule} fires on its trigger`, () => {
      expect(ruleIds(f(), WEEKLY.includes(rule) ? "weekly" : "brief")).toContain(rule);
    });
  }
  it("R11 counts from the last 7-day deload slot after its record left the applied cap", () => {
    const s = FIX.R11();
    s.brain.deload = { from: "2026-10-06", to: "2026-10-12" };
    expect(ruleIds(s)).not.toContain("R11");
  });
  it("weekly-only candidates are absent in brief mode", () => {
    for (const r of WEEKLY) expect(ruleIds(FIX[r](), "brief")).not.toContain(r);
  });
  it("safety rules sort first", () => {
    const c = rules(FIX.R18());
    expect(c[0].rule).toBe("R18");
    expect(c[0].safety).toBe(true);
    expect(c[0].sev).toBe(3);
  });
  it("R03 v1 is absent when a ticked id would disappear", () => {
    const tick = FIX.R03();
    const r03 = rules(tick).find((c) => c.rule === "R03")!; // today balanced, mc/sing ticked -> rest would drop them
    expect(r03.variants.map((v) => v.actions[0].k)).toEqual(["plan_deload"]);
    const few = FIX.R03();
    few.days[TODAY].done = { weigh: 1, meal1: 1 };
    expect(rules(few).find((c) => c.rule === "R03")!.variants.map((v) => v.actions[0].k)).toEqual(["plan_deload", "set_day_template"]);
  });
  it("R05 variants are graded and capped by the kcal ceiling", () => {
    const s = FIX.R05();
    expect(rules(s).find((c) => c.rule === "R05")!.variants.map((v) => v.actions[0])).toEqual([150, 200, 250].map((delta) => ({ k: "kcal_adjust", delta })));
    s.settings.kcalAdjust = 400;
    expect(rules(s).find((c) => c.rule === "R05")!.variants.map((v) => v.actions[0])).toEqual([{ k: "kcal_adjust", delta: 100 }]);
  });
});

describe("identity and filters", () => {
  it("ids are stable for the same state and change with an action parameter", () => {
    const a = rules(FIX.R05()).find((c) => c.rule === "R05")!.id;
    expect(rules(FIX.R05()).find((c) => c.rule === "R05")!.id).toBe(a);
    expect(a).toMatch(/^R05:[0-9a-z]+$/);
    const s = FIX.R05();
    s.settings.kcalAdjust = 400;
    expect(rules(s).find((c) => c.rule === "R05")!.id).not.toBe(a);
  });
  it("snooze and mute hide a sig; an expired snooze does not", () => {
    const s = FIX.R16();
    const sig = rules(s).find((c) => c.rule === "R16")!.sig;
    s.brain.snooze[sig] = addDays(TODAY, 2);
    expect(ruleIds(s)).not.toContain("R16");
    s.brain.snooze[sig] = "mute";
    expect(ruleIds(s)).not.toContain("R16");
    s.brain.snooze[sig] = addDays(TODAY, -1);
    expect(ruleIds(s)).toContain("R16");
  });
  const active = (rule: string, area: AppliedRec["area"]): AppliedRec => ({
    id: "a-zz", cid: `${rule}:x`, rule, area, at: 1, date: addDays(TODAY, -2), actions: [{ k: "tip", ref: "mvd" }], ops: [],
    eval: { metric: "area:sleep", windowDays: 7, dir: 1, min: 5, base: 50 },
  });
  it("cooldown and one experiment per area; safety bypasses the area rule", () => {
    const s = FIX.R16();
    s.brain.applied = [active("R16", "trading")];
    expect(ruleIds(s)).not.toContain("R16");
    const t = FIX.R15();
    t.brain.applied = [active("R16", "trading")];
    expect(ruleIds(t)).not.toContain("R15"); // same area, different rule
    const u = FIX.R03();
    u.brain.applied = [active("R02", "sleep")];
    expect(ruleIds(u)).toContain("R03");
    const old = FIX.R16();
    old.brain.applied = [{ ...active("R16", "trading"), date: addDays(TODAY, -9) }];
    expect(ruleIds(old)).toContain("R16");
  });
  it("paused areas drop their candidates", () => {
    const s = FIX.R16();
    s.settings.areaPriority.trading = 0;
    expect(ruleIds(s)).not.toContain("R16");
  });
  it("3 rejects in 60 days demote a rule; focus raises it", () => {
    const s = FIX.R16();
    const p0 = rules(s).find((c) => c.rule === "R16")!.prio;
    const now = Date.parse(TODAY + "T12:00:00+07:00");
    s.brain.decisions = [1, 2, 3].map((i) => ({ sig: "R16:revenge", rule: "R16", d: "r" as const, at: now - i * 86_400_000 }));
    expect(rules(s).find((c) => c.rule === "R16")!.prio).toBeCloseTo(p0 * 0.3, 2);
    const f = FIX.R16();
    f.settings.areaPriority.trading = 2;
    expect(rules(f).find((c) => c.rule === "R16")!.prio).toBeCloseTo(p0 * 1.5, 2);
  });
  it("at most 8 candidates with unique sigs on a messy month", () => {
    const s = build(35, (d, i) => ({ tpl: "balanced", sleepH: i % 2 ? 5 : 9, late: { gym: 60, meal2: 40 }, trade: { count: 2, result: "loss" }, water: 300,
      sing: { strain: true }, checkin: i >= 28 ? [2, 2, 2] : [4, 4, 4], untick: d === TODAY ? ["gym"] : ["posture"] }), { kg: () => 67 });
    for (const mode of ["brief", "weekly"] as Mode[]) {
      const c = rules(s, mode);
      expect(c.length).toBeLessThanOrEqual(8);
      expect(new Set(c.map((x) => x.sig)).size).toBe(c.length);
    }
  });
});

describe("property: every candidate is safe and compiles", () => {
  const all = [...Object.values(FIX).map((f) => f()), perfect(), normalize({})];
  it("no forbidden action, no trade increase, no work-in/out move, no past date, no core disable", () => {
    let n = 0;
    for (const s of all) for (const mode of ["brief", "weekly"] as Mode[]) for (const c of rules(s, mode)) for (const v of c.variants) {
      n++;
      expect(compileVariant(s, v.actions, TODAY, mode).ok).toBe(true);
      for (const a of v.actions) {
        expect(isBrainAction(a)).toBe(true);
        expect(JSON.stringify(a)).not.toMatch(/count|goodDay|goalKg|identity|pin|shiftMin|dndUntil/);
        if ("item" in a) expect(["work-in", "work-out"]).not.toContain(a.item);
        if (a.k === "toggle_item" && !a.on) expect(CORE.has(a.item)).toBe(false);
        if (a.k === "set_flag") expect(a.key).toBe("notifyLastMatch");
        if ("date" in a) expect(a.date >= TODAY).toBe(true);
        if (a.k === "plan_deload") expect(a.from >= TODAY).toBe(true);
        if (a.k === "kcal_adjust") expect(Math.abs(a.delta)).toBeLessThanOrEqual(250);
        if (a.k === "move_item") { expect(Math.abs(a.delta)).toBeLessThanOrEqual(60); expect(Math.abs(a.delta) % 15).toBe(0); }
      }
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe("briefs", () => {
  it("rulesBrief never returns an empty headline", () => {
    for (const s of [...Object.values(FIX).map((f) => f()), perfect(), normalize({}), build(1)]) {
      for (const mode of ["brief", "weekly"] as Mode[]) expect(rulesBrief(brainReport(s, TODAY, mode), mode).headline.length).toBeGreaterThan(5);
    }
  });
  it("with fewer than 3 logged days the low-data copy appears", () => {
    const b = rulesBrief(brainReport(build(2), TODAY), "brief");
    expect(b.headline).toBe("บันทึกอีก 2 วันเพื่อเริ่มดูสมดุล");
    expect(rulesBrief(brainReport(normalize({}), TODAY), "brief").headline).toBe("บันทึกอีก 3 วันเพื่อเริ่มดูสมดุล");
  });
  it("brief shows 2 items, weekly 5", () => {
    const r = brainReport(FIX.R18(), TODAY, "weekly");
    expect(rulesBrief(r, "brief").items.length).toBeLessThanOrEqual(2);
    expect(rulesBrief(r, "weekly").items.length).toBeLessThanOrEqual(5);
  });
  const plan = (picks: AiPlan["picks"]): AiPlan => ({ headline: "AI หัวข้อ", summary: "สรุป", focus: ["sleep"], areaNotes: [{ area: "sleep", note: "n" }], picks, tips: [], question: "", dataGaps: [] });
  it("composeBrief maps picks to local candidates, drops unknown ids, falls back to rules", () => {
    const s = FIX.R18();
    const r = brainReport(s, TODAY, "brief");
    const local = r.candidates[1];
    const b = composeBrief(r, plan([{ id: "R99:fake", variant: 0, why: "x", ifThen: "y" }, { id: local.id, variant: 9, why: "AI why", ifThen: "ถ้า a แล้ว b" }]), "brief", s.brain, TODAY);
    expect(b.src).toBe("ai");
    expect(b.items.map((x) => x.cand.id)).toEqual([local.id]);
    expect(b.items[0]).toMatchObject({ variant: 0, aiWhy: "AI why" });
    expect(b.summary).toBe(""); // brief mode
    expect(b.notes).toEqual([]);
    const fb = composeBrief(r, plan([{ id: "R99:fake", variant: 0, why: "", ifThen: "" }]), "brief", s.brain, TODAY);
    expect(fb.items.map((x) => x.cand.id)).toEqual(rulesBrief(r, "brief").items.map((x) => x.cand.id));
    const none = composeBrief(r, null, "brief", s.brain, TODAY);
    expect(none.src).toBe("rules");
    expect(none.headline).toBe(rulesBrief(r, "brief").headline);
  });
  it("composeBrief hides snoozed sigs, applied cids and weekly-only picks in brief", () => {
    const s = FIX.R21();
    const w = brainReport(s, TODAY, "weekly");
    const weekly = w.candidates.find((c) => c.weeklyOnly)!;
    expect(composeBrief(w, plan([{ id: weekly.id, variant: 0, why: "", ifThen: "" }]), "brief", s.brain, TODAY).items.some((x) => x.cand.id === weekly.id)).toBe(false);
    const r = brainReport(FIX.R18(), TODAY, "brief");
    const first = r.candidates[0];
    const brain = { ...s.brain, snooze: { [first.sig]: "mute" }, decisions: [{ sig: r.candidates[1].sig, rule: r.candidates[1].rule, cid: r.candidates[1].id, d: "a" as const, at: 1 }] };
    const ids = composeBrief(r, null, "brief", brain, TODAY).items.map((x) => x.cand.id);
    expect(ids).not.toContain(first.id);
    expect(ids).not.toContain(r.candidates[1].id);
  });
  it("composeBrief filters hidden candidates before capping, and falls back when every AI pick is hidden", () => {
    const base = brainReport(FIX.R18(), TODAY, "brief");
    const pool = Object.values(FIX).flatMap((f) => rules(f())).filter((c) => !c.weeklyOnly).filter((c, i, a) => a.findIndex((x) => x.sig === c.sig) === i);
    const [c0, c1, c2, c3] = pool;
    const r = { ...base, candidates: [c0, c1, c2, c3] };
    const brain = { ...FIX.R18().brain, snooze: { [c0.sig]: "mute" }, decisions: [{ sig: c1.sig, rule: c1.rule, cid: c1.id, d: "a" as const, at: 1 }] };
    expect(composeBrief(r, null, "brief", brain, TODAY).items.map((x) => x.cand.id)).toEqual([c2.id, c3.id]);
    const ai = composeBrief(r, plan([{ id: c0.id, variant: 0, why: "", ifThen: "" }, { id: c1.id, variant: 0, why: "", ifThen: "" }]), "brief", brain, TODAY);
    expect(ai.items.map((x) => x.cand.id)).toEqual([c2.id, c3.id]);
  });
});

describe("copy tone", () => {
  it("candidate and table copy is invitational, Thai, without emoji or directives", async () => {
    const { TIP_TEXT, MICRO_STEPS } = await import("../brain/copy");
    const texts = [...Object.values(TIP_TEXT), ...Object.values(MICRO_STEPS)];
    for (const f of Object.values(FIX)) for (const c of rules(f(), "weekly")) texts.push(c.title, c.why, c.ifThen, ...c.variants.map((v) => v.label));
    for (const t of texts) {
      expect(t).not.toMatch(/ต้อง|ควร|ห้าม|อย่า(?!ง)/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });
});

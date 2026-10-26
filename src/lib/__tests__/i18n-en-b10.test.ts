// Round E batch 10: English output of honest.ts, ready.ts, rituals.ts and brain/actions.ts (Thai stays covered by the
// existing tests). Text owned by other batches (item titles, template labels) is stripped or not asserted here.
import { describe, expect, it } from "vitest";
import { msgs, withLang } from "../../i18n";
import * as L10 from "../../i18n/msg/lib-10";
import * as LB10 from "../../i18n/msg/lib-brain-10";
import { at } from "../date";
import { normalize, type State } from "../model";
import { rangeStats } from "../stats";
import { budgetDelta, compileAction, compileVariant, describeOps, type Compiled } from "../brain/actions";
import { CONF_TEXT, OBS_NOTE, aboutMin, etaRange, honestInsights, kgRate, needText, obsNote, weightHint } from "../honest";
import { READY_LABEL, readyOf } from "../ready";
import { overcommit, planLines } from "../rituals";
import { TODAY, build, perfect } from "./brain-fixtures";

const THAI = /[\u0E00-\u0E7F]/;
const en = <T,>(fn: () => T) => withLang("en", fn);
const okOf = (r: Compiled) => { if (!r.ok) throw new Error(r.reason); return r; };

describe("honest (en)", () => {
  it("helpers", () => {
    expect(en(() => needText(1))).toBe("Not enough data yet · Log 1 more day to start seeing a trend");
    expect(en(() => needText(3))).toBe("Not enough data yet · Log 3 more days to start seeing a trend");
    expect(en(() => [kgRate(0.26), kgRate(-0.34), kgRate(0.01)])).toEqual(["+0.3 kg/week", "-0.3 kg/week", "Steady"]);
    expect(en(() => [aboutMin(50), aboutMin(50, false)])).toEqual(["about ±45 min", "about 45 min"]);
    expect(en(() => ({ ...CONF_TEXT }))).toEqual({ none: "Not enough data yet", early: "Early trend", ok: "Clearer trend" });
    expect(CONF_TEXT.none).toBe("ยังไม่พอสรุป");
    expect(en(() => obsNote())).not.toMatch(THAI);
    expect(OBS_NOTE).toBe("เป็นสิ่งที่สังเกตจากข้อมูลของคุณ ไม่ได้บอกว่าอะไรเป็นสาเหตุ");
    const w = (weighIns: number, spanDays: number, perWeek = 0.4) => ({ weighIns, spanDays, perWeek });
    expect(en(() => [weightHint(null, 7), weightHint(w(1, 1), 7), weightHint(w(2, 1), 7), weightHint(w(6, 6), 7), weightHint(w(6, 6), 30), weightHint(w(6, 20), 30)])).toEqual([
      "No weigh-ins yet", "1 weigh-in · 4 more to see the rate", "2 weigh-ins · 3 more to see the rate",
      "6 weigh-ins · See the rate in the 30-day view", "6 weigh-ins · Weigh-ins need to span 10 days to see the rate", "+0.4 kg/week · 6 weigh-ins",
    ]);
  });
  it("etaRange uses English month names and Gregorian years", () => {
    const s = normalize({});
    s.profile = { ...s.profile, startKg: 67, goalKg: 85 };
    for (let i = 9; i >= 0; i--) s.weights.push({ date: new Date(Date.parse(TODAY + "T12:00:00Z") - i * 3 * 86_400_000).toISOString().slice(0, 10), kg: 67 + ((9 - i) * 3 * 0.5) / 7 });
    const r = en(() => etaRange(s, TODAY))!;
    expect(r).toMatch(/^Around [A-Z][a-z]+/);
    expect(r).toMatch(/20\d\d$/);
    expect(r).not.toMatch(THAI);
    expect(etaRange(s, TODAY)).toMatch(/^ราว /);
  });
  it("insight lines have no Thai outside quoted item titles", () => {
    for (const n of [3, 7, 14, 28]) {
      const s = build(n, (_d, i) => (i % 3 === 0 ? { ticks: "none" as const } : {}));
      const lines = en(() => honestInsights(rangeStats(s, TODAY, n), s));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        expect(l.text.replace(/"[^"]*"/g, "")).not.toMatch(THAI);
        if (l.tip) expect(l.tip).not.toMatch(THAI);
      }
    }
  });
});

describe("ready (en)", () => {
  it("labels, parts and need lines", () => {
    expect(en(() => Object.values(READY_LABEL)).every((v) => !THAI.test(v))).toBe(true);
    const s = normalize({});
    const H = 3_600_000, sleepAt = new Date("2026-11-09T00:30:00+07:00").getTime();
    s.days["2026-11-09"] = { type: "term-gym", done: {}, waterMl: 0, sleepAt };
    s.days["2026-11-10"] = { type: "term-gym", done: {}, waterMl: 0, wakeAt: sleepAt + 7.5 * H, checkin: { energy: 2, mood: 3, sleep: 3 } };
    const r = en(() => readyOf(s, "2026-11-10"));
    expect(r.parts[0].text).toBe("Slept about 7.5 h");
    expect(r.parts[5].text).toBe("Energy 2/5, mood 3/5");
    expect(r.need).toBe("4 more nights of sleep times needed (tap Going to bed / I'm up)");
    for (const p of r.parts) expect(p.text).not.toMatch(THAI);
    for (const x of r.missing) expect(x).not.toMatch(THAI);
  });
});

describe("rituals (en)", () => {
  const D = "2026-10-27";
  const mk = (type = "stream-gym"): State => {
    const s = normalize({});
    s.days[D] = { type, done: {}, waterMl: 0 };
    s.days["2026-10-28"] = { type, done: {}, waterMl: 0 };
    return s;
  };
  it("planLines and the overcommit info line", () => {
    const lines = en(() => planLines(mk(), D));
    expect(lines[0]).toMatch(/^Wake \d\d:\d\d · Sleep \d\d:\d\d$/);
    expect(lines.at(-1)).toMatch(/^\d+ items$/);
    for (const l of lines) expect(l).not.toMatch(THAI);
    const s = mk();
    s.days[D].shiftMin = 90;
    expect(en(() => overcommit(s, D, at(10)))!.info).toBe("Today's plan leaves about 6.5 h of sleep");
    const b = mk("balanced");
    b.days[D].shiftMin = 90;
    expect(en(() => overcommit(b, D, at(14)))!.fixes[0].label).toBe("Back to plan (undo +90 min shift)");
  });
});

describe("brain actions (en)", () => {
  it("reasons, diff labels and budget delta", () => {
    const s = perfect(21);
    expect(en(() => compileAction(s, { k: "move_item", tpl: "game-max", item: "game-stop", delta: 0 }, TODAY, "brief"))).toEqual({ ok: false, reason: "No changes" });
    expect(en(() => compileAction(s, { k: "set_week_slot", dow: 3, tpl: "rest" }, TODAY, "brief"))).toEqual({ ok: false, reason: "The week plan can change during the weekly review" });
    expect(en(() => compileVariant(s, [], TODAY, "brief"))).toEqual({ ok: false, reason: "Empty" });
    const kc = okOf(en(() => compileVariant(s, [{ k: "kcal_adjust", delta: 200 }], TODAY, "brief")));
    expect(kc.diff[0].text).toMatch(/^Calorie target: [\d,]+ -> [\d,]+ kcal$/);
    const dl = okOf(en(() => compileVariant(s, [{ k: "plan_deload", from: "2026-10-21", days: 7 }], TODAY, "brief")));
    expect(dl.diff[0].text).toBe("Deload week: 21-27 Oct");
    const vr = okOf(en(() => compileVariant(s, [{ k: "set_voice_rest", date: "2026-10-22" }], TODAY, "brief")));
    expect(vr.diff[0].text).toBe("Voice rest: Thu 22 Oct");
    expect(en(() => budgetDelta(s, vr.ops, TODAY))).toBe("Singing -45 min");
    const gs = okOf(compileVariant(s, [{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }], TODAY, "brief"));
    expect(en(() => budgetDelta(s, gs.ops, TODAY))).toBe("Gaming -1 h");
    expect(en(() => describeOps(s, [{ t: "setting", key: "waterEveryMin", before: 60, after: 90 }])[0].text)).toBe("Drink water reminder: Every 60 min -> Every 90 min");
    expect(en(() => describeOps(s, [{ t: "setting", key: "notifyLastMatch", before: false, after: true }])[0].text)).toBe("Last match notification: Off -> On");
  });
});

describe("batch 10 dictionaries", () => {
  it("every en value differs from its key and has no Thai", () => {
    const check = (keys: string[], get: (k: string) => string) => {
      for (const k of keys) { const v = get(k); expect(v).not.toBe(k); expect(v).not.toMatch(THAI); }
    };
    const a = msgs(L10), b = msgs(LB10);
    check(Object.keys(L10.th), (k) => a.in("en", k as keyof typeof L10.th));
    check(Object.keys(LB10.th), (k) => b.in("en", k as keyof typeof LB10.th));
  });
});

// Round E batch 6: English output of reminders.ts, trade.ts and brain/rules.ts (their own copy; other batches' text is
// checked at integration). Thai output is covered by the existing tests.
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n";
import * as L6 from "../../i18n/msg/lib-6";
import * as LB6 from "../../i18n/msg/lib-brain-6";
import * as Notif from "../../i18n/msg/app-settings-notifications";
import { at } from "../date";
import { DEFAULT_STATE, normalize, type DayLog, type State } from "../model";
import { dueReminders, groupReminders, type Reminder } from "../reminders";
import { GATE, TRADE_RESULT, tradeSub } from "../trade";
import { brainReport } from "../brain/report";
import { build, perfect, TODAY } from "./brain-fixtures";

const THAI = /[\u0E00-\u0E7F]/;
const D = "2026-10-20"; // Tuesday
const T = (h: number, m = 0) => new Date(`${D}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
const state = (over: Partial<State["settings"]> = {}): State => normalize({ settings: { ...DEFAULT_STATE.settings, followUpMin: 30, ...over } });
const day = (o: Partial<DayLog> = {}) => ({ type: "work", done: {}, waterMl: 0, ...o }) as DayLog;

describe("trade (en)", () => {
  it("gate and result labels follow the language, ids stay", () => {
    const en = withLang("en", () => GATE.map(([k, l]) => [k, l]));
    expect(en).toEqual([["plan", L6.en["trade.gate.plan"]], ["stop", L6.en["trade.gate.stop"]], ["size", L6.en["trade.gate.size"]]]);
    expect(withLang("en", () => TRADE_RESULT.map(([k]) => k))).toEqual(["win", "loss", "be", "open"]);
    for (const [, l] of withLang("en", () => [...TRADE_RESULT])) expect(l).not.toMatch(THAI);
    expect(GATE[0][1]).toBe(L6.th["trade.gate.plan"]); // ambient th outside withLang
  });
  it("tradeSub has no Thai and keeps the user's note as typed", () => {
    const note = "บันทึกของฉัน"; // user text is never translated
    const sub = (t: DayLog["trade"]) => withLang("en", () => tradeSub(day({ trade: t })));
    expect(sub({ count: 0, result: "skip", note: "" } as DayLog["trade"])).toBe("Checked the chart, no setup, no trade · Done for today");
    expect(sub({ count: 1, result: "open", note: "" } as DayLog["trade"])).toBe("1 trade · Still open");
    expect(sub({ count: 2, result: "win", note: "" } as DayLog["trade"])).toBe("Done for today · Win · 2 trades");
    expect(sub({ count: 7, result: "loss", note: "" } as DayLog["trade"])).toBe("Done for today · Loss · 5+ trades");
    expect(sub({ count: 1, result: "be", note } as DayLog["trade"])).toBe(`Done for today · Breakeven · ${note}`);
  });
});

describe("reminders (en)", () => {
  it("briefing, summary and water copy come out in English", () => {
    const s = state();
    s.days[D] = day();
    const all = [at(13, 5), at(15, 5), at(17, 5), at(19, 5), at(21, 5), at(23, 5), at(1, 5), at(4, 45)].flatMap((m) => withLang("en", () => dueReminders(s, T(Math.floor(m / 60) % 24, m % 60)).reminders));
    const brief = withLang("en", () => dueReminders(s, T(13, 5))).reminders.find((r) => r.key === "briefing")!;
    expect(brief.title).toMatch(/Today's plan$/);
    expect(brief.body).toContain(L6.en["reminders.brief.checkin"]);
    expect(brief.body).toMatch(/\d+ items/);
    expect(brief.body).toMatch(/Water \d\.\d L/);
    expect(all.length).toBeGreaterThan(0);
    // Every reminder text built from this module's keys carries no Thai of its own.
    for (const v of Object.values(L6.en)) expect(v).not.toMatch(THAI);
  });
  it("private notifications use the English placeholder", () => {
    const s = state({ privateNotifications: true });
    s.days[D] = day();
    const r = withLang("en", () => dueReminders(s, T(13, 5))).reminders;
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect([x.title, x.body]).toEqual(["Krob", "You have something to do"]);
    // Settings quotes the same lock-screen text it promises.
    expect(Notif.en["notifications.private.sub"]).toContain(L6.en["reminders.private.body"]);
    expect(Notif.th["notifications.private.sub"]).toContain(L6.th["reminders.private.body"]);
  });
  it("groupReminders joins with Also: and a grouped phase push lists each item once", () => {
    const list: Reminder[] = [
      { key: "phase:morning", title: "13:00 · Morning", body: "To do: Meal 1, Whey", level: "info", priority: 1 },
      { key: "meal1:due", title: "13:00 · Meal 1", body: "x", level: "due", priority: 2 },
      { key: "whey:due", title: "13:00 · Whey", body: "x", level: "due", priority: 2 },
      { key: "gym:due", title: "13:00 · Gym", body: "x", level: "due", priority: 2 },
    ];
    const g = withLang("en", () => groupReminders(list, false));
    expect(g.body).toBe("To do: Meal 1, Whey\nAlso: Gym");
    // Real day: every minute where a phase notice groups with due items lists each title exactly once.
    const s = state();
    s.days[D] = day();
    let grouped = 0;
    for (let m = 0; m < 1440; m++) {
      const rs = withLang("en", () => dueReminders(s, T(Math.floor(m / 60), m % 60)).reminders);
      if (!rs.length || !rs[0].key.startsWith("phase:") || rs.length < 2) continue;
      const body = withLang("en", () => groupReminders(rs, false)).body;
      for (const r of rs.slice(1).filter((x) => x.level === "due")) {
        const t = r.title.replace(/^\d\d:\d\d · /, "");
        expect(body.split(t).length - 1, `${m} ${t}`).toBe(1);
      }
      grouped++;
    }
    expect(grouped).toBeGreaterThan(0);
  });
});

describe("brain rules variant labels (en)", () => {
  it("every variant label of real candidates is an English rule label", () => {
    const enLabels = new Set(Object.values(LB6.en));
    const thLabels = new Set(Object.values(LB6.th));
    const fixtures = [
      build(14, (d) => ({ tpl: "game-max", bedLate: d >= "2026-10-17" ? 80 : 0, sleepH: 6.5 })),
      build(14, (d) => ({ tpl: "balanced", sleepH: 5, untick: d === TODAY ? ["gym"] : [] })),
      build(14, () => ({ water: 500 })),
      build(14, () => ({ untick: ["sing"] })),
      perfect(42),
    ];
    let n = 0;
    for (const s of fixtures) {
      for (const c of withLang("en", () => brainReport(s, TODAY, "weekly").candidates)) for (const v of c.variants) {
        if (thLabels.has(v.label)) throw new Error(`Thai label in en: ${v.label}`);
        if (enLabels.has(v.label)) { expect(v.label).not.toMatch(THAI); n++; }
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

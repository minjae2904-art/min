// v1.4 end-to-end: card -> taper -> reminders -> brain on the stream season. TZ is pinned by tz.ts.
import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { startStreamSeason } from "../actions";
import { dayFor, normalize, plannedType, type State } from "../model";
import { dueReminders } from "../reminders";
import { itemsFor } from "../schedule";
import { dayBudget } from "../stats";
import { WEEK_PRESETS } from "../templates";
import { brainReport } from "../brain/report";
import { T } from "../brain/math";
import { isSeason, planDays } from "../brain/signals";
import type { BrainAction, Mode } from "../brain/types";
import { build, dowOf } from "./brain-fixtures";

const STREAM = WEEK_PRESETS[3].days;
const LIVE_IDS = ["stream", "stream-prep", "stream-end"];
const atM = (date: string, min: number) => new Date(Date.parse(date + "T00:00:00+07:00") + min * 60_000);
const weighOf = (s: State, date: string) => itemsFor(s.schedule, dayFor(s, date), date).find((i) => i.id === "weigh")!.min;

function legacyThenSeason(taper: boolean) {
  const x = normalize({});
  x.days["2026-10-25"] = { type: "work", done: {}, waterMl: 0 };
  startStreamSeason(x, "2026-10-25", taper);
  return x;
}

describe("v1.4 taper path", () => {
  const x = legacyThenSeason(true);
  const dates = Array.from({ length: 8 }, (_, i) => addDays("2026-10-26", i));
  const want = [180, 150, 120, 90, 60, 30, 0, 0].map((m) => 570 + m);
  it("starts tomorrow and wakes 30 min earlier each day until 09:30", () => {
    expect(x.schedule.taper).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30 });
    expect(x.settings.job).toBe("no");
    expect(dates.map((d) => weighOf(x, d))).toEqual(want);
  });
  it("the server tick fires weigh:due at the tapered wake", () => {
    dates.forEach((d, i) => {
      expect(dueReminders(x, atM(d, want[i])).reminders.map((r) => r.key)).toContain("weigh:due");
      if (want[i] !== 570) expect(dueReminders(x, atM(d, 570)).reminders.map((r) => r.key)).not.toContain("weigh:due");
    });
  });
  it("no transition night is under 7.5 h, so no C9", () => {
    expect(Math.min(...planDays(x, "2026-10-25", 8).map((p) => p.sleepWinH))).toBeGreaterThanOrEqual(T.winH);
    expect(brainReport(x, "2026-10-25", "weekly").conflicts.map((c) => c.id)).not.toContain("C9");
  });
});

describe("v1.4 immediate path", () => {
  const x = legacyThenSeason(false);
  it("the first night is short (expected) and the brain does not swap week slots for it", () => {
    expect(x.schedule.taper).toBeNull();
    const r = brainReport(x, "2026-10-25", "weekly");
    expect(r.conflicts.find((c) => c.id === "C9")?.ev.minWinH).toBe(4.5);
    expect(r.candidates.flatMap((c) => c.variants.flatMap((v) => v.actions)).some((a) => a.k === "set_week_slot")).toBe(false);
  });
});

describe("v1.4 14 stream days", () => {
  const today = "2026-11-15";
  const season = (f: (d: string, i: number) => object = () => ({}), n = 14, wp: string[] = STREAM) => {
    const s = build(n, (d, i) => ({ tpl: wp[dowOf(d)], ...f(d, i) }), { today });
    s.settings.weekPlan = [...wp];
    s.settings.job = "no";
    return s;
  };
  const perfect = season();
  // a strained month (5 lifting days a week, then 5 short nights with low check-ins) so the rules propose rest days
  const rough = season((_d, i) => (i >= 30 ? { sleepH: 5, bedLate: 100, untick: ["gym"], checkin: [2, 2, 2] } : {}), 35, Array(7).fill("stream-gym"));
  const actionsOf = (s: State, mode: Mode): BrainAction[] => brainReport(s, today, mode).candidates.flatMap((c) => c.variants.flatMap((v) => v.actions));

  it("perfect days raise no C1, C5 or C9", () => {
    const ids = brainReport(perfect, today, "weekly").conflicts.map((c) => c.id);
    for (const id of ["C1", "C5", "C9"]) expect(ids).not.toContain(id);
  });
  it("streams are not leisure: with no game days leisure stays out of Balance", () => {
    const r = brainReport(perfect, today, "weekly");
    expect(r.areas.find((a) => a.key === "leisure")!.conf).toBeLessThan(T.conf);
    expect(r.balance.eligible).not.toContain("leisure");
  });
  it("no variant moves or toggles the live block", () => {
    for (const s of [perfect, rough]) for (const mode of ["brief", "weekly"] as Mode[]) {
      const bad = actionsOf(s, mode).filter((a) => (a.k === "move_item" || a.k === "reset_time" || a.k === "toggle_item") && LIVE_IDS.includes(a.item));
      expect(bad).toEqual([]);
    }
  });
  it("season dates and week slots only get season templates", () => {
    let n = 0;
    for (const s of [perfect, rough]) for (const mode of ["brief", "weekly"] as Mode[]) for (const a of actionsOf(s, mode)) {
      if (a.k === "set_day_template" && isSeason(s.schedule, plannedType(s, a.date))) { n++; expect(isSeason(s.schedule, a.tpl)).toBe(true); }
      if (a.k === "set_week_slot" && isSeason(s.schedule, s.settings.weekPlan[a.dow] ?? "")) { n++; expect(isSeason(s.schedule, a.tpl)).toBe(true); }
    }
    expect(n).toBeGreaterThan(0); // R18 (day) and R21 (week slot) fire on the strained month
  });
  it("every season day keeps at least 300 live minutes", () => {
    for (let i = 0; i < 21; i++) {
      const d = addDays("2026-11-02", i);
      expect(isSeason(perfect.schedule, dayFor(perfect, d).type)).toBe(true);
      expect(dayBudget(perfect.schedule, dayFor(perfect, d), d).stream).toBeGreaterThanOrEqual(300);
    }
  });
});

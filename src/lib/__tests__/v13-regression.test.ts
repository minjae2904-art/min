// v1.3 behaviour lock: written at 79eee3b before any v1.4 edit. Never update this snapshot with -u.
import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type ScheduleCfg } from "../model";
import { phases } from "../phase";
import { dueReminders } from "../reminders";
import { buildDay, maxDayShift, type Meal2 } from "../schedule";
import { dayBudget } from "../stats";
import { WEEK_PRESETS } from "../templates";

const IDS = ["balanced", "game-max", "mc-build", "rest", "work-plus", "work-game", "work", "off"];
const WORK = new Set(["work-plus", "work-game", "work"]);
const DATES = ["2026-10-27", "2026-11-02"];
const cfg: ScheduleCfg = {
  shiftMin: 30, overrides: {}, templates: [],
  custom: [
    { id: "c-off", title: "O", min: at(14), ring: "habit", days: "off" },
    { id: "c-both", title: "B", min: at(15), ring: "habit", days: "both" },
    { id: "c-work", title: "W", min: at(14, 30), ring: "body", days: "work" },
  ],
};
const s = normalize({ schedule: cfg });

describe("v1.3 regression", () => {
  for (const id of IDS) {
    for (const m of (WORK.has(id) ? ["A", "B", "C", undefined] : [undefined]) as (Meal2 | undefined)[]) {
      it(`${id} / ${m ?? "-"}`, () => {
        const out = DATES.map((date) => {
          const d = { type: id, meal2: m, done: {}, waterMl: 0 };
          const b = dayBudget(cfg, d, date);
          return {
            date,
            items: buildDay(id, m, cfg, 0, { date }).map((i) => [i.id, i.min]),
            phases: phases(s, d, date).map((p) => [p.key, p.start]),
            budget: [b.game, b.sing, b.singDays, b.mc, b.gym, b.cardio, b.trade, b.work, b.days],
          };
        });
        expect({ maxDayShift: maxDayShift(id, m, cfg), out }).toMatchSnapshot();
      });
    }
  }
  it("dueReminders keys for every minute of 2026-11-02 (nojob preset)", () => {
    const st = normalize({});
    st.settings.weekPlan = [...WEEK_PRESETS[1].days];
    const t0 = Date.parse("2026-11-02T08:00:00+07:00");
    const got: Record<number, string[]> = {};
    for (let k = 0; k < 1440; k++) {
      const now = new Date(t0 + k * 60_000);
      const keys = dueReminders(st, now, now.getTime()).reminders.map((r) => r.key);
      if (keys.length) got[480 + k] = keys;
    }
    expect(got).toMatchSnapshot();
  });
});

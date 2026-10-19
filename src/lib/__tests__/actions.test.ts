import { describe, expect, it } from "vitest";
import { applyWeekPlan, deleteTemplate, duplicateTemplate, markSleep, setDayTemplate, setDone, setVoiceRest } from "../actions";
import { at } from "../date";
import { normalize } from "../model";
import { buildDay } from "../schedule";
import { introPreset, WEEK_PRESETS } from "../templates";

const item = (type: string, id: string) => buildDay(type, undefined, undefined, 0, { all: true }).find((i) => i.id === id)!;

describe("actions with templates", () => {
  it("setDone logs the rotation for gym and R for cardio", () => {
    const s = normalize({});
    setDayTemplate(s, "2026-10-19", "balanced");
    setDone(s, "2026-10-19", item("balanced", "gym"), true);
    setDayTemplate(s, "2026-10-18", "rest");
    setDone(s, "2026-10-18", item("rest", "cardio"), true);
    expect(s.workouts).toEqual([{ date: "2026-10-19", code: "D1" }, { date: "2026-10-18", code: "R" }]);
    expect(s.days["2026-10-19"].type).toBe("balanced");
  });
  it("markSleep pauses until tomorrow's template wake-up", () => {
    const s = normalize({});
    s.settings.weekPlan[3] = "rest"; // 2026-10-21 is a Wednesday
    s.schedule.overrides["rest:weigh"] = { min: at(14) };
    const now = Date.parse("2026-10-21T04:00:00+07:00");
    markSleep(s, "2026-10-20", true, now);
    expect(s.settings.dndUntil).toBe(now + 600 * 60_000);
  });
  it("setVoiceRest sets and clears the flag", () => {
    const s = normalize({});
    setVoiceRest(s, "2026-10-20", true);
    expect(s.days["2026-10-20"].voiceRest).toBe(true);
    setVoiceRest(s, "2026-10-20", false);
    expect(s.days["2026-10-20"].voiceRest).toBeUndefined();
  });
  it("duplicateTemplate copies overrides and custom items under new ids", () => {
    const s = normalize({});
    s.schedule.custom = [{ id: "c1", title: "Stretch", min: at(14), ring: "habit", days: "balanced" }, { id: "c2", title: "Walk", min: at(17), ring: "body", days: "off" }];
    s.schedule.overrides = { "balanced:sing": { min: at(15) }, "balanced:c1": { remind: false }, "rest:sing": { min: at(16) } };
    const id = duplicateTemplate(s, "balanced", "  Mine  ", 1000);
    expect(id).toBe("u-rs");
    expect(s.schedule.templates).toEqual([{ id, name: "Mine", from: "balanced" }]);
    const copy = s.schedule.custom.find((c) => c.days === id)!;
    expect(copy.id).toBe("c-rs0");
    expect(s.schedule.custom).toHaveLength(3);
    expect(s.schedule.overrides[`${id}:sing`]).toEqual({ min: at(15) });
    expect(s.schedule.overrides[`${id}:c-rs0`]).toEqual({ remind: false });
    expect(Object.keys(s.schedule.overrides)).toHaveLength(5);
    expect(duplicateTemplate(s, "balanced", "", 1000)).toBe("u-rt");
    expect(s.schedule.templates?.[1].name).toBe("วันสมดุล");
  });
  it("deleteTemplate removes a user template and rewrites its days", () => {
    const s = normalize({});
    const id = duplicateTemplate(s, "game-max", "x", 5000);
    s.schedule.custom.push({ id: "c9", title: "x", min: at(14), ring: "habit", days: id });
    s.schedule.overrides[`${id}:sing`] = { enabled: false };
    applyWeekPlan(s, [id, null, "rest"]);
    setDayTemplate(s, "2026-10-18", id);
    expect(deleteTemplate(s, "balanced")).toBe(false);
    expect(deleteTemplate(s, id)).toBe(true);
    expect(s.schedule.templates).toEqual([]);
    expect(s.schedule.custom).toEqual([]);
    expect(s.schedule.overrides).toEqual({});
    expect(s.settings.weekPlan).toEqual([null, null, "rest", null, null, null, null]);
    expect(s.days["2026-10-18"].type).toBe("game-max");
  });
  it("applyWeekPlan fills 7 slots and marks the plan as asked", () => {
    const s = normalize({});
    applyWeekPlan(s, WEEK_PRESETS[1].days);
    expect(s.settings.weekPlan).toEqual(WEEK_PRESETS[1].days);
    expect(s.settings.planAsked).toBe(true);
  });
  it("introPreset builds the job week from the off weekdays", () => {
    expect(introPreset([0, 6], true)).toEqual(WEEK_PRESETS[0].days);
    expect(introPreset([], true)).toEqual(WEEK_PRESETS[0].days);
    expect(introPreset([0, 6], false)).toEqual(WEEK_PRESETS[1].days);
    expect(introPreset([3], true)).toEqual(["work-plus", "work-plus", "work-game", "rest", "work-plus", "work-plus", "work-plus"]);
  });
});

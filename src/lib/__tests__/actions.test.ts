import { describe, expect, it } from "vitest";
import { applyWeekPlan, deleteTemplate, duplicateTemplate, markSleep, setDayTemplate, setDone, setTickTime, setVoiceRest, startStreamSeason, stopTaper, taperOffer } from "../actions";
import { at } from "../date";
import { mergeStates, normalize } from "../model";
import { planEpoch, srcOf } from "../ticks";
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

describe("v1.4 stream season actions", () => {
  const loggedWork = () => { const s = normalize({}); s.days["2026-10-25"] = { type: "work", done: {}, waterMl: 0 }; return s; };
  it("taperOffer starts tomorrow from a logged legacy work day", () => {
    expect(taperOffer(loggedWork(), "2026-10-25")).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30, firstWake: 750, doneDate: "2026-11-01" });
  });
  it("taperOffer survives a switched-off weigh-in (falls back to the first ring item)", () => {
    const s = loggedWork();
    for (const t of ["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]) s.schedule.overrides[`${t}:weigh`] = { enabled: false };
    expect(taperOffer(s, "2026-10-25")).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30, firstWake: 765, doneDate: "2026-11-01" });
  });
  it("taperOffer is null when today is already a stream day", () => {
    const s = normalize({});
    s.settings.weekPlan = [...WEEK_PRESETS[3].days];
    expect(taperOffer(s, "2026-11-02")).toBeNull();
  });
  it("startStreamSeason applies the preset, job no, both asked flags and the taper", () => {
    const s = loggedWork();
    startStreamSeason(s, "2026-10-25", true);
    expect(s.settings.weekPlan).toEqual(WEEK_PRESETS[3].days);
    expect([s.settings.job, s.settings.planAsked, s.settings.streamAsked]).toEqual(["no", true, true]);
    expect(s.schedule.taper).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30 });
    const n = loggedWork();
    startStreamSeason(n, "2026-10-25", false);
    expect(n.schedule.taper).toBeNull();
    expect(n.settings.weekPlan).toEqual(WEEK_PRESETS[3].days);
  });
  it("stopTaper stops tomorrow when today is logged, today when not", () => {
    const s = loggedWork();
    startStreamSeason(s, "2026-10-25", true);
    stopTaper(s, "2026-10-27");
    expect(s.schedule.taper?.stop).toBe("2026-10-27");
    s.days["2026-10-27"] = { type: "stream-gym", done: {}, waterMl: 0 };
    stopTaper(s, "2026-10-27");
    expect(s.schedule.taper).toEqual({ start: "2026-10-26", fromMin: 180, stepMin: 30, stop: "2026-10-28" });
  });
  it("markSleep pauses until the taper wake of tomorrow", () => {
    const s = loggedWork();
    startStreamSeason(s, "2026-10-25", true);
    markSleep(s, "2026-10-26", true, Date.parse("2026-10-27T04:30:00+07:00"));
    expect(s.settings.dndUntil).toBe(Date.parse("2026-10-27T12:00:00+07:00"));
  });
});

describe("late tick sources", () => {
  const D = "2026-10-19";
  const gym = () => item("balanced", "gym");
  const fresh = () => { const s = normalize({}); setDayTemplate(s, D, "balanced"); return s; };
  it("setDone 30 min late writes no source; 61 min late writes late with the same ts", () => {
    const s = fresh(), g = gym();
    setDone(s, D, g, true, undefined, { at: planEpoch(D, g.min) + 30 * 60_000 });
    expect(s.days[D].doneSrc).toBeUndefined();
    const ts = planEpoch(D, g.min) + 61 * 60_000;
    setDone(s, D, g, true, undefined, { at: ts });
    expect(s.days[D].doneSrc).toEqual({ gym: { src: "late", ts } });
    expect(s.days[D].done.gym).toBe(ts);
  });
  it("sleep and weigh never get an entry", () => {
    const s = fresh(), w = item("balanced", "weigh"), sl = item("balanced", "sleep");
    setDone(s, D, w, true, undefined, { at: planEpoch(D, w.min) + 300 * 60_000 });
    setDone(s, D, w, true, undefined, { at: planEpoch(D, w.min) + 300 * 60_000, src: "plan" });
    setDone(s, D, sl, true, undefined, { at: planEpoch(D, sl.min) + 300 * 60_000 });
    expect(s.days[D].doneSrc).toBeUndefined();
  });
  it("setTickTime plan moves the tick to the planned time; untick clears the entry", () => {
    const s = fresh(), g = gym();
    setDone(s, D, g, true, undefined, { at: planEpoch(D, g.min) + 120 * 60_000 });
    setTickTime(s, D, "gym", planEpoch(D, g.min), "plan");
    expect(s.days[D].done.gym).toBe(planEpoch(D, g.min));
    expect(s.days[D].doneSrc?.gym).toEqual({ src: "plan", ts: planEpoch(D, g.min) });
    setDone(s, D, g, false);
    expect(s.days[D].done.gym).toBeUndefined();
    expect(s.days[D].doneSrc).toBeUndefined();
    setTickTime(s, D, "gym", 5, "pick"); // no-op once unticked
    expect(s.days[D].done.gym).toBeUndefined();
  });
  it("switching today's gym code keeps the confirmed tick time and its source (gym tab log)", () => {
    const s = fresh(), g = gym(), t = planEpoch(D, g.min);
    setDone(s, D, g, true, "D1", { at: t + 120 * 60_000 });
    setTickTime(s, D, "gym", t, "plan");
    const d = s.days[D];
    setDone(s, D, g, true, "D2", { at: d.done.gym, src: srcOf(d, "gym") });
    expect(s.days[D].done.gym).toBe(t);
    expect(srcOf(s.days[D], "gym")).toBe("plan");
    expect(s.workouts.find((w) => w.date === D)?.code).toBe("D2");
  });
  it("mergeStates unions doneSrc", () => {
    const a = normalize({}), b = normalize({});
    a.days[D] = { type: "balanced", done: { gym: 2e12 }, waterMl: 0, doneSrc: { gym: { src: "late", ts: 2e12 } } };
    b.days[D] = { type: "balanced", done: { meal1: 2e12 + 1 }, waterMl: 0, doneSrc: { meal1: { src: "pick", ts: 2e12 + 1 } } };
    expect(mergeStates(a, b).days[D].doneSrc).toEqual({ gym: { src: "late", ts: 2e12 }, meal1: { src: "pick", ts: 2e12 + 1 } });
    const c = normalize({}), e = normalize({});
    c.days[D] = { type: "balanced", done: {}, waterMl: 0 };
    e.days[D] = { type: "balanced", done: {}, waterMl: 0 };
    expect("doneSrc" in mergeStates(c, e).days[D]).toBe(false);
  });
});

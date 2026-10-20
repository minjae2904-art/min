import { describe, expect, it } from "vitest";
import { addDays, at, hm } from "../date";
import { DEFAULT_STATE, dayFor, normalize, type State } from "../model";
import { dueReminders, groupReminders, type Reminder } from "../reminders";
import { itemsFor } from "../schedule";
import { TODAY, build, tsAt } from "./brain-fixtures";

// 2026-10-20 is a Tuesday (work day with offWeekdays []).
const T = (h: number, m = 0) => new Date(`2026-10-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
const state = (over: Partial<State["settings"]> = {}): State => normalize({ settings: { ...DEFAULT_STATE.settings, followUpMin: 30, ...over } });
const keys = (s: State, now: Date) => dueReminders(s, now).reminders.map((r) => r.key);

describe("dueReminders", () => {
  it("fires the briefing and the weigh-in at wake-up", () => {
    const r = dueReminders(state(), T(13, 5));
    expect(r.date).toBe("2026-10-20");
    expect(r.reminders.map((x) => x.key)).toEqual(["briefing", "weigh:due"]);
    expect(r.badge).toBe(1);
    expect(r.reminders[1].title).toBe("13:00 · ตื่น + ชั่งน้ำหนัก");
  });
  it("stops the due notice after the window", () => {
    const k = keys(state(), T(13, 12));
    expect(k).not.toContain("weigh:due");
    expect(k).toContain("posture:due");
  });
  it("follows up once after followUpMin", () => {
    const k = keys(state(), T(13, 35));
    expect(k).toContain("weigh:late");
    expect(k).not.toContain("weigh:due");
    expect(keys(state({ followUpMin: 0 }), T(13, 35))).not.toContain("weigh:late");
    expect(keys(state(), T(13, 45))).not.toContain("weigh:late");
  });
  it("skips done items and respects per-kind switches", () => {
    const s = state();
    s.days["2026-10-20"] = { type: "work", done: { weigh: 1 }, waterMl: 0 };
    expect(keys(s, T(13, 5))).toEqual(["briefing"]);
    expect(keys(state({ notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, weigh: false } }), T(13, 5))).toEqual(["briefing"]);
    expect(keys(state({ notifyBriefing: false }), T(13, 5))).toEqual(["weigh:due"]);
  });
  it("announces a phase start on the work day", () => {
    const k = keys(state(), T(16, 2));
    expect(k).toContain("phase:work1");
    expect(k).not.toContain("work-in:due"); // info-only item, no ring
  });
  it("is silent during do-not-disturb but still counts the badge", () => {
    const now = T(13, 5);
    const r = dueReminders(state({ dndUntil: now.getTime() + 60_000 }), now, now.getTime());
    expect(r.reminders).toEqual([]);
    expect(r.badge).toBe(1);
  });
  it("hides content for private notifications", () => {
    const r = dueReminders(state({ privateNotifications: true }), T(13, 5));
    expect(r.reminders.length).toBe(2);
    expect(r.reminders.every((x) => x.title === "Krob")).toBe(true);
  });
  it("summarises 15 minutes before bedtime", () => {
    const r = dueReminders(state(), T(4, 46));
    expect(r.date).toBe("2026-10-19");
    expect(r.reminders.find((x) => x.key === "summary")?.title).toContain("สรุปวันนี้");
  });
  it("after midnight uses logical minutes", () => {
    const k = keys(state(), T(2, 32));
    expect(k).toContain("gym:due");
    expect(k).toContain("phase:gym");
    expect(at(2, 30)).toBe(1590);
  });
});

describe("groupReminders", () => {
  const list: Reminder[] = [
    { key: "briefing", title: "13:00 · แผนวันนี้", body: "12 รายการ", level: "info", priority: 0 },
    { key: "weigh:due", title: "13:00 · ตื่น + ชั่งน้ำหนัก", body: "x", level: "due", priority: 2 },
  ];
  it("passes a single reminder through", () => {
    expect(groupReminders([list[1]], false)).toEqual({ title: list[1].title, body: "x", tag: "weigh:due" });
  });
  it("merges several into one, led by the first", () => {
    const g = groupReminders(list, false);
    expect(g.title).toBe(list[0].title);
    expect(g.body).toBe("12 รายการ\nและ: ตื่น + ชั่งน้ำหนัก");
    expect(g.tag).toBe("group:briefing");
  });
  it("hidden mode shows only the first", () => {
    expect(groupReminders(list, true).tag).toBe("briefing");
  });
});

describe("dueReminders with templates", () => {
  const plan = (id: string, over: Partial<State["settings"]> = {}) => { const wp: (string | null)[] = [null, null, null, null, null, null, null]; wp[2] = id; return state({ weekPlan: wp, ...over }); };
  const briefing = (s: State) => dueReminders(s, T(13, 5)).reminders.find((r) => r.key === "briefing")!.body;
  it("names the plan and the game block in the briefing", () => {
    const b = briefing(plan("game-max"));
    expect(b).toContain("แผน: เกมจัดเต็ม");
    expect(b).toContain("เกม 20:30-03:00");
    expect(briefing(plan("rest"))).not.toContain("ยิม D");
    const legacy = briefing(state());
    expect(legacy).toMatch(/^\d+ รายการ/);
    expect(legacy).toContain("ยิม");
  });
  it("sends game break reminders unless turned off", () => {
    expect(keys(plan("game-max"), T(16, 2))).toContain("gamebreak:960");
    expect(keys(plan("game-max", { gameBreakMin: 0 }), T(16, 2))).not.toContain("gamebreak:960");
    expect(keys(plan("game-max", { notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, game: false } }), T(16, 2))).not.toContain("gamebreak:960");
  });
  it("uses the week plan on the server for an unopened day", () => {
    expect(keys(plan("balanced"), T(14, 17))).toContain("sing:due");
    const game = dueReminders(plan("balanced"), T(21, 17)).reminders.find((r) => r.key === "phase:game");
    expect(game?.body).toContain("เล่นเต็มที่");
  });
  it("offers the meal2 choice on a template with the shift", () => {
    const r = dueReminders(plan("work-plus"), T(21, 5)).reminders.find((x) => x.key === "meal2:due");
    expect(r?.body.startsWith("แตะเพื่อเลือก")).toBe(true);
  });
});

describe("dueReminders: Krob Brain", () => {
  const atMin = (date: string, min: number) => new Date(tsAt(date, min));
  const wakeOf = (s: State, date: string) => itemsFor(s.schedule, dayFor(s, date), date).filter((i) => i.ring)[0].min;
  const briefing = (s: State) => dueReminders(s, atMin(TODAY, wakeOf(s, TODAY) + 2)).reminders.find((r) => r.key === "briefing")!;
  it("adds the balance focus line only when the card is on, masked by private notifications", () => {
    const s = build(21);
    expect(briefing(s).body).toMatch(/สมดุล \d+/);
    s.settings.brainCard = false;
    expect(briefing(s).body).not.toContain("สมดุล");
    s.settings.brainCard = true;
    s.settings.privateNotifications = true;
    expect(briefing(s).body).toBe("มีรายการที่ต้องทำ");
    expect(briefing(state()).body).not.toContain("สมดุล"); // no data, no line
  });
  it("marks an active deload in the briefing", () => {
    const s = build(21);
    s.brain.deload = { from: addDays(TODAY, -1), to: addDays(TODAY, 5) };
    expect(briefing(s).body).toContain("สัปดาห์ deload");
    s.brain.deload = { from: TODAY, to: TODAY };
    expect(briefing(s).body).toContain("วันนี้เล่นเบา");
    s.brain.deload = { from: addDays(TODAY, 1), to: addDays(TODAY, 7) };
    expect(briefing(s).body).not.toMatch(/deload|เล่นเบา/);
  });
  it("sends the weekly review once in the window on the review day, not after it is done", () => {
    const s = state({ brainReviewDow: 2 }); // Tuesday, wake 13:00 -> 14:30
    const r = dueReminders(s, T(14, 32)).reminders.find((x) => x.key === "brain:review");
    expect(r?.title).toBe("14:30 · รีวิวสัปดาห์พร้อมแล้ว");
    expect(r?.body).toBe("แตะเพื่อดูผลสัปดาห์และแผนหน้า");
    expect(keys(s, T(14, 28))).not.toContain("brain:review");
    expect(keys(s, T(14, 41))).not.toContain("brain:review");
    expect(keys(state({ brainReviewDow: 3 }), T(14, 32))).not.toContain("brain:review");
    expect(keys(state(), T(14, 32))).not.toContain("brain:review"); // auto: no rest slot -> Sunday
    expect(keys(state({ brainReviewDow: 2, notifyReview: false }), T(14, 32))).not.toContain("brain:review");
    s.brain.reviewDone = TODAY;
    expect(keys(s, T(14, 32))).not.toContain("brain:review");
  });
  it("auto review day is the first rest slot of the week plan", () => {
    const wp: (string | null)[] = [null, null, "rest", null, null, null, null];
    const s = state({ weekPlan: wp });
    expect(dueReminders(s, atMin(TODAY, wakeOf(s, TODAY) + 92)).reminders.map((r) => r.key)).toContain("brain:review");
    wp[1] = "rest"; // an earlier rest slot (Monday) wins
    expect(dueReminders(state({ weekPlan: wp }), atMin(TODAY, wakeOf(s, TODAY) + 92)).reminders.map((r) => r.key)).not.toContain("brain:review");
  });
  it("sends the last-match nudge 15 min before game-stop only when on, on game days", () => {
    const wp: (string | null)[] = [null, null, "game-max", null, null, null, null];
    const s = state({ weekPlan: wp, notifyLastMatch: true });
    const stop = itemsFor(s.schedule, dayFor(s, TODAY), TODAY).find((i) => i.id === "game-stop")!.min;
    const r = dueReminders(s, atMin(TODAY, stop - 13)).reminders.find((x) => x.key === "brain:lastmatch");
    expect(r?.title).toBe(`${hm(stop - 15)} · อีก 15 นาทีถึงเวลาหยุดเกมแข่ง`);
    expect(r?.body).toBe("แมตช์ถัดไปเป็นแมตช์สุดท้ายไหม");
    expect(keys(state({ weekPlan: wp }), atMin(TODAY, stop - 13))).not.toContain("brain:lastmatch"); // default off
    expect(keys(state({ weekPlan: wp, notifyLastMatch: true, notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, game: false } }), atMin(TODAY, stop - 13))).not.toContain("brain:lastmatch");
    const work = state({ notifyLastMatch: true }); // legacy work day: no game-stop item
    for (let m = 600; m < 1800; m += 5) expect(keys(work, atMin(TODAY, m))).not.toContain("brain:lastmatch");
  });
  it("do-not-disturb suppresses the brain pushes too", () => {
    const now = T(14, 32);
    expect(dueReminders(state({ brainReviewDow: 2, dndUntil: now.getTime() + 60_000 }), now, now.getTime()).reminders).toEqual([]);
  });
});

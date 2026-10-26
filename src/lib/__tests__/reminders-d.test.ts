// v1.8 reminders: deep-link urls, grouped urls, quiet during class, catch-up water, briefing class line, badge.
import { describe, expect, it } from "vitest";
import { at } from "../date";
import { DEFAULT_STATE, normalize, type Cls, type DayLog, type State } from "../model";
import { dueReminders, groupReminders, reminderUrl, type Reminder } from "../reminders";
import type { Item } from "../schedule";
import { applyLevel } from "../care/progress";
import { tsAt } from "./brain-fixtures";

const D = "2026-11-03"; // Tuesday
const T = (min: number) => new Date(tsAt(D, min));
const mk = (type = "stream-gym", cls: Cls[] = [], set: Partial<State["settings"]> = {}): State => {
  const s = normalize({ settings: { ...DEFAULT_STATE.settings, followUpMin: 30, ...set } });
  s.days[D] = { type, done: {}, waterMl: 0 } as DayLog;
  if (cls.length) s.schedule.term = { start: "2026-11-02", end: "2027-03-05", cls };
  return s;
};
const C = (id: string, s: number, e: number): Cls => ({ id, d: 2, s, e, t: "วิชา " + id });
const keys = (s: State, min: number) => dueReminders(s, T(min)).reminders.map((r) => r.key);
const it0 = (o: Partial<Item>): Item => ({ id: "x", min: 600, title: "x", kind: "habit", ring: "habit", ...o });

describe("reminderUrl", () => {
  it("maps every non-item key", () => {
    const cases: [string, string][] = [
      ["briefing", "/?do=plan"], ["brain:review", "/insights?tab=review"], ["brain:lastmatch", "/?do=live"],
      ["stream:wrap", "/?do=golive"], ["streambreak:1200", "/?do=golive"], ["phase:stream", "/?do=golive"], ["phase:stream-prep", "/?do=golive"],
      ["phase:morning", "/"], ["water:690", "/?do=water"], ["water:cls-a", "/?do=water"], ["summary", "/?do=shut"],
      ["gamebreak:900", "/"], ["spf:720", "/"], ["unknown", "/"],
    ];
    for (const [k, u] of cases) expect([k, reminderUrl(k)]).toEqual([k, u]);
  });
  it("maps item due/late reminders by the item", () => {
    const cases: [Partial<Item>, string][] = [
      [{ id: "r-am", kind: "care", routine: "am" }, "/?do=care&r=am"],
      [{ id: "night", routine: "pm" }, "/?do=care&r=pm"],
      [{ id: "weigh", kind: "weigh" }, "/?do=weigh"], [{ id: "trade", kind: "trade" }, "/?do=trade"],
      [{ id: "stream", kind: "stream" }, "/?do=golive"], [{ id: "stream-prep", kind: "stream" }, "/?do=live"],
      [{ id: "gym", kind: "gym" }, "/gym"], [{ id: "sing", kind: "sing" }, "/?do=sing"],
      [{ id: "sleep", kind: "sleep" }, "/?do=shut"], [{ id: "night" }, "/?do=shut"],
      [{ id: "meal1", kind: "meal" }, "/"], [{ id: "meal2", kind: "meal" }, "/"],
    ];
    for (const [o, u] of cases) {
      expect(reminderUrl(`${o.id}:due`, it0(o))).toBe(u);
      expect(reminderUrl(`${o.id}@700:late`, it0(o))).toBe(u);
    }
    expect(reminderUrl("meal2:due", it0({ id: "meal2", kind: "meal" }), { meal2Pick: true })).toBe("/?do=meal2");
  });
  it("every reminder of a real day carries a url", () => {
    const s = mk("work");
    for (const m of [at(13, 5), at(16, 2), at(13, 35), at(4, 46)]) for (const r of dueReminders(s, T(m)).reminders) expect(r.url, r.key).toMatch(/^\//);
    const r = dueReminders(s, T(at(13, 5))).reminders;
    expect(r.find((x) => x.key === "briefing")!.url).toBe("/?do=plan");
    expect(r.find((x) => x.key === "weigh:due")!.url).toBe("/?do=weigh");
    expect(dueReminders(s, T(at(21, 1))).reminders.find((x) => x.key === "meal2:due")!.url).toBe("/?do=meal2"); // work day, meal2 not chosen
  });
});

describe("groupReminders url", () => {
  const R = (key: string, url?: string, level: Reminder["level"] = "due"): Reminder => ({ key, title: key, body: "b", level, priority: 2, ...(url ? { url } : {}) });
  it("adds the lead's url on all three paths", () => {
    expect(groupReminders([R("weigh:due", "/?do=weigh")], false).url).toBe("/?do=weigh");
    expect(groupReminders([R("weigh:due", "/?do=weigh"), R("meal1:due", "/")], true).url).toBe("/?do=weigh");
    expect(groupReminders([R("briefing", "/?do=plan"), R("meal1:due", "/")], false)).toMatchObject({ tag: "group:briefing", url: "/?do=plan" });
    const ph = { ...R("phase:x", "/", "info"), body: "ต้องทำ: meal1:due" };
    expect(groupReminders([ph, R("meal1:due", "/?do=water")], false)).toMatchObject({ tag: "phase:x", url: "/" });
  });
  it("omits url when the lead has none", () => {
    expect("url" in groupReminders([R("a")], false)).toBe(false);
    expect("url" in groupReminders([R("a"), R("b", "/x")], false)).toBe(false);
    expect("url" in groupReminders([R("a"), R("b", "/x")], true)).toBe(false);
  });
});

describe("quiet during class", () => {
  const cls = [C("a", at(9), at(12))];
  it("a 10:00 item reminds once at the class end, the follow-up counts from there", () => {
    const s = mk("stream-gym", cls);
    for (let m = at(9); m < at(12); m++) expect(keys(s, m)).not.toContain("meal1:due");
    expect(keys(s, at(12))).toContain("meal1:due");
    expect(keys(s, at(12, 9))).toContain("meal1:due");
    expect(keys(s, at(12, 10))).not.toContain("meal1:due");
    expect(keys(s, at(12, 30))).toContain("meal1:late");
    expect(keys(s, at(10, 30))).not.toContain("meal1:late");
    // without the class the same item reminds at 10:00
    expect(keys(mk("stream-gym"), at(10))).toContain("meal1:due");
  });
  it("an item before class whose follow-up lands in class follows up at the class end", () => {
    const s = mk("stream-gym", [C("a", at(10, 15), at(12))]); // meal1 10:00, follow-up would be 10:30
    expect(keys(s, at(10))).toContain("meal1:due");
    for (let m = at(10, 15); m < at(12); m++) expect(keys(s, m)).not.toContain("meal1:late");
    expect(keys(s, at(12))).toContain("meal1:late");
    expect(keys(s, at(12, 9))).toContain("meal1:late");
    expect(keys(s, at(12, 10))).not.toContain("meal1:late");
    expect(keys(mk("stream-gym"), at(10, 30))).toContain("meal1:late"); // no class: unchanged
  });
  it("no water, phase, break or SPF reminder inside class", () => {
    const s = mk("stream-gym", [C("a", at(9), at(12)), C("b", at(19, 30), at(21))]);
    applyLevel(s, "std", D);
    s.days[D].hot = tsAt(D, at(8, 30)); // SPF slots 10:30, 12:30 (12:30 is outside class)
    const bad = /^(water:\d|phase:|streambreak:|gamebreak:|spf:)/;
    for (const c of [[at(9), at(12)], [at(19, 30), at(21)]]) for (let m = c[0]; m < c[1]; m++) expect(keys(s, m).filter((k) => bad.test(k)), String(m)).toEqual([]);
    expect(keys(s, at(12, 31))).toContain("spf:750");
  });
  it("one catch-up water reminder at the class end when behind", () => {
    const s = mk("stream-gym", cls); // wake 09:30, slot 11:30 falls in class
    expect(keys(mk("stream-gym"), at(11, 30))).toContain("water:690");
    expect(keys(s, at(11, 30)).some((k) => k.startsWith("water:"))).toBe(false);
    const r = dueReminders(s, T(at(12))).reminders.find((x) => x.key === "water:cls-a");
    expect(r).toMatchObject({ level: "info", url: "/?do=water" });
    s.days[D].waterMl = 3000;
    expect(keys(s, at(12))).not.toContain("water:cls-a");
  });
  it("the briefing lists the classes of the day", () => {
    const s = mk("stream-gym", [C("a", at(13), at(15)), C("b", at(15), at(16))]);
    const b = dueReminders(s, T(at(9, 30))).reminders.find((x) => x.key === "briefing")!;
    expect(b.body.split(" · ")[1]).toBe("เรียน 2 วิชา 13:00-16:00");
    expect(dueReminders(mk("stream-gym"), T(at(9, 30))).reminders.find((x) => x.key === "briefing")!.body).not.toContain("เรียน");
  });
  it("off-term dates are unchanged", () => {
    const s = mk("stream-gym", cls);
    s.schedule.term!.off = [D];
    expect(keys(s, at(10))).toContain("meal1:due");
  });
});

describe("badge in the payload", () => {
  it("uses badgeCount: counts at due, keeps the number in private mode and DND", () => {
    const s = mk("stream-gym");
    expect(dueReminders(s, T(at(10, 5))).badge).toBe(4);
    const p = dueReminders(mk("stream-gym", [], { privateNotifications: true }), T(at(10, 5)));
    expect(typeof p.badge).toBe("number");
    expect(p.badge).toBe(4);
    expect(p.reminders.every((r) => r.title === "Krob" && typeof r.url === "string")).toBe(true);
    expect(dueReminders(mk("stream-gym", [], { badge: false }), T(at(10, 5))).badge).toBe(0);
    const now = T(at(10, 5));
    expect(dueReminders(mk("stream-gym", [], { dndUntil: now.getTime() + 60_000 }), now, now.getTime()).badge).toBe(4);
  });
});

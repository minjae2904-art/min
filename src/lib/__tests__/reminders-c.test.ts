import "./tz";
import { describe, expect, it } from "vitest";
import { at } from "../date";
import { DEFAULT_STATE, normalize, type DayLog, type State } from "../model";
import { dueReminders } from "../reminders";
import { itemsFor } from "../schedule";
import { applyLevel } from "../care/progress";
import type { Routine } from "../care/types";
import { tsAt } from "./brain-fixtures";

const D = "2026-10-27"; // Tuesday
const T = (min: number) => new Date(tsAt(D, min));
const base = (type = "stream-gym", set: Partial<State["settings"]> = {}): State => {
  const s = normalize({ settings: { ...DEFAULT_STATE.settings, followUpMin: 30, ...set } });
  s.days[D] = { type, done: {}, waterMl: 0 } as DayLog;
  return s;
};
const std = (type = "stream-gym", set: Partial<State["settings"]> = {}) => { const s = base(type, set); applyLevel(s, "std", D); return s; };
const keys = (s: State, min: number) => dueReminders(s, T(min)).reminders.map((r) => r.key);
const rem = (s: State, min: number, key: string) => dueReminders(s, T(min)).reminders.find((r) => r.key === key);
const routine = (s: State, id: string) => s.schedule.care!.find((r) => r.id === id)!;

describe("care reminders (v1.7)", () => {
  it("a routine row with remind on says the cue and the first 3 required steps", () => {
    const s = std();
    routine(s, "am").remind = true;
    const r = rem(s, at(9, 42), "r-am:due");
    expect(r?.body).toBe("หลังชั่งน้ำหนัก · ล้างหน้า, กันแดด, แปรงฟัน");
    const u: Routine = { id: "u-a", name: "ของฉัน", anchor: { at: at(12) }, remind: true, on: true,
      steps: ["a", "b", "c", "d", "e"].map((id) => ({ id, title: `ขั้น${id} ยาว`, tag: "mind" as const })) };
    s.schedule.care!.push(u);
    expect(rem(s, at(12, 2), "r-u-a:due")?.body).toBe("ขั้นa, ขั้นb, ขั้นc +2");
  });
  it("the care switch mutes only care rows", () => {
    const s = std("stream-gym", { notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, care: false } });
    routine(s, "am").remind = true;
    expect(keys(s, at(9, 42))).not.toContain("r-am:due");
    expect(keys(s, at(9, 32))).toContain("weigh:due");
  });
  it("routine rows get no follow-up, the hosted night row still does", () => {
    const s = std();
    routine(s, "am").remind = true;
    expect(keys(s, at(10, 12))).not.toContain("r-am:late");
    const g = std();
    routine(g, "gym").remind = true;
    const rg = itemsFor(g.schedule, g.days[D], D).find((i) => i.id === "r-gym")!;
    expect(keys(g, rg.min + 2)).toContain("r-gym:due");
    expect(keys(g, rg.min + 32)).not.toContain("r-gym:late");
    const night = itemsFor(s.schedule, s.days[D], D).find((i) => i.id === "night")!;
    expect(night.routine).toBe("pm");
    expect(keys(s, night.min + 31)).toContain("night:late");
  });
  it("the std level with default remind off adds no new push over a whole day", () => {
    const set = { notifyWater: false };
    for (const type of ["stream-gym", "stream-mc", "stream-rest", "stream-marathon"]) {
      const a = base(type, set), b = std(type, set);
      for (let m = at(8); m <= at(7, 55); m += 5) {
        const ka = new Set(keys(a, m));
        for (const k of keys(b, m)) expect(ka.has(k), `${type} ${m} ${k}`).toBe(true);
      }
    }
  });
  it("SPF reapply after a 10:00 hot tap: 12:00 and 14:00, nothing at 16:00", () => {
    const s = std();
    s.days[D].hot = tsAt(D, at(10));
    expect(keys(s, at(12, 1))).toContain("spf:720");
    expect(keys(s, at(14, 1))).toContain("spf:840");
    expect(keys(s, at(16, 1)).some((k) => k.startsWith("spf:"))).toBe(false);
    expect(rem(s, at(12, 1), "spf:720")).toMatchObject({ level: "info", priority: 4, body: "ตอนอยู่กลางแจ้งทาซ้ำทุก 2 ชม. หรือหลังเหงื่อออก" });
  });
  it("no SPF push on air, in DND, without the module or with care muted", () => {
    const m = std("stream-marathon");
    m.days[D].hot = tsAt(D, at(11));
    expect(keys(m, at(13, 1))).toContain("spf:780");
    expect(keys(m, at(15, 1))).not.toContain("spf:900"); // the marathon live starts at 15:00
    const dnd = std();
    dnd.days[D].hot = tsAt(D, at(10));
    dnd.settings.dndUntil = tsAt(D, at(23));
    expect(keys(dnd, at(12, 1))).toEqual([]);
    const off = base();
    off.days[D].hot = tsAt(D, at(10));
    expect(keys(off, at(12, 1))).not.toContain("spf:720");
    const mute = std("stream-gym", { notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, care: false } });
    mute.days[D].hot = tsAt(D, at(10));
    expect(keys(mute, at(12, 1))).not.toContain("spf:720");
    const nospf = std();
    nospf.days[D].hot = tsAt(D, at(10));
    for (const r of nospf.schedule.care!) r.steps = r.steps.filter((x) => x.id !== "spf");
    expect(keys(nospf, at(12, 1))).not.toContain("spf:720");
  });
  it("the briefing lists due periodic tasks only once self-care is set up", () => {
    const s = std();
    const b = rem(s, at(9, 32), "briefing")!;
    expect(b.body).toContain("ครบรอบ: ");
    expect(rem(base(), at(9, 32), "briefing")!.body).not.toContain("ครบรอบ");
    for (const t of s.care.tasks) s.care.last[t.id] = D;
    expect(rem(s, at(9, 32), "briefing")!.body).not.toContain("ครบรอบ");
  });
  it("the briefing still fires at weigh with an 08:30 custom routine", () => {
    const s = std();
    s.schedule.care!.push({ id: "u-early", name: "เช้าตรู่", anchor: { at: at(8, 30) }, remind: false, on: true, steps: [{ id: "x", title: "ทำ", tag: "mind" }] });
    const items = itemsFor(s.schedule, s.days[D], D).filter((i) => i.ring);
    expect(items[0].id).toBe("weigh");
    expect(items.find((i) => i.id === "r-u-early")!.min).toBeGreaterThan(items[0].min);
    expect(keys(s, items[0].min + 2)).toContain("briefing");
  });
  it("stream break pushes are unchanged during a live run", () => {
    const s = std("stream-gym", { gameBreakMin: 60 });
    const live = std("stream-gym", { gameBreakMin: 60 });
    live.run = { k: "live", date: D, at: tsAt(D, at(19)), b: 60, slot: 0, ok: 0, seen: 0, br: 0 };
    let seen = 0;
    for (let m = at(19); m <= at(0, 30); m += 5) {
      const a = keys(s, m).filter((k) => k.startsWith("streambreak:"));
      seen += a.length;
      expect(keys(live, m).filter((k) => k.startsWith("streambreak:"))).toEqual(a);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

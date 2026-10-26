// Round E integration (spec 11.3-11.4): end-to-end English output across batches, and Thai output unchanged.
// Fixtures store built-in defaults the way v1.7/v1.8 did (Thai preset routines, steps and gym names) plus term classes.
import { describe, expect, it } from "vitest";
import { fmt, withLang } from "../../i18n";
import { careRoutineName, gymExName, routineName, stepTitle } from "../../i18n/stored";
import { aiSummary } from "../ai-summary";
import { brainReport } from "../brain/report";
import { thaiDate } from "../brain/copy";
import { applyLevel } from "../care/progress";
import { DEFAULT_PLAN } from "../gymlog";
import { normalize, type DayLog, type State } from "../model";
import { dueReminders, groupReminders, type Reminder } from "../reminders";
import { itemsFor } from "../schedule";
import { insights, rangeStats } from "../stats";
import { TEMPLATES } from "../templates";
import { build, perfect, TODAY } from "./brain-fixtures";

const THAI = /[฀-๿]/;
const D = "2026-10-27"; // Tuesday, stream season
const TERM_DAY = "2026-11-03"; // Tuesday in the term
const wall = (date: string, min: number) => new Date(new Date(`${date}T08:00:00+07:00`).getTime() + min * 60_000); // min after 08:00
const day = (type: string, o: Partial<DayLog> = {}): DayLog => ({ type, done: {}, waterMl: 0, ...o });

// Every notification switch on, full self-care level (Thai preset routines), a customized gym plan stored in Thai and
// term classes (class titles are user text, English here so the no-Thai check applies).
function fixture(): State {
  const s = normalize({});
  s.profile.setup = true;
  for (const [k, v] of Object.entries(s.settings)) if (k.startsWith("notify") && typeof v === "boolean") (s.settings as Record<string, unknown>)[k] = true;
  s.settings.brainCard = true;
  withLang("th", () => applyLevel(s, "full", D));
  s.gym.plan.D1 = withLang("th", () => DEFAULT_PLAN.D1.map((e) => ({ ...e }))).reverse();
  s.schedule.term = { start: "2026-11-02", end: "2027-03-05", cls: [{ id: "a", d: 2, s: 600, e: 690, t: "Calculus 1", r: "301" }, { id: "b", d: 2, s: 780, e: 900, t: "Physics" }] };
  return s;
}
const texts = (r: Reminder[]) => r.flatMap((x) => [x.title, x.body]);
function sweep(s: State, date: string, step: number, lang: "th" | "en") {
  const out: Reminder[][] = [];
  for (let min = 0; min < 1440; min += step) out.push(withLang(lang, () => dueReminders(s, wall(date, min), 0).reminders));
  return out;
}

describe("English push has no Thai", () => {
  it("fixture stores Thai built-in defaults", () => {
    const s = fixture();
    expect(s.schedule.care!.map((r) => r.name).some((n) => THAI.test(n))).toBe(true);
    expect(s.gym.plan.D1!.every((e) => THAI.test(e.name))).toBe(true);
  });
  it("every minute of a stream-gym day and a term day, plus groupReminders", () => {
    const s = fixture();
    s.days[D] = day("stream-gym");
    let n = 0;
    for (const date of [D, TERM_DAY]) for (const r of sweep(s, date, 1, "en")) {
      n += r.length;
      for (const t of texts(r)) expect(t, t).not.toMatch(THAI);
      if (r.length) for (const hidden of [false, true]) { const g = withLang("en", () => groupReminders(r, hidden)); expect(`${g.title} ${g.body}`).not.toMatch(THAI); }
    }
    expect(n).toBeGreaterThan(50);
    expect(texts(sweep(s, TERM_DAY, 1, "en").flat()).some((t) => /class/i.test(t))).toBe(true); // term classes are in play
  });
  it("every built-in template (5-minute steps)", () => {
    const s = fixture();
    for (const id of withLang("th", () => TEMPLATES.map((t) => t.id))) {
      s.days[D] = day(id);
      const all = sweep(s, D, 5, "en").flat();
      expect(all.length, id).toBeGreaterThan(0);
      for (const t of texts(all)) expect(t, `${id}: ${t}`).not.toMatch(THAI);
      expect(withLang("en", () => groupReminders(all, false)).body).not.toMatch(THAI);
    }
  });
  it("Thai push text is unchanged by an English run", () => {
    const s = fixture();
    s.days[D] = day("stream-gym");
    const th1 = sweep(s, D, 5, "th");
    sweep(s, D, 5, "en");
    expect(sweep(s, D, 5, "th")).toEqual(th1);
    expect(texts(th1.flat()).some((t) => THAI.test(t))).toBe(true);
  });
});

describe("cross-batch English spot checks", () => {
  it("a template's item titles follow the language; ids and times stay", () => {
    const s = normalize({});
    const th = itemsFor(s.schedule, day("stream-gym"), D), en = withLang("en", () => itemsFor(s.schedule, day("stream-gym"), D));
    expect(en.map((i) => [i.id, i.min])).toEqual(th.map((i) => [i.id, i.min]));
    expect(th.find((i) => i.id === "gym")?.title).toBe("เข้ายิม");
    expect(en.find((i) => i.id === "gym")?.title).toBe("Gym");
    for (const i of en) { expect(i.title, i.id).not.toMatch(THAI); if (i.sub) expect(i.sub, i.id).not.toMatch(THAI); }
  });
  it("care step labels and routine names resolve stored Thai defaults; user text stays as typed", () => {
    expect(withLang("en", () => stepTitle({ title: "ล้างหน้า น้ำเปล่า/โฟมอ่อนโยน" }))).toBe("Wash face, water or gentle foam");
    expect(withLang("en", () => stepTitle({ title: "ล้างหน้า" }))).toBe("Wash face");
    expect(stepTitle({ title: "ล้างหน้า" })).toBe("ล้างหน้า");
    expect(withLang("en", () => careRoutineName("ก่อนนอน"))).toBe("Bedtime");
    expect(withLang("en", () => routineName("กิจวัตรใหม่"))).toBe("New routine");
    expect(routineName("กิจวัตรใหม่")).toBe("กิจวัตรใหม่");
    expect(withLang("en", () => stepTitle({ title: "สูตรของฉัน" }))).toBe("สูตรของฉัน");
    expect(withLang("en", () => gymExName("บาร์เบลสควอท"))).not.toMatch(THAI);
    const s = fixture();
    s.schedule.care!.push({ id: "u1", name: "กิจวัตรใหม่", anchor: { at: 720 }, remind: false, on: true, steps: [{ id: "x", title: "Stretch", tag: "mind" }] });
    const care = withLang("en", () => itemsFor(s.schedule, day("stream-gym"), D)).filter((i) => i.kind === "care");
    expect(care.find((i) => i.id === "r-u1")?.title).toBe("New routine");
    expect(care.length).toBeGreaterThan(0);
    for (const i of care) expect(`${i.title} ${i.sub ?? ""} ${i.cue ?? ""}`).not.toMatch(THAI);
  });
  it("formatted dates: English short form, Thai unchanged", () => {
    expect(fmt.dateShort("2026-11-02", "en")).toBe("Mon 2 Nov");
    expect(withLang("en", () => thaiDate("2026-10-24"))).toBe("Sat 24 Oct");
    expect(thaiDate("2026-10-24")).toBe("เสาร์ 24 ต.ค.");
    expect(fmt.dayMonth("2026-11-05", "en")).toBe("5 Nov");
  });
});

// Recursively collect every string in a value.
const strings = (v: unknown): string[] => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("brain, AI summary and insights in English", () => {
  const states: [string, State][] = [
    ["perfect", perfect()],
    ["messy", build(35, (d, i) => (i % 3 === 0 ? { ticks: "none", sleepH: 5, bedLate: 120, checkin: [2, 2, 2], water: 300 } : i % 5 === 0 ? { skip: true } : { late: { gym: 90 }, sleepH: 6 }))],
    ["low data", build(3)],
  ];
  for (const [name, s] of states) it(`brainReport and proposals (${name})`, () => {
    for (const mode of ["brief", "weekly"] as const) {
      const th = brainReport(s, TODAY, mode), en = withLang("en", () => brainReport(s, TODAY, mode));
      expect(en.candidates.map((c) => c.id)).toEqual(th.candidates.map((c) => c.id));
      for (const t of strings(en)) expect(t, t).not.toMatch(THAI);
      for (const c of en.candidates) for (const t of [c.title, c.why, c.ifThen, ...c.variants.map((v) => v.label)]) expect(t.length).toBeGreaterThan(0);
      expect(brainReport(s, TODAY, mode)).toEqual(th);
    }
  });
  it("a messy month produces English proposal text", () => {
    const en = withLang("en", () => brainReport(states[1][1], TODAY, "weekly"));
    expect(en.candidates.length).toBeGreaterThan(0);
    expect(en.candidates[0].title).toMatch(/[A-Za-z]/);
  });
  for (const [name, s] of states) it(`aiSummary and insights (${name})`, () => {
    const th = aiSummary(s, TODAY);
    expect(withLang("en", () => aiSummary(s, TODAY))).not.toMatch(THAI);
    expect(aiSummary(s, TODAY)).toBe(th);
    const r = withLang("en", () => rangeStats(s, TODAY, 14)); // item titles come from the plan in the active language
    for (const t of withLang("en", () => insights(r, s))) expect(t, t).not.toMatch(THAI);
  });
});

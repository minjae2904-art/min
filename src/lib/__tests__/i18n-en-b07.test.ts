// Round E batch 7: English coverage for src/lib/psych.ts, clash.ts, bands.ts, chart.ts (lib-7 dictionary).
import { describe, expect, it } from "vitest";
import { msgs, withLang } from "../../i18n";
import * as M from "../../i18n/msg/lib-7";
import { BAND_KEYS, BAND_LABEL, bandText } from "../bands";
import { seriesSummary } from "../chart";
import { EARLY_NOTE, earlyNote, termClashes, weekFix } from "../clash";
import { at } from "../date";
import { normalize, type Cls, type State } from "../model";
import { DEFAULT_IDENTITY, badgeCatalog, dayMessage, defaultIdentity, maybePraise, microStep } from "../psych";
import type { Item } from "../schedule";
import { WEEK_PRESETS } from "../templates";

const THAI = /[฀-๿]/;
const m = msgs(M);
const en = <T,>(fn: () => T) => withLang("en", fn);

describe("psych in English", () => {
  it("micro steps for every kind, praise, identity", () => {
    const kinds = ["meal", "supp", "gym", "personality", "weigh", "trade", "sleep", "sing", "mc", "care", "habit"];
    for (const kind of kinds) {
      const t = en(() => microStep({ kind } as Item));
      expect(t).not.toMatch(THAI);
      expect(t).not.toContain("psych.");
    }
    for (let r = 0; r < 0.33; r += 0.01) expect(en(() => maybePraise(r))).not.toMatch(THAI);
    expect(en(() => defaultIdentity())).toBe("I take care of my body and follow my plan every day, whatever the shift");
    expect(defaultIdentity()).toBe(DEFAULT_IDENTITY); // ambient th
  });

  it("day message and every badge (titles, descs, groups) have no Thai", () => {
    const s = normalize({});
    s.days["2026-10-31"] = { type: "balanced", done: {}, waterMl: 0 };
    s.days["2026-11-01"] = { type: "balanced", done: {}, waterMl: 0 };
    const msg = en(() => dayMessage(s, "2026-11-01"));
    expect(msg).toBe("Yesterday wasn't complete, and that's okay. Today is a fresh start");
    const badges = en(() => badgeCatalog(s, "2026-11-01"));
    expect(badges.length).toBeGreaterThan(20);
    for (const b of badges) for (const t of [b.title, b.desc, b.group]) { expect(t).not.toMatch(THAI); expect(t).not.toContain("psych."); }
    expect(badges.find((b) => b.id === "streak-7")!.title).toBe("7-day streak");
    expect(badges.find((b) => b.id === "perfect-1")!.title).toBe("Perfect day");
    expect(badges.find((b) => b.id === "gym-10")!.desc).toBe("10 gym check-ins in total");
    // th art and ids are unchanged
    const th = badgeCatalog(s, "2026-11-01");
    expect(badges.map((b) => [b.id, b.art])).toEqual(th.map((b) => [b.id, b.art]));
    expect(th.find((b) => b.id === "streak-3")!.group).toBe(m.in("th", "psych.group.streak"));
  });
});

describe("bands and chart in English", () => {
  it("band labels and text", () => {
    for (const k of BAND_KEYS) expect(en(() => BAND_LABEL[k])).not.toMatch(THAI);
    expect(en(() => BAND_LABEL.day)).toBe("Good day");
    expect(en(() => bandText({ key: "day", cells: [], hit: 3, elig: 5 }))).toBe("3/5 days");
    expect(en(() => bandText({ key: "day", cells: [], hit: 1, elig: 1 }))).toBe("1/1 day");
    expect(en(() => bandText({ key: "day", cells: [], hit: 0, elig: 0 }))).toBe("No data yet");
  });
  it("series summary", () => {
    expect(en(() => seriesSummary({ label: "Weight", values: [67.2, null, 68.04, 67.8], unit: "kg", decimals: 1 })))
      .toBe("Weight: 3 points, low 67.2, high 68.0, latest 67.8 kg");
    expect(en(() => seriesSummary({ label: "Volume", values: [1200] }))).toBe("Volume: 1 point, low 1200, high 1200, latest 1200");
    expect(en(() => seriesSummary({ label: "Volume", values: [] }))).toBe("Volume: no data yet");
  });
});

describe("clash in English", () => {
  const MON = "2026-11-02";
  const C = (id: string, d: number, s: number, e: number): Cls => ({ id, d, s, e, t: "Class " + id });
  function mk(cls: Cls[], o: { day?: string; week?: (string | null)[] } = {}): State {
    const s = normalize({});
    s.schedule.term = { start: "2026-11-01", end: "2027-03-05", cls };
    s.settings.weekPlan = [...(o.week ?? withLang("th", () => WEEK_PRESETS[3].days))];
    if (o.day) s.days[MON] = { type: o.day, done: {}, waterMl: 0 };
    return s;
  }
  it("overlap text and fix labels wrap the (separately translated) titles", () => {
    const s = mk([C("a", 1, at(10), at(12))], { day: "stream-gym" });
    const l = en(() => termClashes(s, MON, { today: true }));
    const m1 = l.find((c) => c.item?.id === "meal1")!;
    expect(m1.text).toMatch(/^Class a 10:00-12:00 clashes with .+ 10:00$/);
    expect(m1.fixes[0].label).toMatch(/^Use ".+" today$/);
    expect(m1.fixes[1].label).toMatch(/^Move .+ to 12:15$/);
    expect(m1.fixes[2].label).toBe("Use the term week plan");
  });
  it("early and sleep clashes", () => {
    const s = mk([C("a", 1, at(14), at(15))], { day: "balanced" });
    s.days[MON].shiftMin = 30;
    const e = en(() => termClashes(s, MON, { today: true })).find((c) => c.kind === "early")!;
    expect(e.text).toBe("Class a starts 14:00, but by plan you'd get there around 14:50");
    expect(e.fixes.find((x) => x.k === "shift")!.label).toBe("Wake 60 min earlier today (the whole day shifts)");
    const s2 = mk([C("a", 1, at(9), at(10))], { day: "term-gym" });
    expect(en(() => termClashes(s2, MON, { today: true }))[0].hint).toBe(en(() => earlyNote()));
    expect(en(() => earlyNote())).not.toMatch(THAI);
    expect(earlyNote()).toBe(EARLY_NOTE);
    const s3 = mk([C("a", 2, at(8), at(10))]);
    const c = en(() => termClashes(s3, MON, { today: true })).find((x) => x.kind === "sleep")!;
    expect(c.text).toBe("Class at 08:00 tomorrow · Going to bed at 01:30 as planned leaves under 7 h of sleep");
    expect(c.hint).toBe("Try going to bed before 00:30 tonight");
    expect(en(() => weekFix(s3))).toEqual({ k: "week", label: "Use the term week plan" });
  });
});

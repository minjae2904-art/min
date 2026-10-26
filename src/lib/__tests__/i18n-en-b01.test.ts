// Round E batch 1: English coverage for src/lib/templates.ts (lib-1 dictionary).
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n";
import { BUILTIN_IDS, TEMPLATES, TEMPLATE_BY_ID, WEEK_PRESETS, introPreset } from "../templates";

const THAI = /[฀-๿]/;

describe("templates in English", () => {
  it("built-in templates carry no Thai under en", () => {
    const json = withLang("en", () => JSON.stringify([...TEMPLATES]));
    expect(json).not.toMatch(THAI);
    expect(json).not.toContain("templates."); // no raw keys leak
  });

  it("week presets carry no Thai under en and keep their days", () => {
    const en = withLang("en", () => WEEK_PRESETS.map((p) => ({ ...p })));
    const th = WEEK_PRESETS.map((p) => ({ ...p }));
    expect(JSON.stringify(en)).not.toMatch(THAI);
    expect(en.map((p) => [p.id, p.days])).toEqual(th.map((p) => [p.id, p.days]));
    expect(en[4].id).toBe("term");
    expect(en[3].name).toBe("Stream season");
  });

  it("structure (ids, times, phases, anchors) is identical across languages", () => {
    const shape = () => TEMPLATES.map((t) => ({
      id: t.id, base: t.base, work: t.work, color: t.color, drop: t.drop, cues: Object.keys(t.cues ?? {}),
      patch: Object.fromEntries(Object.entries(t.patch ?? {}).map(([k, v]) => [k, { min: v.min, dur: v.dur, kind: v.kind, keys: Object.keys(v) }])),
      add: (t.add ?? []).map((i) => [i.id, i.min, i.dur, i.kind, i.ring, i.endAt, i.moves, i.session, !!i.sub]),
      phases: (t.phases ?? []).map((p) => [p.key, p.at, p.color]),
    }));
    expect(withLang("en", shape)).toEqual(shape());
  });

  it("keeps fillTimes tokens verbatim", () => {
    const tip = (id: string, key: string) => TEMPLATE_BY_ID.get(id)!.phases!.find((p) => p.key === key)!.tip;
    expect(withLang("en", () => tip("stream-gym", "clips"))).toContain("{stream}");
    expect(withLang("en", () => tip("stream-gym", "winddown"))).toContain("{sleep}");
    expect(withLang("en", () => TEMPLATE_BY_ID.get("stream-marathon")!.patch!.meal3.sub)).toContain("{meal3+30}");
  });

  it("spot checks and per-language identity", () => {
    withLang("en", () => {
      expect(TEMPLATE_BY_ID.get("balanced")!.name).toBe("Balanced day");
      expect(TEMPLATE_BY_ID.get("stream-marathon")!.name).toBe("Marathon stream");
      expect(TEMPLATE_BY_ID.get("balanced")).toBe(TEMPLATES[0]);
    });
    expect(TEMPLATE_BY_ID.get("balanced")!.name).toBe("วันสมดุล");
    expect(TEMPLATE_BY_ID.get("balanced")).toBe(TEMPLATES[0]);
    expect(withLang("en", () => TEMPLATES[0])).not.toBe(TEMPLATES[0]);
    expect([...BUILTIN_IDS]).toEqual(TEMPLATES.map((t) => t.id));
    expect(withLang("en", () => introPreset([], false))).toEqual(introPreset([], false));
  });
});

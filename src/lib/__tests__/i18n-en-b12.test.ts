// Round E batch 12: phase.ts, session.ts, recover.ts and server/ai.ts texts follow the language; th is byte-identical to v1.8.
import { describe, expect, it } from "vitest";
import { msgs, withLang } from "../../i18n/core";
import * as L12 from "../../i18n/msg/lib-12";
import * as LS from "../../i18n/msg/lib-server";
import { at } from "../date";
import { normalize, type DayLog, type RunKind, type State } from "../model";
import { accessoryFor, phases } from "../phase";
import { CUE_TEXT, PRESET, runLabel, type CueKind } from "../session";
import { planEpoch } from "../ticks";

const THAI = /[฀-๿]/;
const DATE = "2026-10-26";
const day = (type: string): DayLog => ({ type, done: {}, waterMl: 0 });
const ms = (min: number) => planEpoch(DATE, min);
const withRun = (s: State, k: RunKind, atMin: number, date = DATE) => { s.run = { k, date, at: ms(atMin), b: 60, slot: 0, ok: 0, seen: 0, br: 0 }; return s; };
const KINDS: CueKind[] = ["eyes", "stand", "water", "voice", "sip"];

describe("phase.ts in English", () => {
  it("built-in work/off phases have no Thai; th unchanged", () => {
    const s = normalize({});
    for (const type of ["work", "off", "work-plus"]) {
      const en = withLang("en", () => phases(s, day(type), DATE));
      expect(en.length).toBeGreaterThan(3);
      for (const p of en) { expect(THAI.test(p.label)).toBe(false); expect(THAI.test(p.tip)).toBe(false); }
    }
    const th = phases(s, day("work"), DATE);
    expect(th.map((p) => p.label)).toEqual(["ช่วงเตรียมตัว", "ทำงาน ช่วงแรก", "พักกะ", "ทำงาน ช่วงหลัง", "เลิกงาน ไปยิม", "เวลายิม", "ฟื้นฟู เตรียมนอน", "เวลานอน"]);
    expect(withLang("en", () => phases(s, day("off"), DATE)).at(-1)).toMatchObject({ key: "sleep", label: "Sleep" });
  });
  it("template days end with the English sleep phase", () => {
    const p = withLang("en", () => phases(normalize({}), day("stream-gym"), DATE)).at(-1)!;
    expect(p.label).toBe("Sleep");
    expect(THAI.test(p.tip)).toBe(false);
  });
  it("accessory labels", () => {
    const sess = (k: RunKind, date = DATE) => accessoryFor(withRun(normalize({}), k, at(19), date), day("stream-gym"), DATE, at(20), ms(at(20)));
    expect(withLang("en", () => sess("live").label)).toBe("Live now");
    expect(withLang("en", () => sess("sing").label)).toBe("Singing now");
    expect(withLang("en", () => sess("live", "2026-10-25").label)).toBe("Live still on?");
    expect(sess("live", "2026-10-25").label).toBe("ลืมจบไลฟ์?");
    expect(withLang("en", () => accessoryFor(normalize({}), day("stream-gym"), DATE, at(20), ms(at(20))).label)).toBe("Live");
  });
});

describe("session.ts in English", () => {
  it("cue texts and run labels", () => {
    for (const k of KINDS) { const t = withLang("en", () => CUE_TEXT[k]); expect(t).toBeTruthy(); expect(THAI.test(t)).toBe(false); }
    expect(withLang("en", () => [runLabel("live"), runLabel("sing")])).toEqual(["Live", "Singing"]);
    expect(withLang("en", () => PRESET.live?.label)).toBe("Live");
    expect(CUE_TEXT.sip).toBe("จิบน้ำอุ่น");
    expect(runLabel("sing")).toBe("ร้องเพลง");
    expect(withLang("en", () => Object.keys(CUE_TEXT))).toEqual(KINDS);
  });
});

describe("lib-12 / lib-server dictionaries", () => {
  it("every en value is English", () => {
    const a = msgs(L12), b = msgs(LS);
    for (const k of Object.keys(L12.th) as (keyof typeof L12.th)[]) expect(THAI.test(a.in("en", k))).toBe(false);
    for (const k of Object.keys(LS.th) as (keyof typeof LS.th)[]) expect(THAI.test(b.in("en", k))).toBe(false);
    expect(b.in("en", "ai.err.noModel", { model: "x" })).toBe("Model x not found (set GEMINI_MODEL to an available model)");
    expect(b.in("th", "ai.cut")).toBe("\n…(คำตอบถูกตัด)");
  });
});

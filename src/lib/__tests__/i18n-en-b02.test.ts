// Round E batch 2 (src/components/*): English copy for the components dictionary.
import { describe, expect, it } from "vitest";
import { msgs, storedText, withLang } from "../../i18n";
import * as C from "../../i18n/msg/components";

const m = msgs(C);
const THAI = /[฀-๿]/;

describe("components dictionary (en)", () => {
  it("has no Thai in any en value and keeps th byte-identical", () => {
    for (const k of Object.keys(C.th) as (keyof typeof C.th)[]) {
      expect(m.in("en", k)).not.toMatch(THAI);
      expect(m.in("th", k)).toBe(C.th[k]);
    }
  });
  it("fills vars and English plurals", () => {
    expect(m.in("en", "tickTime.askMany", { n: 1 })).toBe("1 item ticked late. When did you do them?");
    expect(m.in("en", "tradeSheet.count", { n: "5+" })).toBe("5+ trades");
    expect(m.in("th", "tradeSheet.count", { n: "5+" })).toBe("5+ ไม้");
    expect(m.in("en", "pushDoctor.todo", { n: 2 })).toBe("2 steps to fix");
    expect(m.in("th", "reschedule.moved", { title: "x", time: "13:00" })).toBe("ย้าย \"x\" ไป 13:00");
  });
  it("keeps rich tokens for later node substitution", () => {
    expect(withLang("en", () => m("sleepWake.awake.sub", { time: "01:30" }))).toBe("{shift}Planned bedtime 01:30{debt}");
    expect(m.in("th", "sleepWake.awake.sub", { time: "01:30" })).toBe("{shift}เข้านอนตามแผน 01:30{debt}");
  });
  it("shows the stored built-in coach question in the current language", () => {
    const q = storedText(C, "aiCoach.q.");
    const th = C.th["aiCoach.q.coach"];
    expect(withLang("en", () => q(th))).toBe("Overall analysis");
    expect(withLang("th", () => q(th))).toBe(th);
    expect(q.canon(th)).toBe(th);
    expect(q("Overall analysis")).toBe("Overall analysis"); // only th values are built-in (user text otherwise)
    expect(withLang("en", () => q("my own question"))).toBe("my own question");
  });
});

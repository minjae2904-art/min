// Round E batch 5 (gymlog.ts, useBrain.ts): English output has no Thai; th stays the v1.8 text.
import { describe, expect, it } from "vitest";
import { keepStored, msgs, withLang } from "../../i18n/core";
import * as L5 from "../../i18n/msg/lib-5";
import { gymExName, routineName } from "../../i18n/stored";
import { DEFAULT_PLAN, GYM_CODES, hint, summaryOf } from "../gymlog";
import { normalize, type GymLog } from "../model";

const THAI = /[฀-๿]/;
const m = msgs(L5);

describe("gymlog default plan", () => {
  it("every default exercise has an English name and the th names are unchanged", () => {
    const en = withLang("en", () => GYM_CODES.flatMap((c) => DEFAULT_PLAN[c].map((e) => [e.id, e.name] as const)));
    expect(en.length).toBe(22);
    for (const [id, name] of en) { expect(name).not.toBe(`gymlog.ex.${id}`); expect(THAI.test(name)).toBe(false); }
    expect(DEFAULT_PLAN.D1[0].name).toBe("บาร์เบลสควอท");
    expect(withLang("en", () => DEFAULT_PLAN.D2[0].name)).toBe("Bench press");
    expect(withLang("en", () => DEFAULT_PLAN.D1.map((e) => e.id))).toEqual(DEFAULT_PLAN.D1.map((e) => e.id));
  });

  it("summary names: a plan stored in Thai shows English under en; user names stay as typed", () => {
    const s = normalize({});
    s.gym.plan.D2 = [{ ...DEFAULT_PLAN.D2[0] }, { ...DEFAULT_PLAN.D2[1], name: "ดัมเบลของฉัน" }];
    const log: GymLog = { d: "2026-10-26", c: "D2", at: 0, min: 50, x: [["bp", "60x8,60x8"], ["idb", "20x10"]] };
    expect(summaryOf(s, log).ex.map((e) => e.name)).toEqual(["เบนช์เพรส", "ดัมเบลของฉัน"]);
    const en = withLang("en", () => summaryOf(s, log));
    expect(en.ex.map((e) => e.name)).toEqual(["Bench press", "ดัมเบลของฉัน"]);
    expect(gymExName.canon("เบนช์เพรส")).toBe("เบนช์เพรส");
  });

  it("user names equal to an English default stay as typed; untouched defaults save canonically", () => {
    expect(gymExName("Bench press")).toBe("Bench press");
    expect(gymExName.is("Bench press")).toBe(false);
    expect(keepStored(gymExName, "Bench press", "Bench press", 40)).toBe("Bench press"); // th UI, user text kept
    expect(withLang("en", () => keepStored(gymExName, "เบนช์เพรส", gymExName("เบนช์เพรส"), 40))).toBe("เบนช์เพรส");
    expect(withLang("en", () => keepStored(gymExName, "เบนช์เพรส", "Incline bench", 40))).toBe("Incline bench");
  });

  it("the editor default name of a new routine follows the language; typed names stay", () => {
    expect(withLang("en", () => routineName("กิจวัตรใหม่"))).toBe("New routine");
    expect(withLang("en", () => routineName("เช้า"))).toBe("Morning");
    expect(routineName("Morning")).toBe("Morning");
    expect(withLang("en", () => keepStored(routineName, "กิจวัตรใหม่", "New routine"))).toBe("กิจวัตรใหม่");
  });

  it("the editor default name of a new exercise follows the language", () => {
    expect(withLang("en", () => gymExName("ท่าใหม่"))).toBe("New exercise");
    expect(gymExName("ท่าใหม่")).toBe("ท่าใหม่");
    expect(withLang("en", () => keepStored(gymExName, "ท่าใหม่", "New exercise", 40))).toBe("ท่าใหม่");
    expect(gymExName.is("New exercise")).toBe(false);
    const s = normalize({});
    s.gym.plan.D2 = [{ ...DEFAULT_PLAN.D2[0], id: "u1", name: "ท่าใหม่" }];
    const log: GymLog = { d: "2026-10-26", c: "D2", at: 0, min: 50, x: [["u1", "60x8"]] };
    expect(withLang("en", () => summaryOf(s, log).ex[0].name)).toBe("New exercise");
  });

  it("hints are English with the same numbers", () => {
    const bp = DEFAULT_PLAN.D2[0], dip = DEFAULT_PLAN.D2[3];
    const cases = withLang("en", () => [
      hint(bp, [[60, 8], [60, 8], [60, 8]], []),
      hint(bp, [[60, 7], [60, 6], [60, 6]], []),
      hint(bp, [[60, 5], [60, 5], [60, 5]], []),
      hint(bp, [[60, 5]], [[[60, 5]], [[60, 4]]]),
      hint(dip, [[0, 12], [0, 12], [0, 12]], []),
      hint(dip, [[0, 9]], []),
    ]);
    for (const h of cases) { expect(h).not.toBeNull(); expect(THAI.test(h!.text)).toBe(false); }
    expect(cases[0]!.text).toBe("8 reps on every set · Next time try 62.5 kg");
    expect(cases[5]!.text).toBe("Keep bodyweight · Add 1 rep at a time up to 12");
  });
});

describe("useBrain copy", () => {
  it("every lib-5 useBrain key has English with no Thai", () => {
    const keys = Object.keys(L5.th).filter((k) => k.startsWith("useBrain.")) as (keyof typeof L5.th)[];
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) { const t = m.in("en", k, { n: 2, diff: "x", stale: "", wait: "" }); expect(THAI.test(t)).toBe(false); }
    expect(m.in("en", "useBrain.toast.appliedAll", { n: 1, stale: m.in("en", "useBrain.toast.allStale", { n: 1 }), wait: "" })).toBe("Adjusted 1 item · 1 out of date (plan changed)");
    expect(m.in("th", "useBrain.toast.appliedAll", { n: 2, stale: "", wait: m.in("th", "useBrain.toast.allWait", { n: 1 }) })).toBe("ปรับแล้ว 2 ข้อ · 1 ข้อรอก่อน (ลองทีละ 1 เรื่องต่อด้าน)");
  });
});

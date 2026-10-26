// Round E batch 3 (brain/copy.ts, share.ts, term.ts): English output has no Thai; th stays byte-identical.
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n/core";
import {
  AREA_LABEL, CONFLICT_LABEL, EV_LABEL, ITEM_LABEL, MICRO_STEPS, PATTERN_TEXT, RULE_COPY, STATUS, TIP_TEXT, VARIANT_LABEL, VERDICT_LABEL,
  clipMove, clipSafe, dowName, evText, evalCaveat, itemLabel, logMoreDays, lowDataHeadline, statusLabel, thaiDate, thaiRange,
} from "../brain/copy";
import type { PatternId, RuleId } from "../brain/types";
import { shareTiles, type ShareData } from "../share";
import { classItems } from "../term";

const THAI = /[฀-๿]/;
const noThai = (xs: string[]) => { for (const x of xs) { expect(x).toBeTruthy(); expect(THAI.test(x), x).toBe(false); } };
const A = { tpl: "Day off", item: "Meal 2", area: "sleep", days: 3, of: 5, avgLate: 42.3, avgSleepH: 6.4, wakeSd: 55, wakes: 9, debtH: 6, sleepH: 5,
  sjlMin: 80, rate: 0.1, lo: 0.25, hi: 0.5, c12: 1, mode: "delay", done: 2, planned: 5, delay: 30, waterMet: 3, logged: 7, n: 4, lowE: 3, weeks: 6,
  sessions: 20, run: 8, strain: 2, one: 4, over: 1, lowDays: 5, minWinH: 6.5, sing: 6, gym: 4 };

describe("brain copy en", () => {
  it("tables have no Thai in en (except the psych micro step inside mvd)", () => {
    withLang("en", () => {
      noThai([...Object.values(AREA_LABEL), ...Object.values(STATUS), ...Object.values(ITEM_LABEL), ...Object.values(CONFLICT_LABEL)]);
      noThai([...Object.values(EV_LABEL), ...Object.values(TIP_TEXT), ...VARIANT_LABEL, ...Object.values(VERDICT_LABEL)]);
      noThai(Object.entries(MICRO_STEPS).filter(([k]) => k !== "mvd").map(([, v]) => v));
      noThai([lowDataHeadline(), evalCaveat(), clipSafe(), clipMove(), logMoreDays(1), logMoreDays(3)]);
    });
    expect(withLang("en", () => AREA_LABEL.trading)).toBe("Trade discipline");
    expect(withLang("en", () => Object.keys(ITEM_LABEL))).toEqual(Object.keys(ITEM_LABEL));
  });
  it("rule copy in en for every rule and both branches", () => {
    const ids = Object.keys(RULE_COPY) as RuleId[];
    expect(ids.length).toBe(23);
    withLang("en", () => {
      for (const a of [A, { ...A, tpl: undefined, avgSleepH: undefined, debtH: 1, c12: 0, mode: "easy", delay: undefined, lowE: undefined, run: 2, days: 0, minWinH: 9 }])
        for (const id of ids) { const r = RULE_COPY[id]; noThai([r.short, r.title(a), r.ifThen(a)]); const w = r.why(a); if (w) noThai([w]); }
    });
    expect(withLang("en", () => RULE_COPY.R02.why(A))).toBe("Wake time varies ±55 min over 9 days");
    expect(withLang("en", () => RULE_COPY.R07.why(A))).toBe("Meal 2 done 2/5 days · Avg 30 min behind plan");
    expect(withLang("en", () => RULE_COPY.R10.why({ days: 1 }))).toBe("Main meal within 45 min before gym on 1 day");
  });
  it("th rule copy unchanged", () => {
    expect(RULE_COPY.R01.why(A)).toBe("เข้านอนช้ากว่าแผน 3 ใน 5 วันเกม เฉลี่ย 42.3 นาที · นอนเฉลี่ย 6.4 ชม.");
    expect(RULE_COPY.R01.title({})).toBe("ลองเปิดแจ้งเตือนแมตช์สุดท้ายไหม");
    expect(RULE_COPY.R03.why(A)).toBe("หนี้นอน 7 วัน 6 ชม. · เป็นคำแนะนำทั่วไป");
    expect(RULE_COPY.R07.title(A)).toBe("ลองขยับเวลา Meal 2 ในDay offไหม");
    expect(RULE_COPY.R23.ifThen({})).toBe("คืนนี้แค่ล้างหน้า + แปรงฟัน ก็นับ · ปรับเป็นระดับ เบา ได้ที่ ตั้งค่า > ดูแลตัวเอง");
    expect(RULE_COPY.R10.why({})).toBe("กินมื้อหลักภายใน 45 นาทีก่อนยิม undefined วัน");
  });
  it("patterns, evidence, status and dates", () => {
    const p = { eff: 1, nA: 5, nB: 1, n: 1, mA: 0.8, mB: 0.6 };
    withLang("en", () => {
      for (const id of Object.keys(PATTERN_TEXT) as PatternId[]) noThai([PATTERN_TEXT[id](p), PATTERN_TEXT[id]({ ...p, eff: -1 })]);
      expect(PATTERN_TEXT.P1(p)).toBe("On days with 7+ h of sleep, you tend to get more done (80% vs 60%, 5/1 day)");
      expect(evText("days", 1)).toBe("1 day");
      expect(evText("days", 2.5)).toBe("2.5 days");
      expect(evText("unknown", 2)).toBe("unknown 2");
      expect(statusLabel(null, 1)).toBe("Not enough data yet");
      expect(thaiDate("2026-11-02")).toBe("Mon 2 Nov");
      expect(thaiRange("2026-10-30", "2026-11-05")).toBe("30 Oct-5 Nov");
      expect(dowName(4)).toBe("Thursday");
      expect(itemLabel(undefined, "x", "zzz", { canonical: true })).toBe("Item");
    });
    expect(PATTERN_TEXT.P5({ ...p, eff: -1 })).toBe("วันทำงานมักทำได้ครบน้อยกว่าวันว่าง (80% vs 60%, 5/1 วัน)");
    expect(evText("wakeSd", 12.345)).toBe("เวลาตื่นแกว่ง ±12.35 นาที");
    expect(thaiDate("2026-10-24")).toBe("เสาร์ 24 ต.ค.");
    expect(thaiRange("2026-10-24", "2026-10-30")).toBe("24-30 ต.ค.");
  });
});

describe("share + term en", () => {
  const d: ShareData = { range: "x", band: { key: "day", cells: [], hit: 5, elig: 6 }, liveH: 34.5, gym: 1, weight: { delta: 0.4, kg: 70.2, pts: [70, 70.4] }, sleep: 7 };
  it("tiles in en", () => {
    const t = withLang("en", () => shareTiles(d));
    noThai(t.flatMap((x) => [x.label, x.unit]));
    expect(t.find((x) => x.key === "gym")?.unit).toBe("day");
    expect(withLang("en", () => shareTiles({ ...d, gym: 3 })).find((x) => x.key === "gym")?.unit).toBe("days");
    expect(shareTiles(d).find((x) => x.key === "gym")?.unit).toBe("ครั้ง");
  });
  it("class room sub follows the language, the room stays as typed", () => {
    const term = { start: "2026-11-01", end: "2026-12-31", cls: [{ id: "a1", d: 1, s: 540, e: 660, t: "วิชา A", r: "B-201" }] };
    expect(withLang("en", () => classItems(term, "2026-11-02"))[0].sub).toBe("Room B-201");
    expect(classItems(term, "2026-11-02")[0].sub).toBe("ห้อง B-201");
  });
});

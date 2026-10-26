// Round E pilot (rotation.ts): labels follow the language; th is byte-identical to v1.8.
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n/core";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL } from "../rotation";

const THAI = /[฀-๿]/;

describe("rotation labels", () => {
  it("th unchanged", () => {
    expect({ ...GYM_LABEL }).toEqual({ D1: "ขา + หน้าท้อง", D2: "อก + หลังแขน", D3: "หลัง + หน้าแขน", D4: "ไหล่ + ส่วนที่ขาด", R: "พัก / คาร์ดิโอ / เทนนิส" });
    expect(PERSONALITY_LABEL.P3).toBe("อ่านหนังสือ + สรุป");
  });
  it("en has no Thai and covers every code", () => {
    const en = withLang("en", () => [...GYM_CYCLE.map((c) => GYM_LABEL[c]), ...PERSONALITY_CYCLE.map((c) => PERSONALITY_LABEL[c])]);
    expect(en.length).toBe(10);
    for (const t of en) { expect(t).toBeTruthy(); expect(THAI.test(t)).toBe(false); }
    expect(withLang("en", () => GYM_LABEL.D1)).toBe("Legs + abs");
    expect(withLang("en", () => Object.keys(PERSONALITY_LABEL))).toEqual(["P1", "P2", "P3", "P4", "P5"]);
  });
});

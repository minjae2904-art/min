// v1.8 honest insights: samples, confidence, rounding, observation-only wording.
import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { CONF_TEXT, NEED, aboutMin, confOf, deltaOk, etaRange, half, honestInsights, kgRate, needText, patternConf, rateOk, round5, weightHint } from "../honest";
import { normalize } from "../model";
import { rangeStats } from "../stats";
import { TODAY, build, dowOf } from "./brain-fixtures";

const lines = (s: ReturnType<typeof build>, n = 28) => honestInsights(rangeStats(s, TODAY, n), s);
const BANNED = ["จึง", "เพราะ", "ทำให้"];

describe("helpers", () => {
  it("confOf bands", () => {
    expect([confOf(4, 5), confOf(5, 5), confOf(9, 5), confOf(10, 5)]).toEqual(["none", "early", "early", "ok"]);
    expect(CONF_TEXT.none).toBe("ยังไม่พอสรุป");
    expect([patternConf("medium"), patternConf("high")]).toEqual([CONF_TEXT.early, CONF_TEXT.ok]);
    expect(needText(3)).toBe("ยังไม่พอสรุป · บันทึกอีก 3 วัน แล้วจะเริ่มเห็นแนวโน้ม");
  });
  it("kgRate rounds to one decimal with a sign, steady under 0.05", () => {
    expect(kgRate(null)).toBe("-");
    expect([kgRate(0.04), kgRate(-0.049), kgRate(0)]).toEqual(["ทรงตัว", "ทรงตัว", "ทรงตัว"]);
    expect(kgRate(0.26)).toBe("+0.3 kg/สัปดาห์");
    expect(kgRate(-0.34)).toBe("-0.3 kg/สัปดาห์");
    expect(kgRate(0.123456)).toBe("+0.1 kg/สัปดาห์");
  });
  it("aboutMin, round5 and half", () => {
    expect([aboutMin(50), aboutMin(5), aboutMin(-68), aboutMin(50, false)]).toEqual(["ราว ±45 นาที", "ราว ±15 นาที", "ราว ±75 นาที", "ราว 45 นาที"]);
    expect([round5(67), round5(62.4), round5(100)]).toEqual([65, 60, 100]);
    expect([half(6.74), half(7.0), half(6.2)]).toEqual(["6.5", "7", "6"]);
  });
  it("deltaOk needs both periods filled", () => {
    expect(deltaOk(7, 7, 28)).toBe(true);
    expect(deltaOk(6, 9, 28)).toBe(false);
    expect(deltaOk(4, 4, 7)).toBe(true);
    expect(deltaOk(3, 4, 7)).toBe(false);
  });
});

describe("etaRange", () => {
  const withWeights = (n: number, every: number, perWeek = 0.5) => {
    const s = normalize({});
    s.profile = { ...s.profile, startKg: 67, goalKg: 85 };
    for (let i = n - 1; i >= 0; i--) s.weights.push({ date: addDays(TODAY, -i * every), kg: 67 + ((n - 1 - i) * every * perWeek) / 7 });
    return s;
  };
  it("is null below 8 weigh-ins, a 14-day span, or without a gain", () => {
    expect(etaRange(withWeights(7, 3), TODAY)).toBeNull();
    expect(etaRange(withWeights(10, 1), TODAY)).toBeNull(); // 9-day span
    expect(etaRange(withWeights(10, 3, 0), TODAY)).toBeNull();
    expect(etaRange(withWeights(10, 3, -0.5), TODAY)).toBeNull();
  });
  it("gives a month range, never a day", () => {
    const r = etaRange(withWeights(10, 3), TODAY)!;
    expect(r).toMatch(/^ราว \S+/);
    expect(r).not.toMatch(/\d{1,2} \S+ \d{4}/);
    const done = withWeights(10, 3);
    done.profile.goalKg = 60;
    expect(etaRange(done, TODAY)).toBeNull();
  });
});

describe("honestInsights", () => {
  it("below 5 logged days returns only the need line", () => {
    expect(lines(build(3))).toEqual([{ text: needText(2), conf: "none" }]);
    expect(lines(build(4))).toEqual([{ text: needText(1), conf: "none" }]);
  });
  it("weekday comparisons need at least 2 days per weekday", () => {
    const bad = (date: string) => (dowOf(date) === 1 ? { ticks: "none" as const } : {});
    expect(lines(build(7, bad), 7).some((l) => l.text.includes("วันจันทร์"))).toBe(false);
    const l = lines(build(21, bad), 21).find((x) => x.text.startsWith("วันจันทร์"));
    expect(l?.text).toMatch(/^วันจันทร์มักทำได้น้อยกว่าวันอื่น \(ราว \d+%\) วัน\S+ทำได้ดีสุด \(ราว \d+%\)$/);
    expect(l!.text.match(/\d+(?=%)/g)!.every((x) => Number(x) % 5 === 0)).toBe(true);
    expect(l!.conf).toBe("early"); // 3 Mondays
  });
  it("energy needs 5 high and 5 low days", () => {
    const f = (k: number) => (_d: string, i: number) => (i < k ? { checkin: [1, 3, 3] as [number, number, number], ticks: "none" as const } : { checkin: [5, 5, 5] as [number, number, number] });
    expect(lines(build(14, f(4)), 14).some((l) => l.text.includes("พลังงานดี"))).toBe(false);
    const l = lines(build(14, f(5)), 14).find((x) => x.text.includes("พลังงานดี"));
    expect(l).toMatchObject({ conf: "early" });
  });
  it("the late item needs 5 timed ticks and reads as a rounded observation", () => {
    const s = build(14, () => ({ late: { gym: 70 } }));
    const l = lines(s, 14).find((x) => x.text.includes("มักทำช้ากว่ากำหนด"));
    expect(l?.text).toMatch(/มักทำช้ากว่ากำหนดราว \d+ นาที$/);
    expect(l?.tip).toBe("ปรับเวลาได้ที่ ตั้งค่า > แผนประจำวัน");
  });
  it("sleep, weight and water lines use rounded numbers and counts", () => {
    const s = build(21, () => ({ sleepH: 6.2, water: 500 }));
    const t = lines(s, 21).map((l) => l.text);
    expect(t).toContain("นอนเฉลี่ยราว 6 ชม./คืน (20 คืน)");
    expect(t.find((x) => x.startsWith("ดื่มน้ำถึงเป้า"))).toMatch(/^ดื่มน้ำถึงเป้า 0\/21 วัน เฉลี่ยราว 0\.5 ลิตร$/);
    expect(t.find((x) => x.startsWith("น้ำหนักแนวโน้ม"))).toMatch(/^น้ำหนักแนวโน้ม (ทรงตัว|[+-]\d\.\d kg\/สัปดาห์) · (อยู่ใน|ช้ากว่า|เร็วกว่า)ช่วงเป้า$/);
  });
  it("observations only, every line has a confidence, at most 6 lines", () => {
    const messy = build(28, (_d, i) => ({ ticks: i % 3 ? "all" : "none", sleepH: i % 2 ? 5.5 : 8, bedLate: (i % 4) * 60, water: i % 2 ? 0 : "goal", checkin: i % 2 ? [1, 2, 3] : [5, 5, 5], late: { gym: 80 } }));
    for (const s of [messy, build(28), build(10)]) {
      const l = lines(s);
      expect(l.length).toBeGreaterThan(0);
      expect(l.length).toBeLessThanOrEqual(6);
      for (const x of l) {
        expect(["none", "early", "ok"]).toContain(x.conf);
        for (const w of BANNED) expect(x.text + (x.tip ?? "")).not.toContain(w);
      }
    }
    expect(lines(messy).length).toBe(6);
  });
  it("a clean month gives the calm fallback line", () => {
    expect(lines(build(28, () => ({}), { kg: null }))).toEqual([{ text: "ยังไม่เห็นจุดที่ต้องปรับจากข้อมูลช่วงนี้", conf: "ok" }]);
    expect(lines(build(10, () => ({}), { kg: null }), 10)).toEqual([{ text: "ยังไม่เห็นจุดที่ต้องปรับจากข้อมูลช่วงนี้", conf: confOf(10, NEED.days) }]);
    expect(lines(build(28)).map((l) => l.text)).toEqual([expect.stringMatching(/^น้ำหนักแนวโน้ม .* · อยู่ในช่วงเป้า$/)]);
  });
});

describe("weight rate gate (stat tile and insights)", () => {
  const w = (weighIns: number, spanDays: number, perWeek = 0.4) => ({ weighIns, spanDays, perWeek });
  it("rateOk needs 5 weigh-ins over 10 days", () => {
    expect(rateOk(null)).toBe(false);
    expect(rateOk(w(2, 1, 1.4))).toBe(false);
    expect(rateOk(w(5, 9))).toBe(false);
    expect(rateOk(w(5, 10))).toBe(true);
  });
  it("weightHint shows the rate only when rateOk, else what unlocks it", () => {
    expect(weightHint(null, 7)).toBe("ยังไม่มีข้อมูลชั่ง");
    expect(weightHint(w(2, 1, 1.4), 7)).toBe("ชั่ง 2 ครั้ง · ชั่งอีก 3 ครั้งเพื่อดูอัตรา");
    expect(weightHint(w(6, 6), 7)).toBe("ชั่ง 6 ครั้ง · ดูอัตราในช่วง 30 วัน");
    expect(weightHint(w(6, 6), 30)).toBe("ชั่ง 6 ครั้ง · ต้องชั่งห่างกันอย่างน้อย 10 วันเพื่อดูอัตรา");
    expect(weightHint(w(6, 20), 30)).toBe("+0.4 kg/สัปดาห์ · ชั่ง 6 ครั้ง");
  });
});

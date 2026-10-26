// Round E batch 9 (stats.ts, ai.ts): English output has no Thai; th stays the v1.8 text.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withLang } from "../../i18n/core";
import { askAI } from "../ai";
import { applyLevel } from "../care/progress";
import { normalize, type DayLog, type State } from "../model";
import { insights, rangeStats, waterPlan, type RangeStats } from "../stats";

const THAI = /[฀-๿]/;
const D = "2026-10-27";
const day = (type: string, o: Partial<DayLog> = {}): DayLog => ({ type, done: {}, waterMl: 0, ...o });

// A RangeStats that trips every insight rule (item titles are user-facing text from the plan: English here).
function busy(s: State, perWeek = 0.05): RangeStats {
  const b = rangeStats(s, D, 14);
  return {
    ...b, n: 14, loggedDays: 10,
    items: [{ id: "a", title: "Walk", planned: 5, done: 2, onTime: 0, avgDelay: 60, timed: 2 }],
    weekday: [0.2, 0.9, 0.5, 0.6, null, null, null],
    waterMetDays: 2, waterAvg: 1800, perWeek: 1.5,
    rotation: { D1: 0, D2: 3, D3: 1, D4: 1 },
    weight: { from: 70, to: 70, change: 0, perWeek, weighIns: 6, spanDays: 14 },
    meal2: { A: 1, B: 2, C: 2 },
    energyEffect: { hi: 0.9, lo: 0.4 },
    sleepAvg: 6, sleepNights: 5,
    sleep: { ...b.sleep, bedSd: 90, scoreLong: 0.9, scoreShort: 0.5 },
    feel: { mood: 3, energy: 3, sleep: 2, n: 5 },
    trade: { ...b.trade, planned: 6, days: 2, count: 8 },
    acts: { sing: 1, singPlanned: 4, mc: 0, mcPlanned: 0, stream: 1, streamPlanned: 4 },
    onTimeRate: 0.85, avgScore: 0.95,
  };
}

describe("stats insights in English", () => {
  it("every rule has English text without Thai; th is unchanged", () => {
    const s = normalize({});
    for (const w of [0.05, 0.3, 2, -0.5]) {
      const th = insights(busy(s, w), s), en = withLang("en", () => insights(busy(s, w), s));
      expect(en.length).toBe(th.length);
      expect(en.length).toBeGreaterThanOrEqual(19);
      for (const x of en) expect(THAI.test(x), x).toBe(false);
    }
    const th = insights(busy(s), s), en = withLang("en", () => insights(busy(s), s));
    expect(th).toContain("วันอาทิตย์ทำได้น้อยสุด (20%) ส่วนวันจันทร์ดีที่สุด (90%)");
    expect(th).toContain("น้ำหนักขึ้น 0.05 kg/สัปดาห์ ช้ากว่าเป้า ลองเพิ่ม shake ~400 kcal/วัน");
    expect(en).toContain("Sunday is your lightest day (20%), Monday your best (90%)");
    expect(en).toContain("Legs 0 times, far fewer than other days (3 times)");
    expect(en[0]).toBe("\"Walk\" done on 2/5 days, the one skipped most. Try moving it or pairing it with something you already do?");
    expect(withLang("en", () => insights(busy(s, -0.5), s))).toContain("Weight down 0.50 kg/week, slower than target. Try adding a ~400 kcal shake a day?");
  });
  it("few-days and all-good lines", () => {
    const s = normalize({});
    const r = rangeStats(s, D, 7);
    expect(withLang("en", () => insights({ ...r, loggedDays: 0 }, s))).toEqual(["Log at least 3 days to see insights"]);
    const quiet: RangeStats = { ...r, loggedDays: 5, waterMetDays: 5, perWeek: 4, avgScore: 0 };
    expect(insights(quiet, s)).toEqual(["ทุกอย่างสม่ำเสมอดี ไม่มีจุดที่ต้องปรับ"]);
    expect(withLang("en", () => insights(quiet, s))).toEqual(["Everything is steady. Nothing to adjust"]);
  });
});

describe("waterPlan labels in English", () => {
  it("parts have English labels; th unchanged", () => {
    const s = normalize({});
    applyLevel(s, "std", D);
    const d = day("stream-gym", { hot: 1 });
    expect(waterPlan(s, d, 67).parts.map((x) => x.label)).toEqual(["ฐาน (35 ml/กก.)", "ยิม 75 นาที", "ไลฟ์ 5.5 ชม. (ค่าประมาณ ปิดได้)", "วันร้อน/กลางแจ้ง"]);
    const en = withLang("en", () => waterPlan(s, d, 67).parts.map((x) => x.label));
    expect(en).toEqual(["Base (35 ml/kg)", "Gym 75 min", "Stream 5.5 h (estimate, can be turned off)", "Hot/outdoor day"]);
  });
});

describe("askAI errors in English", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("uses the language of the call", async () => {
    expect(await withLang("en", () => ({ p: askAI(null, "coach") })).p).toEqual({ error: "Enter your PIN first" });
    expect(await askAI(null, "coach")).toEqual({ error: "ต้องเข้าด้วย PIN ก่อน" });
    for (const [status, body, want] of [[404, {}, "AI isn't on this site yet (push the latest code first)"], [500, { missing: true }, "Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) in Vercel first"], [502, {}, "Error (502)"]] as const) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
      const r = await withLang("en", () => ({ p: askAI("t", "ask", "q") })).p;
      expect(r.error).toBe(want);
    }
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    expect((await withLang("en", () => ({ p: askAI("t", "ask") })).p).error).toBe("Can't connect");
  });
});

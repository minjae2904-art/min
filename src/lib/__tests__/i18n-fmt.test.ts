// Round E fmt (spec 8.3): every th preset equals its legacy expression; en presets follow en-GB.
import { describe, expect, it } from "vitest";
import * as fmt from "../../i18n/fmt";
import { withLang } from "../../i18n/core";

// Legacy code, copied from the baseline (e495f7f).
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DOW_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const ymdParts = (date: string) => { const [, m, d] = date.split("-").map(Number); return { m, d }; };
const thaiDate = (date: string) => { const { m, d } = ymdParts(date); return `${DOW_LONG[new Date(date + "T12:00:00").getDay()]} ${d} ${MON[m - 1]}`; };
const thaiRange = (from: string, to: string) => { const a = ymdParts(from), b = ymdParts(to); return a.m === b.m ? `${a.d}-${b.d} ${MON[b.m - 1]}` : `${a.d} ${MON[a.m - 1]}-${b.d} ${MON[b.m - 1]}`; };
const thShort = (date: string) => { const [, m, d] = date.split("-").map(Number); return `${d} ${MON[m - 1]}`; };
const shortDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const THAI_DATE = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ""}` : `${m} น.`);
const durText = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} ชั่วโมง ${r} นาที` : `${r} นาที`; };

// 12 months x 7 consecutive days = every weekday in every month (2026).
const DATES = Array.from({ length: 12 }, (_, i) => Array.from({ length: 7 }, (_, d) => `2026-${String(i + 1).padStart(2, "0")}-${String(d + 3).padStart(2, "0")}`)).flat();
const at = (iso: string, h: number, m: number) => new Date(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).getTime();

describe("fmt th = legacy output", () => {
  it("name tables", () => {
    for (let d = 0; d < 7; d++) { expect(fmt.dowShort(d, "th")).toBe(DOW[d]); expect(fmt.dowLong(d, "th")).toBe(DOW_LONG[d]); }
    for (let m = 1; m <= 12; m++) expect(fmt.monShort(m, "th")).toBe(MON[m - 1]);
    expect([fmt.dowShort(7), fmt.dowLong(-1), fmt.monShort(0)]).toEqual(["", "", ""]);
  });
  it("dates, every weekday x month", () => {
    for (const iso of DATES) {
      expect(fmt.dateShort(iso, "th")).toBe(thaiDate(iso));
      expect(fmt.dayMonth(iso, "th")).toBe(thShort(iso));
      expect(fmt.dayMonth(iso, "th")).toBe(shortDate(iso));
      expect(fmt.dateLong(iso, "th")).toBe(THAI_DATE(iso));
      const d = new Date(iso + "T12:00:00");
      expect(fmt.monthLong(d, "th")).toBe(d.toLocaleDateString("th-TH", { month: "long" }));
      expect(fmt.year(d, "th")).toBe(d.toLocaleDateString("th-TH", { year: "numeric" }));
      const t = at(iso, 21, 5);
      expect(fmt.clock(t, "th")).toBe(new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
      expect(fmt.dowClock(t, "th")).toBe(new Date(t).toLocaleString("th-TH", { weekday: "short", hour: "2-digit", minute: "2-digit" }));
      expect(fmt.dayMonthClock(t, "th")).toBe(new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
    }
    expect(fmt.dateShort("2026-10-23", "th")).toBe("ศุกร์ 23 ต.ค.");
    expect(fmt.dateLong("2026-11-02", "th")).toBe("วันจันทร์ที่ 2 พฤศจิกายน");
    expect(fmt.year(new Date("2026-11-05T12:00:00"), "th")).toBe("พ.ศ. 2569");
    expect(fmt.dowClock(at("2026-11-05", 21, 5), "th")).toBe("พฤหัส 21:05");
    expect(fmt.dayMonthClock(at("2026-11-05", 21, 5), "th")).toBe("5 พ.ย. 21:05");
  });
  it("ranges", () => {
    for (const a of DATES) for (const b of ["2026-03-30", "2026-04-05", "2026-12-31"]) expect(fmt.range(a, b, "th")).toBe(thaiRange(a, b));
    expect(fmt.range("2026-10-24", "2026-10-30", "th")).toBe("24-30 ต.ค.");
    expect(fmt.range("2026-10-30", "2026-11-05", "th")).toBe("30 ต.ค.-5 พ.ย.");
  });
  it("durations and numbers", () => {
    for (let m = 0; m <= 600; m += 5) { expect(fmt.dur(m, "th")).toBe(span(m)); expect(fmt.durLong(m, "th")).toBe(durText(m)); }
    for (const n of [0, 7, 999, 1000, 12345, 12345.5, 1234567.891, -2500]) expect(fmt.num(n, "th")).toBe(n.toLocaleString("en-US"));
  });
  it("defaults to the ambient language", () => {
    expect(fmt.dateShort("2026-11-02")).toBe("จันทร์ 2 พ.ย.");
    expect(withLang("en", () => fmt.dateShort("2026-11-02"))).toBe("Mon 2 Nov");
  });
});

describe("fmt en", () => {
  it("spec examples", () => {
    expect(fmt.dateShort("2026-11-02", "en")).toBe("Mon 2 Nov");
    expect(fmt.dayMonth("2026-10-24", "en")).toBe("24 Oct");
    expect(fmt.range("2026-10-24", "2026-10-30", "en")).toBe("24-30 Oct");
    expect(fmt.range("2026-10-30", "2026-11-05", "en")).toBe("30 Oct-5 Nov");
    expect(fmt.dateLong("2026-11-02", "en")).toBe("Monday 2 November");
    expect(fmt.year(new Date("2026-11-05T12:00:00"), "en")).toBe("2026");
    expect(fmt.dowClock(at("2026-11-05", 21, 5), "en")).toBe("Thu 21:05");
    expect(fmt.dayMonthClock(at("2026-11-05", 21, 5), "en")).toBe("5 Nov, 21:05");
    expect(fmt.num(12345.5, "en")).toBe("12,345.5");
    expect([fmt.dur(90, "en"), fmt.dur(60, "en"), fmt.dur(45, "en")]).toEqual(["1 h 30 min", "1 h", "45 min"]);
    expect([fmt.durLong(60, "en"), fmt.durLong(121, "en"), fmt.durLong(45, "en"), fmt.durLong(1, "en")]).toEqual(["1 hour 0 minutes", "2 hours 1 minute", "45 minutes", "1 minute"]);
  });
  it("Intl presets equal en-GB", () => {
    for (const iso of DATES) {
      const d = new Date(iso + "T12:00:00"), t = at(iso, 7, 30);
      expect(fmt.dateLong(iso, "en")).toBe(d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
      expect(fmt.monthLong(d, "en")).toBe(d.toLocaleDateString("en-GB", { month: "long" }));
      expect(fmt.year(d, "en")).toBe(d.toLocaleDateString("en-GB", { year: "numeric" }));
      expect(fmt.clock(t, "en")).toBe(new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      expect(fmt.dowClock(t, "en")).toBe(new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }));
      // dayMonth, dateShort and dayMonthClock use the name tables (en-GB Intl abbreviates September as "Sept").
      const sep = (s: string) => s.replace("Sept", "Sep").replace(",", "");
      expect(fmt.dayMonth(iso, "en")).toBe(sep(d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })));
      expect(fmt.dateShort(iso, "en")).toBe(sep(d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })));
      expect(fmt.dayMonthClock(t, "en").replace(",", "")).toBe(sep(new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })));
    }
  });
});

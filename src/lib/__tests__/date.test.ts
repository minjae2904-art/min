import { describe, expect, it } from "vitest";
import { addDays, at, hm, logicalDate, logicalMinutes, ROLLOVER_HOUR } from "../date";

describe("timezone", () => {
  it("runs in Asia/Bangkok (setup file)", () => {
    expect(new Date("2026-10-19T00:59:00Z").getHours()).toBe(7);
  });
});

describe("logicalDate", () => {
  it("counts the small hours toward the previous day", () => {
    expect(logicalDate(new Date("2026-10-19T07:59:00+07:00"))).toBe("2026-10-18");
  });
  it("rolls over at ROLLOVER_HOUR", () => {
    expect(ROLLOVER_HOUR).toBe(8);
    expect(logicalDate(new Date("2026-10-19T08:00:00+07:00"))).toBe("2026-10-19");
    expect(logicalDate(new Date("2026-10-19T23:30:00+07:00"))).toBe("2026-10-19");
  });
});

describe("logicalMinutes", () => {
  it("continues past 1440 after midnight", () => {
    expect(logicalMinutes(new Date("2026-10-19T02:00:00+07:00"))).toBe(1560);
    expect(logicalMinutes(new Date("2026-10-19T07:59:00+07:00"))).toBe(1919);
  });
  it("is plain minutes during the day", () => {
    expect(logicalMinutes(new Date("2026-10-19T13:00:00+07:00"))).toBe(780);
    expect(logicalMinutes(new Date("2026-10-19T08:00:00+07:00"))).toBe(480);
  });
});

describe("hm / at", () => {
  it("round-trip logical minutes to wall-clock text", () => {
    expect(at(2)).toBe(1560);
    expect(at(13, 30)).toBe(810);
    expect(hm(1560)).toBe("02:00");
    expect(hm(at(5, 5))).toBe("05:05");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

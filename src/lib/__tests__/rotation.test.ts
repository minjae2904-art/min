import { describe, expect, it } from "vitest";
import { GYM_CYCLE, nextInCycle, PERSONALITY_CYCLE, type LogEntry } from "../rotation";

const log = (...codes: string[]): LogEntry[] => codes.map((code, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, code }));

describe("nextInCycle", () => {
  it("starts at D1 with no history", () => {
    expect(nextInCycle(GYM_CYCLE, [])).toBe("D1");
    expect(nextInCycle(GYM_CYCLE, log("R"))).toBe("D1");
  });
  it("follows the last real session", () => {
    expect(nextInCycle(GYM_CYCLE, log("D1", "D2"))).toBe("D3");
    expect(nextInCycle(GYM_CYCLE, log("D2", "R"))).toBe("D3");
    expect(nextInCycle(GYM_CYCLE, log("D1", "D3"))).toBe("D4");
  });
  it("offers rest once after D4, then moves on", () => {
    expect(nextInCycle(GYM_CYCLE, log("D4"))).toBe("R");
    expect(nextInCycle(GYM_CYCLE, log("D4", "R"))).toBe("D1");
    expect(nextInCycle(GYM_CYCLE, log("D4", "R-tennis"))).toBe("D1");
    expect(nextInCycle(GYM_CYCLE, log("D4", "R", "R"))).toBe("D1");
  });
  it("sorts by date, not array order", () => {
    const h: LogEntry[] = [{ date: "2026-10-05", code: "D3" }, { date: "2026-10-01", code: "D1" }];
    expect(nextInCycle(GYM_CYCLE, h)).toBe("D4");
  });
  it("wraps the personality cycle", () => {
    expect(nextInCycle(PERSONALITY_CYCLE, log("P5"))).toBe("P1");
    expect(nextInCycle(PERSONALITY_CYCLE, log("P2"))).toBe("P3");
  });
});

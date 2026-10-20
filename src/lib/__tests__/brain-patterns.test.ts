import { describe, expect, it } from "vitest";
import { findPatterns } from "../brain/patterns";
import { extractDays } from "../brain/signals";
import { build, perfect, TODAY } from "./brain-fixtures";

const P = (s: ReturnType<typeof build>) => findPatterns(extractDays(s, TODAY, 28));
// Alternate 8 h and 6 h nights on balanced days; `miss` items are left undone after the short (or long) nights.
const alt = (n: number, miss: string[], shortIsWorse = true) =>
  build(n, (_d, i) => (i % 2 ? { tpl: "balanced", sleepH: 8, untick: shortIsWorse ? [] : miss } : { tpl: "balanced", sleepH: 6, untick: shortIsWorse ? miss : [] }));

describe("findPatterns", () => {
  it("returns nothing below the n gates", () => {
    expect(P(alt(6, ["posture", "mc-check", "snack", "presleep"]))).toEqual([]);
    expect(P(build(3))).toEqual([]);
  });
  it("P1 sign, medium vs high", () => {
    const high = P(alt(28, ["posture", "mc-check", "snack", "presleep"])).find((p) => p.id === "P1")!;
    expect(high.conf).toBe("high");
    expect(high.eff).toBeGreaterThan(0.15);
    expect(high.text).toContain("มักทำได้ครบกว่า");
    const med = P(alt(28, ["posture", "mc-check"])).find((p) => p.id === "P1")!;
    expect(med.conf).toBe("medium");
    const neg = P(alt(28, ["posture", "mc-check", "snack", "presleep"], false)).find((p) => p.id === "P1")!;
    expect(neg.eff).toBeLessThan(0);
  });
  it("small groups stay medium even with a big effect", () => {
    const p = P(alt(10, ["posture", "mc-check", "snack", "presleep"])).find((x) => x.id === "P1");
    expect(p?.conf).toBe("medium");
  });
  it("only P1-P9 ids are ever emitted, hedged", () => {
    for (const s of [perfect(), alt(28, ["posture", "mc-check", "snack", "presleep"]), build(28, (_d, i) => ({ checkin: [1 + (i % 5), 1 + (i % 5), 3], sleepH: 5 + (i % 5) }))]) {
      for (const p of P(s)) {
        expect(p.id).toMatch(/^P[1-9]$/);
        expect(["medium", "high"]).toContain(p.conf);
        expect(p.text).toMatch(/มัก|ดูเหมือน/);
      }
    }
  });
  it("P2 Spearman picks up sleep -> energy", () => {
    const p = P(build(28, (_d, i) => ({ sleepH: 5 + (i % 5), checkin: [1 + (i % 5), 3, 3] }))).find((x) => x.id === "P2");
    expect(p?.conf).toBe("high");
    expect(p!.eff).toBeGreaterThan(0.5);
  });
});

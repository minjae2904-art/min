// v1.8 chart spec: extents, scales, paths, clamps, minimum samples and text summaries.
import { describe, expect, it } from "vitest";
import { CH, areaPath, barGap, barPct, enough, goalLabelLeft, heatLevel, linePath, niceExtent, scale, seriesSummary } from "../chart";

describe("niceExtent", () => {
  it("snaps outward to the step after padding (body chart: step 0.5, pad 0.5)", () => {
    expect(niceExtent([67.3, 68.1], { step: 0.5, pad: 0.5 })).toEqual([66.5, 69]);
    expect(niceExtent([67.3, 68.1], { step: 0.5, pad: 0.5, include: [70] })).toEqual([66.5, 70.5]);
    expect(niceExtent([3, 17], { step: 5 })).toEqual([0, 20]);
  });
  it("flat domain grows one step each side; empty -> [0, step]", () => {
    expect(niceExtent([5, 5])).toEqual([4, 6]);
    expect(niceExtent([])).toEqual([0, 1]);
    expect(niceExtent([NaN], { step: 2 })).toEqual([0, 2]);
  });
  it("no float noise", () => {
    expect(niceExtent([0.25, 0.31], { step: 0.1 })).toEqual([0.2, 0.4]);
  });
});

describe("scale", () => {
  it("maps linearly and inverts for y", () => {
    const y = scale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(y(10)).toBe(0);
  });
  it("flat domain maps to the middle", () => {
    expect(scale([3, 3], [0, 20])(99)).toBe(10);
  });
});

describe("paths", () => {
  it("linePath uses M then L with one decimal", () => {
    expect(linePath([[0, 0], [10.04, 5.06]])).toBe("M0.0,0.0L10.0,5.1");
    expect(linePath([])).toBe("");
  });
  it("areaPath closes to the baseline; needs 2 points", () => {
    expect(areaPath([[0, 2], [10, 4]], 20)).toBe("M0.0,2.0L10.0,4.0L10.0,20.0L0.0,20.0Z");
    expect(areaPath([[0, 2]], 20)).toBe("");
  });
});

describe("bars", () => {
  it("barPct clamps 2..100 and mutes null", () => {
    expect(barPct(null, 10)).toBe(2);
    expect(barPct(0, 10)).toBe(2);
    expect(barPct(5, 10)).toBe(50);
    expect(barPct(50, 10)).toBe(100);
    expect(barPct(5, 0)).toBe(2);
  });
  it("barGap follows the old StatsView rule", () => {
    expect([barGap(7), barGap(30), barGap(90)]).toEqual([3, 1, 0.5]);
  });
});

describe("enough", () => {
  it("line needs 2, spark with 1 point is ok, empty never", () => {
    expect(enough("line", 1)).toEqual({ ok: false, need: 2 });
    expect(enough("line", 2).ok).toBe(true);
    expect(enough("spark", 1).ok).toBe(true);
    expect(enough("bars", 0).ok).toBe(false);
  });
});

describe("heatLevel", () => {
  it("same cut points as the v1.x heatmap", () => {
    expect([0, 0.2, 0.5, 0.7, 0.9].map((v) => heatLevel(v, true, 0.8))).toEqual([0, 1, 2, 3, 4]);
    expect(heatLevel(0.9, false, 0.8)).toBe(0);
  });
});

describe("seriesSummary", () => {
  it("skips nulls, reports min/max/last with unit", () => {
    expect(seriesSummary({ label: "น้ำหนัก", values: [67.2, null, 68.04, 67.8], unit: "kg", decimals: 1 })).toBe("น้ำหนัก 3 จุด ต่ำสุด 67.2 สูงสุด 68.0 ล่าสุด 67.8 kg");
  });
  it("empty and one point", () => {
    expect(seriesSummary({ label: "ยกรวม", values: [] })).toBe("ยกรวม: ยังไม่มีข้อมูล");
    expect(seriesSummary({ label: "ยกรวม", values: [null] })).toBe("ยกรวม: ยังไม่มีข้อมูล");
    expect(seriesSummary({ label: "ยกรวม", values: [1200] })).toBe("ยกรวม 1 จุด ต่ำสุด 1200 สูงสุด 1200 ล่าสุด 1200");
  });
  it("CH sizes stay in step with the body chart", () => {
    expect(CH.line).toEqual({ w: 320, h: 170, padL: 34, padR: 8, padT: 10, padB: 18 });
  });
});

describe("goalLabelLeft", () => {
  it("moves the goal label left only when it would overlap the last-value label", () => {
    expect(goalLabelLeft(40, 44)).toBe(true); // baselines 37 and 37
    expect(goalLabelLeft(40, 55)).toBe(true); // 37 vs 48
    expect(goalLabelLeft(40, 56)).toBe(false); // 37 vs 49
    expect(goalLabelLeft(40, 20)).toBe(false); // 37 vs 13
  });
});

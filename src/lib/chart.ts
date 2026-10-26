// v1.8 chart spec (pure): one set of sizes, scales, paths and text summaries shared by every chart in Charts.tsx.
import { msgs } from "../i18n";
import * as M from "../i18n/msg/lib-7";

const m = msgs(M);
export const CH = { line: { w: 320, h: 170, padL: 34, padR: 8, padT: 10, padB: 18 }, spark: { w: 96, h: 28, pad: 3 }, bar: { h: 120 }, stroke: 2, dot: 3, halo: 3 } as const;

const tidy = (x: number) => Number(x.toFixed(6)); // drops float noise from step math (0.1 * 3)

// Axis extent snapped outward to `step` after padding; `include` (e.g. a goal) widens it. A flat domain grows by
// one step on each side so the line sits in the middle. No finite values -> [0, step].
export function niceExtent(vals: number[], o: { step?: number; include?: number[]; pad?: number } = {}): [number, number] {
  const step = o.step ?? 1, pad = o.pad ?? 0;
  const all = [...vals, ...(o.include ?? [])].filter(Number.isFinite);
  if (!all.length) return [0, step];
  let lo = tidy(Math.floor((Math.min(...all) - pad) / step) * step);
  let hi = tidy(Math.ceil((Math.max(...all) + pad) / step) * step);
  if (hi <= lo) { lo = tidy(lo - step); hi = tidy(hi + step); }
  return [lo, hi];
}

// Linear map from domain d to range r; a flat domain maps every value to the middle of the range.
export function scale(d: [number, number], r: [number, number]): (v: number) => number {
  if (d[1] === d[0]) return () => (r[0] + r[1]) / 2;
  const k = (r[1] - r[0]) / (d[1] - d[0]);
  return (v) => r[0] + (v - d[0]) * k;
}

const f1 = (n: number) => n.toFixed(1);
export function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(x)},${f1(y)}`).join("");
}

// Closed fill under a line down to baseY; fewer than 2 points has no area.
export function areaPath(pts: [number, number][], baseY: number): string {
  if (pts.length < 2) return "";
  return `${linePath(pts)}L${f1(pts[pts.length - 1][0])},${f1(baseY)}L${f1(pts[0][0])},${f1(baseY)}Z`;
}

// Bar height in percent: null (no data) is a muted 2% stub; values clamp to 2..100.
export function barPct(v: number | null, max: number): number {
  if (v === null || !(max > 0)) return 2;
  return Math.max(2, Math.min(100, (v / max) * 100));
}
export const barGap = (n: number) => (n > 45 ? 0.5 : n > 20 ? 1 : 3);

// Minimum points before a chart kind draws anything meaningful (a line needs 2, everything else 1).
export function enough(kind: "line" | "spark" | "bars" | "band" | "ring", n: number): { ok: boolean; need: number } {
  const need = kind === "line" ? 2 : 1;
  return { ok: n >= need, need };
}

// TrendLine labels: the goal label (right, y(goal) - 3) moves to the left edge when it would sit on the last-value label
// (right of the last dot, ly - 7); both are 10px text, so baselines closer than 12px collide.
export const goalLabelLeft = (yGoal: number, yLast: number) => Math.abs(yGoal - 3 - (yLast - 7)) < 12;

// Heatmap level 0..4 with the v1.x StatsView cut points (0, .4, .6, goodDay); unlogged days are 0.
export function heatLevel(score: number, logged: boolean, good: number): 0 | 1 | 2 | 3 | 4 {
  const v = logged ? score : 0;
  return v <= 0 ? 0 : v < 0.4 ? 1 : v < 0.6 ? 2 : v < good ? 3 : 4;
}

// Accessible one-line summary for role="img" charts.
export function seriesSummary(o: { label: string; values: (number | null)[]; unit?: string; decimals?: number }): string {
  const v = o.values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return m("chart.summary.empty", { label: o.label });
  const d = o.decimals ?? 0, f = (n: number) => n.toFixed(d);
  return m("chart.summary", { label: o.label, n: v.length, min: f(Math.min(...v)), max: f(Math.max(...v)), last: f(v[v.length - 1]), unit: o.unit ? ` ${o.unit}` : "" });
}

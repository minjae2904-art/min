// Pure numeric helpers and every heuristic threshold of the engine in one place (tune after 2-4 weeks of data).
import { avg, paceBand, sd } from "../stats";
import type { AreaKey } from "./types";

export { avg, paceBand, sd };

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// 0 at `bad`, 1 at `good`; works descending when bad > good.
export const lin = (x: number, bad: number, good: number) => clamp01((x - bad) / (good - bad));
// Weighted mean of the non-null parts; null when every part is null.
export function mix(parts: [number | null, number][]): number | null {
  let sw = 0, sv = 0;
  for (const [v, w] of parts) if (v !== null && Number.isFinite(v)) { sw += w; sv += w * v; }
  return sw ? sv / sw : null;
}
export const mean = avg;
export const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ranks = (a: number[]) => {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; // ties get the average rank
    i = j + 1;
  }
  return r;
};
// Spearman rank correlation (Pearson on ranks); null when n < 2 or a side is constant.
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const rx = ranks(xs.slice(0, n)), ry = ranks(ys.slice(0, n));
  const mx = avg(rx)!, my = avg(ry)!;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
// FNV-1a 32-bit, base36. Stable ids for candidates (same state -> same id on server and client).
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export const round15 = (m: number) => Math.round(m / 15) * 15;

export const BASE_W: Record<AreaKey, number> = { sleep: 1.5, nutrition: 1.5, training: 1.2, recovery: 1.2, consistency: 1.0, voice: 0.8, trading: 0.8, projects: 0.6, leisure: 0.6 };
export const DEFAULT_DUR: Record<string, number> = { weigh: 10, meal: 30, supp: 10, habit: 15, personality: 30, trade: 15, sing: 30, mc: 30, gym: 75, sleep: 0 };

// Heuristic thresholds (research-informed defaults, not proven for this user).
export const T = {
  bedLate: 45, // min past planned sleep that counts as late
  load: 0.9, // plan load that counts as heavy on a non-work day
  loadMax: 0.97, // variant sanity: no affected non-work date above this
  winH: 7.5, // minimum sleep window (h) between planned sleep and next planned wake
  burnoutLow: 5, burnoutOf: 7, // low check-in days out of the last week
  conf: 0.4, // below = "ข้อมูลน้อย": out of Balance and rules (except log-more/safety)
  minEligible: 3,
  blendMean: 0.7, blendLow: 0.3,
  focusW: 1.5,
  trendArrow: 5,
  moveMax: 60, moveStep: 15,
  kcalStep: 50, kcalMaxStep: 250, kcalMin: -300, kcalMax: 500,
  maxCandidates: 8,
  BASE_W, DEFAULT_DUR,
} as const;

// Fixed-hypothesis N-of-1 patterns P1-P9 over 28 days (info only, never drive actions). No fishing: only these.
import { PATTERN_TEXT } from "./copy";
import { mean, spearman } from "./math";
import type { DaySig, Pattern, PatternId } from "./types";

type Bin = { id: PatternId; kind: "score" | "rating" | "minutes"; pairs: [boolean, number][] };
const TH = { score: [0.1, 0.15], rating: [0.5, 0.8], minutes: [20, 30] } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

function binary({ id, kind, pairs }: Bin): Pattern | null {
  const a = pairs.filter((p) => p[0]).map((p) => p[1]), b = pairs.filter((p) => !p[0]).map((p) => p[1]);
  if (a.length < 4 || b.length < 4) return null;
  const mA = mean(a)!, mB = mean(b)!, eff = mA - mB, [mid, big] = TH[kind];
  const conf = a.length >= 7 && b.length >= 7 && Math.abs(eff) >= big ? "high" : Math.abs(eff) >= mid ? "medium" : null;
  if (!conf) return null;
  const p = { id, eff: r2(eff), nA: a.length, nB: b.length, mA: r2(mA), mB: r2(mB) };
  return { ...p, conf, text: PATTERN_TEXT[id](p) };
}

export function findPatterns(sigs: DaySig[]): Pattern[] {
  const today = sigs.at(-1)?.date ?? "";
  const done = sigs.filter((d) => d.logged && d.date < today); // completed days for score-type outcomes
  const prev = (i: number) => sigs[i - 1];
  const out: (Pattern | null)[] = [];
  const score = (d: DaySig) => d.score ?? 0;
  out.push(binary({ id: "P1", kind: "score", pairs: done.filter((d) => d.sleepH !== null).map((d) => [d.sleepH! >= 7, score(d)]) }));
  const se = sigs.filter((d) => d.sleepH !== null && d.checkin);
  if (se.length >= 10) {
    const rho = spearman(se.map((d) => d.sleepH!), se.map((d) => d.checkin!.e));
    if (rho !== null) {
      const conf = se.length >= 14 && Math.abs(rho) >= 0.5 ? "high" : Math.abs(rho) >= 0.3 ? "medium" : null;
      if (conf) { const p = { id: "P2" as const, eff: r2(rho), n: se.length }; out.push({ ...p, conf, text: PATTERN_TEXT.P2(p) }); }
    }
  }
  const p3: [boolean, number][] = [], p6: [boolean, number][] = [];
  sigs.forEach((d, i) => {
    const y = prev(i);
    if (!y || !d.checkin) return;
    if (y.bedLate !== null) p3.push([y.bedLate > 45, d.checkin.e]);
    if (y.logged && y.gym.planned) p6.push([y.gym.done, d.checkin.m]);
  });
  out.push(binary({ id: "P3", kind: "rating", pairs: p3 }));
  out.push(binary({ id: "P4", kind: "minutes", pairs: sigs.filter((d) => d.bedLate !== null).map((d) => [d.base === "game-max", d.bedLate!]) }));
  out.push(binary({ id: "P5", kind: "score", pairs: done.map((d) => [d.work, score(d)]) }));
  out.push(binary({ id: "P6", kind: "rating", pairs: p6 }));
  out.push(binary({ id: "P7", kind: "rating", pairs: done.filter((d) => d.checkin && d.sing.planned).map((d) => [d.sing.done, d.checkin!.m]) }));
  out.push(binary({ id: "P8", kind: "rating", pairs: done.filter((d) => d.checkin).map((d) => [d.water.ml >= d.water.goal, d.checkin!.e]) }));
  out.push(binary({ id: "P9", kind: "rating", pairs: sigs.filter((d) => d.checkin && d.trade.log).map((d) => [d.trade.log!.count > 1, d.checkin!.m]) }));
  return out.filter((p): p is Pattern => !!p);
}

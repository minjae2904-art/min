// v1.8 honest insights (pure): minimum samples, confidence wording, rounded numbers and observation-only phrasing.
// The tested stats.ts insights() and brain/patterns.ts stay unchanged; the UI reads this layer instead.
import { fmt, langObj, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-10";
import { addDays } from "./date";
import { trend } from "./health";
import type { State } from "./model";
import { paceBand, type RangeStats } from "./stats";

const m = msgs(M);

export const NEED = { early: 5, days: 7, pair: 5, weekday: 2, timed: 10, nights: 5, bedN: 7, weighIns: 5, weighSpan: 10, etaWeighIns: 8, etaSpan: 14 } as const;
export type Conf = "none" | "early" | "ok";
export const confOf = (n: number, need: number): Conf => (n < need ? "none" : n < need * 2 ? "early" : "ok");
export const CONF_TEXT: Record<Conf, string> = langObj(() => ({ none: m("honest.conf.none"), early: m("honest.conf.early"), ok: m("honest.conf.ok") }));
export const needText = (k: number, unit = m("honest.unit.day")) => m("honest.need", { k, unit });
export const OBS_NOTE = m.in("th", "honest.obsNote"); // legacy Thai constant (tests); the UI reads obsNote()
export const obsNote = () => m("honest.obsNote");
export const patternConf = (c: "medium" | "high") => (c === "high" ? CONF_TEXT.ok : CONF_TEXT.early);
export const round5 = (pct: number) => Math.round(pct / 5) * 5;
export const half = (h: number) => (Math.round(h * 2) / 2).toFixed(1).replace(/\.0$/, "");

// kg/week with one decimal and a sign; under 0.05 reads as steady.
export function kgRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "-";
  if (Math.abs(rate) < 0.05) return m("honest.steady");
  return m("honest.kgRate", { sign: rate > 0 ? "+" : "-", n: Math.abs(rate).toFixed(1) });
}
// Minutes rounded to 15 (at least 15). pm = spread ("about ±45 min"); false = one-sided ("about 45 min").
export function aboutMin(min: number, pm = true): string {
  const r = Math.max(15, Math.round(Math.abs(min) / 15) * 15);
  return m("honest.aboutMin", { pm: pm ? "±" : "", r });
}
// A period-over-period delta is shown only when both periods have enough logged days.
export const deltaOk = (curN: number, prevN: number, n: number) => { const k = Math.min(NEED.days, Math.ceil(n / 2)); return curN >= k && prevN >= k; };
// A weekly weight rate needs NEED.weighIns weigh-ins spanning NEED.weighSpan days (shared by the stat tile and honestInsights).
type WeighW = { weighIns: number; spanDays: number; perWeek: number } | null;
export const rateOk = (w: WeighW) => !!w && w.weighIns >= NEED.weighIns && w.spanDays >= NEED.weighSpan;
// Weight stat-tile hint for an n-day range: the rate when rateOk, else what would unlock it.
export function weightHint(w: WeighW, n: number): string {
  if (!w) return m("honest.weight.none");
  const tail = m("honest.weight.tail", { n: w.weighIns });
  if (rateOk(w)) return `${kgRate(w.perWeek)} · ${tail}`;
  if (w.weighIns < NEED.weighIns) return m("honest.weight.more", { tail, k: NEED.weighIns - w.weighIns });
  return `${tail} · ${n <= NEED.weighSpan ? m("honest.weight.range30") : m("honest.weight.span", { n: NEED.weighSpan })}`;
}

const month = (d: Date) => fmt.monthLong(d);
const year = (d: Date) => fmt.year(d); // th keeps the legacy Buddhist-era year (spec section 4)
// Goal date as a month range: >= 8 weigh-ins in the last 28 days spanning >= 14 days and a gain over 0.05 kg/week.
// The range uses the trend rate +-25% so it never reads as an exact date.
export function etaRange(s: State, today: string): string | null {
  const from = addDays(today, -27);
  const t = trend(s.weights).filter((w) => w.date >= from && w.date <= today);
  if (t.length < NEED.etaWeighIns) return null;
  const a = t[0], b = t[t.length - 1];
  const span = (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000;
  if (span < NEED.etaSpan) return null;
  const rate = ((b.trend - a.trend) / span) * 7, toGo = s.profile.goalKg - b.trend;
  if (rate <= 0.05 || toGo <= 0) return null;
  const at = (weeks: number) => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + Math.round(weeks * 7)); return d; };
  const d1 = at(toGo / (rate * 1.25)), d2 = at(toGo / (rate * 0.75));
  if (year(d1) !== year(d2)) return m("honest.eta.years", { m1: month(d1), y1: year(d1), m2: month(d2), y2: year(d2) });
  if (month(d1) === month(d2)) return m("honest.eta.month", { m1: month(d1), y1: year(d1) });
  return m("honest.eta.months", { m1: month(d1), m2: month(d2), y2: year(d2) });
}

export type HonestLine = { text: string; conf: Conf; tip?: string };
const pct = (v: number) => round5(v * 100);

// Observations only (no causal words), each with a confidence tag; at most 6 lines, most useful first.
export function honestInsights(r: RangeStats, s: State): HonestLine[] {
  void s;
  if (r.loggedDays < NEED.early) return [{ text: needText(NEED.early - r.loggedDays), conf: "none" }];
  const out: HonestLine[] = [];
  const worst = r.items.find((i) => i.planned >= 5 && i.done / i.planned < 0.6);
  if (worst) out.push({ text: m("honest.line.worst", { title: worst.title, done: worst.done, planned: worst.planned }), conf: confOf(worst.planned, 5), tip: m("honest.tip.worst") });
  const late = r.items.filter((i) => i.avgDelay !== null && i.avgDelay > 45 && i.timed >= 5).sort((a, b) => (b.avgDelay ?? 0) - (a.avgDelay ?? 0))[0];
  if (late) out.push({ text: m("honest.line.late", { title: late.title, about: aboutMin(late.avgDelay!, false) }), conf: confOf(late.timed, 5), tip: m("honest.tip.late") });
  const wd = r.weekday.map((v, i) => ({ v, i, n: r.weekdayN[i] })).filter((x) => x.v !== null && x.n >= NEED.weekday) as { v: number; i: number; n: number }[];
  if (wd.length >= 4) {
    const lo = wd.reduce((a, b) => (b.v < a.v ? b : a)), hi = wd.reduce((a, b) => (b.v > a.v ? b : a));
    if (hi.v - lo.v > 0.15) out.push({ text: m("honest.line.weekday", { lo: fmt.dowLong(lo.i), loPct: pct(lo.v), hi: fmt.dowLong(hi.i), hiPct: pct(hi.v) }), conf: confOf(Math.min(lo.n, hi.n), NEED.weekday) });
  }
  if (r.waterMetDays / r.loggedDays < 0.5) out.push({ text: m("honest.line.water", { met: r.waterMetDays, days: r.loggedDays, l: (r.waterAvg / 1000).toFixed(1) }), conf: confOf(r.loggedDays, NEED.days) });
  if (r.n >= 14 && r.perWeek < 3) out.push({ text: m("honest.line.gym", { x: r.perWeek.toFixed(1) }), conf: confOf(r.loggedDays, NEED.days) });
  if (r.weight && rateOk(r.weight)) {
    const w = r.weight.perWeek, [lo, hi] = paceBand(r.weight.to);
    const [band, tip] = w < lo ? [m("honest.band.slow"), m("honest.tip.slow")] : w > hi * 1.5 ? [m("honest.band.fast"), m("honest.tip.fast")] : [m("honest.band.ok"), undefined];
    out.push({ text: m("honest.line.weight", { rate: kgRate(w), band }), conf: confOf(r.weight.weighIns, NEED.weighIns), ...(tip ? { tip } : {}) });
  }
  const e = r.energyEffect;
  if (e && r.energyN.hi >= NEED.pair && r.energyN.lo >= NEED.pair && e.hi - e.lo > 0.1)
    out.push({ text: m("honest.line.energy", { hi: pct(e.hi), lo: pct(e.lo) }), conf: confOf(Math.min(r.energyN.hi, r.energyN.lo), NEED.pair) });
  if (r.sleep.avg !== null && r.sleep.nights >= NEED.nights && r.sleep.avg < 7)
    out.push({ text: m("honest.line.sleep", { h: half(r.sleep.avg), n: r.sleep.nights }), conf: confOf(r.sleep.nights, NEED.nights), tip: m("honest.tip.sleep") });
  if (r.sleep.bedSd !== null && r.sleep.bedN >= NEED.bedN && r.sleep.bedSd > 60)
    out.push({ text: m("honest.line.bed", { about: aboutMin(r.sleep.bedSd) }), conf: confOf(r.sleep.bedN, NEED.bedN), tip: m("honest.tip.bed") });
  const { scoreLong: sl, scoreShort: ss, longN, shortN } = r.sleep;
  if (sl !== null && ss !== null && longN >= NEED.pair && shortN >= NEED.pair && sl - ss > 0.1)
    out.push({ text: m("honest.line.sleep7", { long: pct(sl), short: pct(ss) }), conf: confOf(Math.min(longN, shortN), NEED.pair) });
  const t = r.trade, a = r.acts;
  if (t.planned >= 5 && t.days / t.planned < 0.5) out.push({ text: m("honest.line.trade", { done: t.days, planned: t.planned }), conf: confOf(t.planned, 5), tip: m("honest.tip.trade") });
  if (a.singPlanned >= 5 && a.sing / a.singPlanned < 0.5) out.push({ text: m("honest.line.sing", { done: a.sing, planned: a.singPlanned }), conf: confOf(a.singPlanned, 5), tip: m("honest.tip.sing") });
  if (a.streamPlanned >= 5 && a.stream / a.streamPlanned < 0.7) out.push({ text: m("honest.line.stream", { done: a.stream, planned: a.streamPlanned }), conf: confOf(a.streamPlanned, 5), tip: m("honest.tip.stream") });
  return out.length ? out.slice(0, 6) : [{ text: m("honest.line.none"), conf: confOf(r.loggedDays, NEED.days) }];
}

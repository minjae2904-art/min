// v1.8 honest insights (pure): minimum samples, confidence wording, rounded numbers and observation-only phrasing.
// The tested stats.ts insights() and brain/patterns.ts stay unchanged; the UI reads this layer instead.
import { addDays } from "./date";
import { trend } from "./health";
import type { State } from "./model";
import { paceBand, type RangeStats } from "./stats";

export const NEED = { early: 5, days: 7, pair: 5, weekday: 2, timed: 10, nights: 5, bedN: 7, weighIns: 5, weighSpan: 10, etaWeighIns: 8, etaSpan: 14 } as const;
export type Conf = "none" | "early" | "ok";
export const confOf = (n: number, need: number): Conf => (n < need ? "none" : n < need * 2 ? "early" : "ok");
export const CONF_TEXT: Record<Conf, string> = { none: "ยังไม่พอสรุป", early: "เริ่มเห็นแนวโน้ม", ok: "เห็นแนวโน้มชัดขึ้น" };
export const needText = (k: number, unit = "วัน") => `ยังไม่พอสรุป · บันทึกอีก ${k} ${unit} แล้วจะเริ่มเห็นแนวโน้ม`;
export const OBS_NOTE = "เป็นสิ่งที่สังเกตจากข้อมูลของคุณ ไม่ได้บอกว่าอะไรเป็นสาเหตุ";
export const patternConf = (c: "medium" | "high") => (c === "high" ? CONF_TEXT.ok : CONF_TEXT.early);
export const round5 = (pct: number) => Math.round(pct / 5) * 5;
export const half = (h: number) => (Math.round(h * 2) / 2).toFixed(1).replace(/\.0$/, "");

// kg/week with one decimal and a sign; under 0.05 reads as steady.
export function kgRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "-";
  if (Math.abs(rate) < 0.05) return "ทรงตัว";
  return `${rate > 0 ? "+" : "-"}${Math.abs(rate).toFixed(1)} kg/สัปดาห์`;
}
// Minutes rounded to 15 (at least 15). pm = spread ("ราว ±45 นาที"); false = one-sided ("ราว 45 นาที").
export function aboutMin(m: number, pm = true): string {
  const r = Math.max(15, Math.round(Math.abs(m) / 15) * 15);
  return `ราว ${pm ? "±" : ""}${r} นาที`;
}
// A period-over-period delta is shown only when both periods have enough logged days.
export const deltaOk = (curN: number, prevN: number, n: number) => { const k = Math.min(NEED.days, Math.ceil(n / 2)); return curN >= k && prevN >= k; };
// A weekly weight rate needs NEED.weighIns weigh-ins spanning NEED.weighSpan days (shared by the stat tile and honestInsights).
type WeighW = { weighIns: number; spanDays: number; perWeek: number } | null;
export const rateOk = (w: WeighW) => !!w && w.weighIns >= NEED.weighIns && w.spanDays >= NEED.weighSpan;
// Weight stat-tile hint for an n-day range: the rate when rateOk, else what would unlock it.
export function weightHint(w: WeighW, n: number): string {
  if (!w) return "ยังไม่มีข้อมูลชั่ง";
  const tail = `ชั่ง ${w.weighIns} ครั้ง`;
  if (rateOk(w)) return `${kgRate(w.perWeek)} · ${tail}`;
  if (w.weighIns < NEED.weighIns) return `${tail} · ชั่งอีก ${NEED.weighIns - w.weighIns} ครั้งเพื่อดูอัตรา`;
  return `${tail} · ${n <= NEED.weighSpan ? "ดูอัตราในช่วง 30 วัน" : `ต้องชั่งห่างกันอย่างน้อย ${NEED.weighSpan} วันเพื่อดูอัตรา`}`;
}

const month = (d: Date) => d.toLocaleDateString("th-TH", { month: "long" });
const year = (d: Date) => d.toLocaleDateString("th-TH", { year: "numeric" });
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
  if (year(d1) !== year(d2)) return `ราว ${month(d1)} ${year(d1)} - ${month(d2)} ${year(d2)}`;
  if (month(d1) === month(d2)) return `ราว ${month(d1)} ${year(d1)}`;
  return `ราว ${month(d1)} - ${month(d2)} ${year(d2)}`;
}

export type HonestLine = { text: string; conf: Conf; tip?: string };
const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const pct = (v: number) => round5(v * 100);

// Observations only (no causal words), each with a confidence tag; at most 6 lines, most useful first.
export function honestInsights(r: RangeStats, s: State): HonestLine[] {
  void s;
  if (r.loggedDays < NEED.early) return [{ text: needText(NEED.early - r.loggedDays), conf: "none" }];
  const out: HonestLine[] = [];
  const worst = r.items.find((i) => i.planned >= 5 && i.done / i.planned < 0.6);
  if (worst) out.push({ text: `"${worst.title}" ทำได้ ${worst.done}/${worst.planned} วันที่มีในแผน`, conf: confOf(worst.planned, 5), tip: "ลองย้ายเวลา หรือผูกกับสิ่งที่ทำอยู่แล้ว" });
  const late = r.items.filter((i) => i.avgDelay !== null && i.avgDelay > 45 && i.timed >= 5).sort((a, b) => (b.avgDelay ?? 0) - (a.avgDelay ?? 0))[0];
  if (late) out.push({ text: `"${late.title}" มักทำช้ากว่ากำหนด${aboutMin(late.avgDelay!, false)}`, conf: confOf(late.timed, 5), tip: "ปรับเวลาได้ที่ ตั้งค่า > แผนประจำวัน" });
  const wd = r.weekday.map((v, i) => ({ v, i, n: r.weekdayN[i] })).filter((x) => x.v !== null && x.n >= NEED.weekday) as { v: number; i: number; n: number }[];
  if (wd.length >= 4) {
    const lo = wd.reduce((a, b) => (b.v < a.v ? b : a)), hi = wd.reduce((a, b) => (b.v > a.v ? b : a));
    if (hi.v - lo.v > 0.15) out.push({ text: `วัน${DOW[lo.i]}มักทำได้น้อยกว่าวันอื่น (ราว ${pct(lo.v)}%) วัน${DOW[hi.i]}ทำได้ดีสุด (ราว ${pct(hi.v)}%)`, conf: confOf(Math.min(lo.n, hi.n), NEED.weekday) });
  }
  if (r.waterMetDays / r.loggedDays < 0.5) out.push({ text: `ดื่มน้ำถึงเป้า ${r.waterMetDays}/${r.loggedDays} วัน เฉลี่ยราว ${(r.waterAvg / 1000).toFixed(1)} ลิตร`, conf: confOf(r.loggedDays, NEED.days) });
  if (r.n >= 14 && r.perWeek < 3) out.push({ text: `เข้ายิมเฉลี่ยราว ${r.perWeek.toFixed(1)} ครั้ง/สัปดาห์ (รอบปกติ 4 ครั้ง)`, conf: confOf(r.loggedDays, NEED.days) });
  if (r.weight && rateOk(r.weight)) {
    const w = r.weight.perWeek, [lo, hi] = paceBand(r.weight.to);
    const [band, tip] = w < lo ? ["ช้ากว่าช่วงเป้า", "ลองเพิ่ม shake ~400 kcal/วัน"] : w > hi * 1.5 ? ["เร็วกว่าช่วงเป้า", "ลดของทอด/ของหวาน"] : ["อยู่ในช่วงเป้า", undefined];
    out.push({ text: `น้ำหนักแนวโน้ม ${kgRate(w)} · ${band}`, conf: confOf(r.weight.weighIns, NEED.weighIns), ...(tip ? { tip } : {}) });
  }
  const e = r.energyEffect;
  if (e && r.energyN.hi >= NEED.pair && r.energyN.lo >= NEED.pair && e.hi - e.lo > 0.1)
    out.push({ text: `วันที่พลังงานดี (4-5) มักทำได้ครบกว่าวันพลังงานต่ำ (ราว ${pct(e.hi)}% กับ ${pct(e.lo)}%)`, conf: confOf(Math.min(r.energyN.hi, r.energyN.lo), NEED.pair) });
  if (r.sleep.avg !== null && r.sleep.nights >= NEED.nights && r.sleep.avg < 7)
    out.push({ text: `นอนเฉลี่ยราว ${half(r.sleep.avg)} ชม./คืน (${r.sleep.nights} คืน)`, conf: confOf(r.sleep.nights, NEED.nights), tip: "ลองเข้านอนให้ตรงเวลาขึ้น" });
  if (r.sleep.bedSd !== null && r.sleep.bedN >= NEED.bedN && r.sleep.bedSd > 60)
    out.push({ text: `เวลาเข้านอนแกว่ง${aboutMin(r.sleep.bedSd)}`, conf: confOf(r.sleep.bedN, NEED.bedN), tip: "ลองเข้านอนเวลาเดิมแม้วันหยุด" });
  const { scoreLong: sl, scoreShort: ss, longN, shortN } = r.sleep;
  if (sl !== null && ss !== null && longN >= NEED.pair && shortN >= NEED.pair && sl - ss > 0.1)
    out.push({ text: `หลังคืนที่นอนครบ 7 ชม. มักทำได้ครบกว่า (ราว ${pct(sl)}% กับ ${pct(ss)}%)`, conf: confOf(Math.min(longN, shortN), NEED.pair) });
  const t = r.trade, a = r.acts;
  if (t.planned >= 5 && t.days / t.planned < 0.5) out.push({ text: `เช็กแผนเทรด ${t.days}/${t.planned} วันที่มีในแผน`, conf: confOf(t.planned, 5), tip: "ลองผูกไว้กับรายการก่อนหน้าในแผน" });
  if (a.singPlanned >= 5 && a.sing / a.singPlanned < 0.5) out.push({ text: `ร้องเพลงได้ ${a.sing}/${a.singPlanned} วันที่มีในแผน`, conf: confOf(a.singPlanned, 5), tip: "เริ่ม 15 นาทีก็พอ" });
  if (a.streamPlanned >= 5 && a.stream / a.streamPlanned < 0.7) out.push({ text: `ไลฟ์ได้ ${a.stream}/${a.streamPlanned} วันที่มีในแผน`, conf: confOf(a.streamPlanned, 5), tip: "ไลฟ์เวลาเดิมทุกวันสำคัญกว่าไลฟ์ยาว" });
  return out.length ? out.slice(0, 6) : [{ text: "ยังไม่เห็นจุดที่ต้องปรับจากข้อมูลช่วงนี้", conf: confOf(r.loggedDays, NEED.days) }];
}

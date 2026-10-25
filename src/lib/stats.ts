// Single source of truth for derived numbers (Today, Stats, Body, reminders, and later the AI coach).
// Same idea as min1lot-web lib/progress.js: compute once here, feed only summaries to AI.
import { ROLLOVER_HOUR, addDays } from "./date";
import { trend, waterTargetMl } from "./health";
import { dayFor, hasCheckin, type DayLog, type ScheduleCfg, type State } from "./model";
import { blockEnd, buildDay, itemsFor, resolveTemplate, type Item } from "./schedule";

// Scored items of a day. The date only moves NY-session minutes, so callers that omit it get the same score.
export const dayItems = (s: State, d: DayLog, date?: string) => itemsFor(s.schedule, d, date).filter((i) => i.ring);

// Hours slept before this logical day: last night's "เข้านอน" -> today's "ตื่นแล้ว".
export function sleepHours(s: State, date: string): number | null {
  const wake = s.days[date]?.wakeAt, slept = s.days[addDays(date, -1)]?.sleepAt;
  if (!wake || !slept || wake <= slept) return null;
  const h = (wake - slept) / 3_600_000;
  return h > 0.5 && h < 20 ? h : null;
}

export function dayScore(s: State, d: DayLog | undefined): number {
  if (!d) return 0;
  const items = dayItems(s, d);
  return items.length ? items.filter((i) => d.done[i.id]).length / items.length : 0;
}

// Consecutive good days ending yesterday (+ today if already good).
// One missed day is forgiven ("never miss twice"): research shows a single miss does not break habit formation.
export function streak(s: State, today: string): { days: number; forgiven: boolean } {
  const good = (date: string) => dayScore(s, s.days[date]) >= s.settings.goodDay;
  let days = good(today) ? 1 : 0;
  let forgiven = false;
  for (let i = 1; i < 400; i++) {
    if (good(addDays(today, -i))) days++;
    else if (!forgiven && good(addDays(today, -i - 1))) forgiven = true;
    else break;
  }
  return { days, forgiven };
}

export function week(s: State, today: string) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const scores = dates.map((d) => ({ date: d, score: dayScore(s, s.days[d]) }));
  return { scores, goodDays: scores.filter((x) => x.score >= s.settings.goodDay).length, avg: scores.reduce((a, x) => a + x.score, 0) / 7 };
}

// rate = kg per week from the newest weigh-in back to the last one at least 7 days older than it (null when
// that reference is more than 14 days back, or the newest weigh-in is over 7 days old, so a stale reading is
// not reported as a weekly rate). Anchored on the newest weigh-in, so today's not-yet-done one does not null it.
export function weightStats(s: State, today: string) {
  const t = trend(s.weights);
  const last = t.at(-1);
  const cur = last?.trend ?? s.profile.startKg;
  const ref = last && [...t].reverse().find((w) => w.date <= addDays(last.date, -7));
  const span = last && ref ? (Date.parse(last.date) - Date.parse(ref.date)) / 86_400_000 : 0;
  const rate = last && ref && span <= 14 && last.date >= addDays(today, -7) ? ((cur - ref.trend) / span) * 7 : null;
  return { series: t, cur, rate, measured: t.length > 0 };
}

// Hours short of `need` per night over the last `nights` logical days that have both bedtime and wake-up.
export function sleepDebt(s: State, today: string, nights = 7, need = 8): { hours: number; nights: number } {
  let hours = 0, n = 0;
  for (let i = 0; i < nights; i++) {
    const h = sleepHours(s, addDays(today, -i));
    if (h !== null) { n++; hours += Math.max(0, need - h); }
  }
  return { hours, nights: n };
}

export function waterGoal(s: State, d: DayLog, kg: number): number {
  if (s.settings.waterGoalMl) return s.settings.waterGoalMl;
  // Lifting day = more water. Legacy days keep the v1.0 rule (work day), templates go by content.
  const { def } = resolveTemplate(s.schedule, d.type);
  const lift = def.legacy ? def.work : buildDay(d.type, d.meal2, s.schedule, 0).some((i) => i.id === "gym");
  return lift ? waterTargetMl(kg, 1.25, 0) : waterTargetMl(kg, 0, d.done.cardio ? 1.5 : 0);
}

// Minutes between the scheduled time and when it was ticked.
// Fixed +07:00 (Bangkok has no DST) so the server (UTC) computes the same delays as the phone.
const scheduledAt = (date: string, item: Item) => new Date(date + "T00:00:00+07:00").getTime() + item.min * 60_000;

export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const sd = (a: number[]) => { const m = avg(a); return m === null || a.length < 2 ? null : Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
// Logical minutes of an epoch in Bangkok wall-clock time (fixed +07:00, same reason as scheduledAt).
export const bkkMin = (ts: number) => { const m = Math.floor(((ts + 7 * 3600_000) % 86_400_000) / 60_000); return m < ROLLOVER_HOUR * 60 ? m + 1440 : m; };

// Healthy lean-gain band in kg/week: 0.25-0.5% of body weight (shared by insights and the brain engine).
export const paceBand = (kg: number): [number, number] => [0.0025 * kg, 0.005 * kg];

export type ItemStat = { id: string; title: string; planned: number; done: number; onTime: number; avgDelay: number | null };

export function rangeStats(s: State, today: string, n: number) {
  const dates = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  const t = trend(s.weights);
  const kgAt = (date: string) => [...t].reverse().find((w) => w.date <= date)?.trend ?? s.profile.startKg;
  const items = new Map<string, ItemStat & { delaySum: number; delayN: number }>();
  const weekday = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  const meal2 = { A: 0, B: 0, C: 0 };
  let onTime = 0, doneTotal = 0;
  const feel = { mood: [] as number[], energy: [] as number[], sleep: [] as number[] };
  const slept: number[] = [];
  const bedMins: number[] = [], wakeMins: number[] = [];
  const bySleep = { long: [] as number[], short: [] as number[] };
  const byEnergy = { hi: [] as number[], lo: [] as number[] };
  let journals = 0;
  const trade = { days: 0, count: 0, win: 0, loss: 0, be: 0, skip: 0, planned: 0 };
  const acts = { sing: 0, singPlanned: 0, mc: 0, mcPlanned: 0, stream: 0, streamPlanned: 0 };

  const series = dates.map((date) => {
    const logged = !!s.days[date];
    const d = dayFor(s, date);
    const list = dayItems(s, d, date);
    const score = logged ? dayScore(s, d) : 0;
    const goal = waterGoal(s, d, kgAt(date));
    if (logged) {
      const wd = new Date(date + "T12:00:00").getDay();
      weekday[wd].sum += score;
      weekday[wd].n++;
      if (d.meal2) meal2[d.meal2]++;
      if (hasCheckin(d)) {
        feel.mood.push(d.checkin.mood);
        feel.energy.push(d.checkin.energy);
        feel.sleep.push(d.checkin.sleep);
        if (d.checkin.energy >= 4) byEnergy.hi.push(score);
        if (d.checkin.energy <= 2) byEnergy.lo.push(score);
      }
      if (d.journal && (d.journal.good || d.journal.fix || d.journal.thanks)) journals++;
      const sh = sleepHours(s, date);
      if (sh !== null) { slept.push(sh); bySleep[sh >= 7 ? "long" : "short"].push(score); }
      if (d.sleepAt) bedMins.push(bkkMin(d.sleepAt));
      if (d.wakeAt) wakeMins.push(bkkMin(d.wakeAt));
      if (list.some((i) => i.kind === "trade")) trade.planned++;
      for (const k of ["sing", "mc", "stream"] as const) {
        const of = list.filter((i) => (k === "stream" ? i.id === "stream" : i.kind === k));
        if (!of.length) continue;
        acts[`${k}Planned`]++;
        if (of.some((i) => d.done[i.id])) acts[k]++;
      }
      if (d.trade) {
        trade.days++;
        trade.count += d.trade.count;
        if (d.trade.result === "win" || d.trade.result === "loss" || d.trade.result === "be" || d.trade.result === "skip") trade[d.trade.result]++;
      }
      for (const i of list) {
        const st = items.get(i.id) ?? { id: i.id, title: i.title, planned: 0, done: 0, onTime: 0, avgDelay: null, delaySum: 0, delayN: 0 };
        st.planned++;
        const ts = d.done[i.id];
        if (ts) {
          st.done++;
          doneTotal++;
          // Timestamps of 1 are seeds/imports without a real time; skip them for delay.
          if (ts > 1e12) {
            const delay = Math.round((ts - scheduledAt(date, i)) / 60_000);
            st.delaySum += delay;
            st.delayN++;
            if (delay <= 30) { st.onTime++; onTime++; }
          }
        }
        items.set(i.id, st);
      }
    }
    return { date, logged, score, water: d.waterMl, goal, type: d.type, plan: resolveTemplate(s.schedule, d.type).def.name };
  });

  const loggedDays = series.filter((x) => x.logged);
  const inRange = (date: string) => date >= dates[0] && date <= today;
  const gym = s.workouts.filter((w) => inRange(w.date));
  const sessions = gym.filter((w) => w.code.startsWith("D"));
  const rotation: Record<string, number> = { D1: 0, D2: 0, D3: 0, D4: 0 };
  for (const w of sessions) rotation[w.code] = (rotation[w.code] ?? 0) + 1;
  const persona: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  for (const p of s.personality.filter((x) => inRange(x.date))) persona[p.code] = (persona[p.code] ?? 0) + 1;
  const tennis = gym.filter((w) => w.code === "R-tennis").length;

  const wIn = t.filter((w) => inRange(w.date));
  const wFirst = wIn[0], wLast = wIn.at(-1);
  const spanDays = wFirst && wLast ? Math.max(1, (new Date(wLast.date).getTime() - new Date(wFirst.date).getTime()) / 86_400_000) : 0;

  const itemList: ItemStat[] = [...items.values()].map(({ delaySum, delayN, ...x }) => ({ ...x, avgDelay: delayN ? Math.round(delaySum / delayN) : null }));
  const timed = itemList.reduce((a, x) => a + (x.avgDelay === null ? 0 : 1), 0);

  return {
    n,
    dates,
    series,
    loggedDays: loggedDays.length,
    avgScore: loggedDays.length ? loggedDays.reduce((a, x) => a + x.score, 0) / loggedDays.length : 0,
    goodDays: loggedDays.filter((x) => x.score >= s.settings.goodDay).length,
    waterAvg: loggedDays.length ? loggedDays.reduce((a, x) => a + x.water, 0) / loggedDays.length : 0,
    waterMetDays: loggedDays.filter((x) => x.water >= x.goal).length,
    sessions: sessions.length,
    perWeek: sessions.length / (n / 7),
    rotation,
    persona,
    tennis,
    weight: wFirst && wLast ? { from: wFirst.trend, to: wLast.trend, change: wLast.trend - wFirst.trend, perWeek: ((wLast.trend - wFirst.trend) / spanDays) * 7, weighIns: wIn.length } : null,
    onTimeRate: doneTotal && timed ? onTime / doneTotal : null,
    weekday: weekday.map((w) => (w.n ? w.sum / w.n : null)),
    meal2,
    items: itemList.sort((a, b) => a.done / a.planned - b.done / b.planned),
    feel: { mood: avg(feel.mood), energy: avg(feel.energy), sleep: avg(feel.sleep), n: feel.mood.length },
    energyEffect: byEnergy.hi.length >= 2 && byEnergy.lo.length >= 2 ? { hi: avg(byEnergy.hi)!, lo: avg(byEnergy.lo)! } : null,
    journals,
    sleepAvg: avg(slept),
    sleepNights: slept.length,
    sleep: {
      avg: avg(slept),
      nights: slept.length,
      bedSd: sd(bedMins),
      wakeSd: sd(wakeMins),
      scoreLong: bySleep.long.length >= 2 ? avg(bySleep.long) : null,
      scoreShort: bySleep.short.length >= 2 ? avg(bySleep.short) : null,
    },
    trade: { ...trade, winRate: trade.win + trade.loss ? trade.win / (trade.win + trade.loss) : null },
    acts,
  };
}

export type RangeStats = ReturnType<typeof rangeStats>;

const DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// Plain-language observations, most useful first.
export function insights(r: RangeStats, s: State): string[] {
  const out: string[] = [];
  if (r.loggedDays < 3) return ["บันทึกอย่างน้อย 3 วันเพื่อดูการวิเคราะห์"];
  const worst = r.items.find((i) => i.planned >= 3 && i.done / i.planned < 0.6);
  if (worst) out.push(`"${worst.title}" ทำได้ ${worst.done}/${worst.planned} วัน พลาดบ่อยที่สุด ลองย้ายเวลาหรือผูกกับสิ่งที่ทำอยู่แล้ว`);
  const late = [...r.items].filter((i) => i.avgDelay !== null && i.avgDelay > 45).sort((a, b) => (b.avgDelay ?? 0) - (a.avgDelay ?? 0))[0];
  if (late) out.push(`"${late.title}" ทำช้ากว่ากำหนดเฉลี่ย ${late.avgDelay} นาที ลองปรับเวลาที่ ตั้งค่า > แผนประจำวัน`);
  const wd = r.weekday.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as { v: number; i: number }[];
  if (wd.length >= 4) {
    const lo = wd.reduce((a, b) => (b.v < a.v ? b : a)), hi = wd.reduce((a, b) => (b.v > a.v ? b : a));
    if (hi.v - lo.v > 0.15) out.push(`วัน${DOW[lo.i]}ทำได้น้อยสุด (${Math.round(lo.v * 100)}%) ส่วนวัน${DOW[hi.i]}ดีที่สุด (${Math.round(hi.v * 100)}%)`);
  }
  if (r.waterMetDays / r.loggedDays < 0.5) out.push(`ดื่มน้ำถึงเป้าแค่ ${r.waterMetDays}/${r.loggedDays} วัน เฉลี่ย ${(r.waterAvg / 1000).toFixed(1)} ลิตร`);
  if (r.perWeek < 3 && r.n >= 7) out.push(`เข้ายิมเฉลี่ย ${r.perWeek.toFixed(1)} ครั้ง/สัปดาห์ ต่ำกว่ารอบปกติ (4 ครั้ง)`);
  const legs = r.rotation.D1, others = Math.max(r.rotation.D2, r.rotation.D3, r.rotation.D4);
  if (others >= 2 && legs < others / 2) out.push(`เล่นขา ${legs} ครั้ง น้อยกว่าส่วนอื่นมาก (${others} ครั้ง)`);
  if (r.weight) {
    const w = r.weight.perWeek;
    const lbl = `${w < 0 ? "น้ำหนักลด" : "น้ำหนักขึ้น"} ${Math.abs(w).toFixed(2)} kg/สัปดาห์`;
    if (r.weight.weighIns >= 5) {
      const [lo, hi] = paceBand(r.weight.to);
      if (w < lo) out.push(`${lbl} ช้ากว่าเป้า ลองเพิ่ม shake ~400 kcal/วัน`);
      else if (w > hi * 1.5) out.push(`${lbl} เร็วกว่าเป้า ลดของทอด/ของหวาน`);
      else out.push(`${lbl} อยู่ในช่วงเป้า (${lo.toFixed(2)}-${hi.toFixed(2)})`);
    }
  }
  if (r.meal2.B + r.meal2.C > r.meal2.A && r.meal2.A + r.meal2.B + r.meal2.C >= 4) out.push(`มื้อ 2 ส่วนใหญ่ไม่ได้กินข้าวตอนพัก (whey ${r.meal2.B} / กินก่อนยิม ${r.meal2.C} ครั้ง)`);
  if (r.energyEffect && r.energyEffect.hi - r.energyEffect.lo > 0.1) out.push(`วันที่พลังงานดี (4-5) ทำได้ ${Math.round(r.energyEffect.hi * 100)}% เทียบกับวันพลังงานต่ำ ${Math.round(r.energyEffect.lo * 100)}% การนอนให้พอจึงสำคัญมาก`);
  if (r.sleepAvg !== null && r.sleepNights >= 3 && r.sleepAvg < 7) out.push(`นอนเฉลี่ย ${r.sleepAvg.toFixed(1)} ชม./คืน น้อยกว่า 7 ชม. กล้ามเนื้อฟื้นตัวได้ไม่เต็มที่`);
  if (r.sleep.bedSd !== null && r.sleep.bedSd > 60) out.push(`เวลานอนแกว่ง ±${Math.round(r.sleep.bedSd)} นาที ลองนอนเวลาเดิมแม้วันหยุด`);
  if (r.sleep.scoreLong !== null && r.sleep.scoreShort !== null && r.sleep.scoreLong - r.sleep.scoreShort > 0.1) out.push(`คืนที่นอนครบ 7 ชม. วันถัดมาทำได้ ${Math.round(r.sleep.scoreLong * 100)}% เทียบกับคืนที่นอนน้อย ${Math.round(r.sleep.scoreShort * 100)}%`);
  if (r.feel.sleep !== null && r.feel.n >= 3 && r.feel.sleep < 3) out.push(`คะแนนการนอนเฉลี่ย ${r.feel.sleep.toFixed(1)}/5 ลองทำห้องให้มืดขึ้น หรือเลื่อนเวลานอนให้คงที่`);
  if (r.trade.planned >= 5 && r.trade.days / r.trade.planned < 0.5) out.push(`เช็กแผนเทรดแค่ ${r.trade.days}/${r.trade.planned} วันที่มีในแผน ลองผูกไว้กับรายการก่อนหน้าในแผน`);
  if (r.acts.singPlanned >= 4 && r.acts.sing / r.acts.singPlanned < 0.5) out.push(`ร้องเพลงได้ ${r.acts.sing}/${r.acts.singPlanned} วันที่มีในแผน ลองร้องหลังมื้อแรกราว 1 ชม. เริ่ม 15 นาทีก็พอ`);
  if (r.acts.streamPlanned >= 4 && r.acts.stream / r.acts.streamPlanned < 0.7) out.push(`ไลฟ์ได้ ${r.acts.stream}/${r.acts.streamPlanned} วันที่มีในแผน ช่วงสร้างการมองเห็น ไลฟ์เวลาเดิมทุกวันสำคัญกว่าไลฟ์ยาว`);
  if (r.trade.count >= 5 && r.trade.count / Math.max(1, r.trade.days) > 3) out.push(`เฉลี่ย ${(r.trade.count / r.trade.days).toFixed(1)} ไม้/วัน ระวังเทรดเกินแผน (overtrading)`);
  if (r.onTimeRate !== null && r.onTimeRate >= 0.8) out.push(`ทำตรงเวลา ${Math.round(r.onTimeRate * 100)}% ของรายการ`);
  if (r.avgScore >= s.settings.goodDay) out.push(`ความครบเฉลี่ย ${Math.round(r.avgScore * 100)}% ผ่านเป้าวันที่ดี`);
  return out.length ? out : ["ทุกอย่างสม่ำเสมอดี ไม่มีจุดที่ต้องปรับ"];
}

export function toCsv(r: RangeStats): string {
  const rows = [["date", "type", "plan", "logged", "completion_pct", "water_ml", "water_goal_ml"]];
  for (const x of r.series) rows.push([x.date, x.type, x.plan, x.logged ? "1" : "0", String(Math.round(x.score * 100)), String(x.water), String(x.goal)]);
  const q = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v); // plan names are free text
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

// Planned time per day/week (plan only, never mixed into dayScore). Minutes except the day counters.
export type Budget = { game: number; stream: number; sing: number; singDays: number; mc: number; gym: number; cardio: number; trade: number; work: number; days: number };

export function dayBudget(cfg: ScheduleCfg, d: Pick<DayLog, "type" | "meal2" | "shiftMin" | "voiceRest">, date?: string): Budget {
  const items = itemsFor(cfg, d, date);
  const has = (f: (i: Item) => boolean) => (items.some(f) ? 1 : 0);
  const sum = (kind: Item["kind"]) => items.filter((i) => i.kind === kind).reduce((a, i) => a + (i.dur ?? 0), 0);
  const at = (id: string) => items.find((i) => i.id === id)?.min ?? 0;
  return {
    game: items.filter((i) => i.kind === "game" && i.id !== "game-stop").reduce((a, i) => a + Math.max(0, (blockEnd(items, i) ?? i.min) - i.min), 0),
    stream: items.filter((i) => i.id === "stream").reduce((a, i) => a + Math.max(0, (blockEnd(items, i) ?? i.min) - i.min), 0),
    sing: sum("sing"),
    singDays: has((i) => i.kind === "sing"),
    mc: sum("mc"),
    gym: has((i) => i.id === "gym"),
    cardio: has((i) => i.id === "cardio"),
    trade: has((i) => i.kind === "trade"),
    work: resolveTemplate(cfg, d.type).def.work ? at("work-out") - at("work-in") : 0,
    days: 1,
  };
}

export const templateBudget = (cfg: ScheduleCfg, id: string, date?: string) => dayBudget(cfg, { type: id }, date);

export function timeBudget(s: State, from: string, days = 7): Budget {
  const total: Budget = { game: 0, stream: 0, sing: 0, singDays: 0, mc: 0, gym: 0, cardio: 0, trade: 0, work: 0, days: 0 };
  for (let k = 0; k < days; k++) {
    const date = addDays(from, k);
    const b = dayBudget(s.schedule, dayFor(s, date), date);
    for (const key of Object.keys(total) as (keyof Budget)[]) total[key] += b[key];
  }
  return total;
}

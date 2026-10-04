// Single source of truth for derived numbers (Today, Stats, Body, reminders, and later the AI coach).
// Same idea as min1lot-web lib/progress.js: compute once here, feed only summaries to AI.
import { addDays } from "./date";
import { trend, waterTargetMl } from "./health";
import { emptyDay, type DayLog, type State } from "./model";
import { buildDay, type Item } from "./schedule";

export const dayItems = (s: State, d: DayLog) => buildDay(d.type, d.meal2, s.schedule).filter((i) => i.ring);

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

export function weightStats(s: State, today: string) {
  const t = trend(s.weights);
  const cur = t.at(-1)?.trend ?? s.profile.startKg;
  const prev = [...t].reverse().find((w) => w.date <= addDays(today, -7))?.trend;
  const rate = prev !== undefined ? cur - prev : null;
  return { series: t, cur, rate };
}

export function waterGoal(s: State, d: DayLog, kg: number): number {
  if (s.settings.waterGoalMl) return s.settings.waterGoalMl;
  return d.type === "work" ? waterTargetMl(kg, 1.25, 0) : waterTargetMl(kg, 0, d.done.cardio ? 1.5 : 0);
}

// Minutes between the scheduled time and when it was ticked.
// Fixed +07:00 (Bangkok has no DST) so the server (UTC) computes the same delays as the phone.
const scheduledAt = (date: string, item: Item) => new Date(date + "T00:00:00+07:00").getTime() + item.min * 60_000;

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

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
  const byEnergy = { hi: [] as number[], lo: [] as number[] };
  let journals = 0;
  const trade = { days: 0, count: 0, win: 0, loss: 0, be: 0, skip: 0 };

  const series = dates.map((date) => {
    const logged = !!s.days[date];
    const d = s.days[date] ?? emptyDay();
    const list = dayItems(s, d);
    const score = logged ? dayScore(s, d) : 0;
    const goal = waterGoal(s, d, kgAt(date));
    if (logged) {
      const wd = new Date(date + "T12:00:00").getDay();
      weekday[wd].sum += score;
      weekday[wd].n++;
      if (d.meal2) meal2[d.meal2]++;
      if (d.checkin && d.checkin.mood > 0) {
        feel.mood.push(d.checkin.mood);
        feel.energy.push(d.checkin.energy);
        feel.sleep.push(d.checkin.sleep);
        if (d.checkin.energy >= 4) byEnergy.hi.push(score);
        if (d.checkin.energy <= 2) byEnergy.lo.push(score);
      }
      if (d.journal && (d.journal.good || d.journal.fix || d.journal.thanks)) journals++;
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
    return { date, logged, score, water: d.waterMl, goal, type: d.type };
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
    trade: { ...trade, winRate: trade.win + trade.loss ? trade.win / (trade.win + trade.loss) : null },
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
  if (late) out.push(`"${late.title}" ทำช้ากว่ากำหนดเฉลี่ย ${late.avgDelay} นาที ลองปรับเวลาที่ ตั้งค่า > ตารางประจำวัน`);
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
    if (r.weight.weighIns >= 5) {
      if (w < 0.2) out.push(`น้ำหนักขึ้น ${w.toFixed(2)} kg/สัปดาห์ ช้ากว่าเป้า ลองเพิ่ม shake ~400 kcal/วัน`);
      else if (w > 0.75) out.push(`น้ำหนักขึ้น ${w.toFixed(2)} kg/สัปดาห์ เร็วกว่าเป้า ลดของทอด/ของหวาน`);
      else out.push(`น้ำหนักขึ้น ${w.toFixed(2)} kg/สัปดาห์ อยู่ในช่วงเป้า (0.2-0.6)`);
    }
  }
  if (r.meal2.B + r.meal2.C > r.meal2.A && r.meal2.A + r.meal2.B + r.meal2.C >= 4) out.push(`มื้อ 2 ส่วนใหญ่ไม่ได้กินข้าวตอนพัก (whey ${r.meal2.B} / กินก่อนยิม ${r.meal2.C} ครั้ง)`);
  if (r.energyEffect && r.energyEffect.hi - r.energyEffect.lo > 0.1) out.push(`วันที่พลังงานดี (4-5) ทำได้ ${Math.round(r.energyEffect.hi * 100)}% เทียบกับวันพลังงานต่ำ ${Math.round(r.energyEffect.lo * 100)}% การนอนให้พอจึงสำคัญมาก`);
  if (r.feel.sleep !== null && r.feel.n >= 3 && r.feel.sleep < 3) out.push(`คะแนนการนอนเฉลี่ย ${r.feel.sleep.toFixed(1)}/5 ลองทำห้องให้มืดขึ้น หรือเลื่อนเวลานอนให้คงที่`);
  if (r.loggedDays >= 5 && r.trade.days / r.loggedDays < 0.5) out.push(`เช็กแผนเทรดแค่ ${r.trade.days}/${r.loggedDays} วัน ลองผูกไว้หลังฝึกบุคลิกภาพทุกวัน`);
  if (r.trade.count >= 5 && r.trade.count / Math.max(1, r.trade.days) > 3) out.push(`เฉลี่ย ${(r.trade.count / r.trade.days).toFixed(1)} ไม้/วัน ระวังเทรดเกินแผน (overtrading)`);
  if (r.onTimeRate !== null && r.onTimeRate >= 0.8) out.push(`ทำตรงเวลา ${Math.round(r.onTimeRate * 100)}% ของรายการ`);
  if (r.avgScore >= s.settings.goodDay) out.push(`ความครบเฉลี่ย ${Math.round(r.avgScore * 100)}% ผ่านเป้าวันที่ดี`);
  return out.length ? out : ["ทุกอย่างสม่ำเสมอดี ไม่มีจุดที่ต้องปรับ"];
}

export function toCsv(r: RangeStats): string {
  const rows = [["date", "type", "logged", "completion_pct", "water_ml", "water_goal_ml"]];
  for (const x of r.series) rows.push([x.date, x.type, x.logged ? "1" : "0", String(Math.round(x.score * 100)), String(x.water), String(x.goal)]);
  return rows.map((r) => r.join(",")).join("\n");
}

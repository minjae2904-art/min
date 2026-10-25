// Cross-area conflicts C1-C13 (pure). Work-day load, late meals before sleep and the designed meal2c -> gym gap
// are intentionally not conflicts (see spec 0.2).
import { addDays } from "../date";
import { dayFor, type State } from "../model";
import { blockEnd, itemsFor } from "../schedule";
import { sleepDebt } from "../stats";
import { T, mean, median } from "./math";
import { isRestTpl } from "./signals";
import type { AreaResult, Conflict, DaySig, PlanDay } from "./types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const uniq = <X,>(a: X[]) => [...new Set(a)];

export function detectConflicts(sigs: DaySig[], plan: PlanDay[], areas: AreaResult[], s: State, today: string): Conflict[] {
  const out: Conflict[] = [];
  const area = (k: AreaResult["key"]) => areas.find((a) => a.key === k);
  const from14 = addDays(today, -13);
  const W = sigs.filter((d) => d.date >= from14 && d.date <= today);
  const Wc = W.filter((d) => d.date < today);
  const A = sigs.filter((d) => d.date >= addDays(today, -6));
  const byDate = new Map(sigs.map((d) => [d.date, d]));
  const todaySig = byDate.get(today);

  // C1 game -> bedtime
  const gameDays = sigs.filter((d) => d.date < today && d.logged && d.game.planned && d.bedLate !== null).slice(-4);
  const late = gameDays.filter((d) => d.bedLate! > T.bedLate);
  const over = Wc.filter((d) => d.logged && d.game.planned && (d.game.over ?? 0) >= 60);
  if (late.length >= 2 || over.length >= 2) {
    const flagged = late.length >= 2 ? late : over;
    const nextH = flagged.map((d) => byDate.get(addDays(d.date, 1))?.sleepH).filter(fin);
    const avgSleepH = mean(nextH) ?? area("sleep")?.ev.avgH ?? null;
    const ev: Record<string, number> = { days: late.length >= 2 ? late.length : over.length, of: late.length >= 2 ? gameDays.length : Wc.filter((d) => d.logged && d.game.planned).length };
    if (late.length) ev.avgLate = Math.round(mean(late.map((d) => d.bedLate!))!);
    if (avgSleepH !== null) ev.avgSleepH = r1(avgSleepH);
    out.push({ id: "C1", sev: avgSleepH !== null && avgSleepH < 7 ? 3 : 2, areas: ["leisure", "sleep"], ev, tpls: uniq(flagged.map((d) => d.tpl)), dates: flagged.map((d) => d.date) });
  }

  // C2 sleep debt vs today's gym
  const debt = sleepDebt(s, today, 7);
  const sh = todaySig?.sleepH ?? null;
  if (todaySig && ((debt.hours > 5 && debt.nights >= 3) || (sh !== null && sh < 6)) && todaySig.gym.planned && !todaySig.gym.done) {
    const ev: Record<string, number> = { debtH: r1(debt.hours) };
    if (sh !== null) ev.sleepH = r1(sh);
    out.push({ id: "C2", sev: 2, areas: ["sleep", "training"], ev, dates: [today] });
  }

  // C3 singing streak / strain
  let run = 0;
  for (let i = W.length - 1; i >= 0; i--) {
    const d = W[i];
    if (d.date === today && !d.sing.done) continue; // today still in progress
    if (d.sing.done && !d.sing.voiceRest) run++; else break;
  }
  const strain = A.filter((d) => d.sing.strain === true).length;
  if (run >= 7 || strain >= 2) out.push({ id: "C3", sev: 2, areas: ["voice"], ev: { run, strain } });

  // C4 singing right after the gym block: planned on next-7 templates, or observed ticks
  const planTpls: string[] = [];
  for (const p of plan) {
    const items = itemsFor(s.schedule, dayFor(s, p.date), p.date);
    const g = items.find((i) => i.id === "gym");
    const end = g && blockEnd(items, g);
    if (end !== undefined && items.some((i) => i.kind === "sing" && i.min - end >= 0 && i.min - end <= 60)) planTpls.push(p.tpl);
  }
  const obs = W.filter((d) => d.gym.ts > 0 && d.sing.ts > 0 && d.sing.ts - d.gym.ts >= 0 && d.sing.ts - d.gym.ts <= 60 * 60_000);
  if (planTpls.length || obs.length >= 3) {
    out.push({ id: "C4", sev: 1, areas: ["voice", "training"], ev: { days: obs.length, plan: uniq(planTpls).length }, tpls: uniq([...planTpls, ...(obs.length >= 3 ? obs.map((d) => d.tpl) : [])]) });
  }

  // C5 a meal ticked 0-45 min before the gym tick (observed only; supp and the designed pre-gym meal2c / v1.4 snack2 excluded)
  const c5 = W.filter((d) => d.gym.ts > 1e12 && d.items.some((i) => i.kind === "meal" && !["meal2c", "snack2"].includes(i.id) && i.done > 1e12 && d.gym.ts - i.done >= 0 && d.gym.ts - i.done <= 45 * 60_000));
  if (c5.length >= 3) out.push({ id: "C5", sev: 1, areas: ["nutrition", "training"], ev: { days: c5.length }, tpls: uniq(c5.map((d) => d.tpl)), dates: c5.map((d) => d.date) });

  // C6 social jet lag: mid-sleep before work days vs free days
  const wk = sigs.filter((d) => d.midSleep !== null && d.work).map((d) => d.midSleep!);
  const fr = sigs.filter((d) => d.midSleep !== null && !d.work).map((d) => d.midSleep!);
  if (wk.length >= 3 && fr.length >= 3) {
    const sjl = Math.abs(median(wk)! - median(fr)!);
    if (sjl > 60) out.push({ id: "C6", sev: 2, areas: ["sleep", "consistency"], ev: { sjlMin: Math.round(sjl), nWork: wk.length, nFree: fr.length } });
  }

  // C7 revenge trade, C8 over the 1-trade rule
  const logs = W.filter((d) => d.trade.log);
  const rev = logs.filter((d) => d.trade.log!.result === "loss" && d.trade.log!.count > 1);
  const ovr = logs.filter((d) => d.trade.log!.count > 1 && !rev.includes(d));
  if (rev.length) out.push({ id: "C7", sev: 2, areas: ["trading"], ev: { days: rev.length }, dates: rev.map((d) => d.date) });
  if (ovr.length) out.push({ id: "C8", sev: 1, areas: ["trading"], ev: { days: ovr.length, one: logs.filter((d) => d.trade.log!.count <= 1).length, over: logs.length - logs.filter((d) => d.trade.log!.count <= 1).length }, dates: ovr.map((d) => d.date) });

  // C9 overload: heavy non-work days, or a short sleep window on any day
  const heavy = plan.filter((p) => !p.work && p.load > T.load);
  const minWin = Math.min(...plan.map((p) => p.sleepWinH));
  if (heavy.length >= 2 || plan.some((p) => p.sleepWinH < T.winH)) {
    out.push({ id: "C9", sev: 2, areas: ["recovery", "consistency"], ev: { days: heavy.length, minWinH: r1(minWin) }, dates: uniq([...heavy.map((p) => p.date), ...plan.filter((p) => p.sleepWinH < T.winH).map((p) => p.date)]) });
  }

  // C10 no recovery day in the next 7
  const singDays = plan.filter((p) => p.singPlanned).length, gymDays = plan.filter((p) => p.gym).length;
  if (!plan.some((p) => isRestTpl(p.base) || p.voiceRest) && (singDays >= 6 || gymDays >= 5)) {
    out.push({ id: "C10", sev: 2, areas: ["recovery", "voice"], ev: { sing: singDays, gym: gymDays } });
  }

  // C11 burnout flag (heuristic)
  const rec = area("recovery");
  if (rec?.ev.burnout === 1) out.push({ id: "C11", sev: 3, areas: ["recovery"], ev: { lowDays: rec.ev.lowDays ?? 0, debtH: r1(debt.hours) } });

  // C12 weight pace vs training/meals (info for R05/R06 copy)
  const nu = area("nutrition"), tr = area("training");
  const rate = nu?.ev.rate ?? null, lo = nu?.ev.lo ?? null, hi = nu?.ev.hi ?? null;
  const attend = tr?.parts.attend ?? null, meals = nu?.parts.meals ?? null;
  if (rate !== null && lo !== null && hi !== null && attend !== null
    && ((rate > hi && attend < 50) || (rate < lo && attend > 80 && meals !== null && meals >= 85))) {
    out.push({ id: "C12", sev: 2, areas: ["nutrition", "training"], ev: { rate, attend, meals: meals ?? 0 } });
  }

  // C13 the same ring item not done yesterday and the day before (both logged, both planned)
  const y = byDate.get(addDays(today, -1)), y2 = byDate.get(addDays(today, -2));
  if (y?.logged && y2?.logged) {
    const miss = y.items.filter((i) => !i.done && y2.items.some((j) => j.id === i.id && !j.done)).map((i) => i.id);
    if (miss.length) out.push({ id: "C13", sev: 1, areas: ["consistency"], ev: { items: miss.length }, items: miss, tpls: [y.tpl], dates: [y2.date, y.date] });
  }
  return out;
}

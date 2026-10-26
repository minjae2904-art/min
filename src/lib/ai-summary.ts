// Compact, numbers-only summary for the AI coach. Raw journal text and notes stay out
// (privacy + tokens) - same rule as min1lot-web: the model sees progress figures, not raw data.
// Item and template names are canonical (built-in labels); user titles and template names never go out.
import { balanceOf, scoreAreas } from "./brain/areas";
import { detectConflicts } from "./brain/conflicts";
import { AREA_LABEL, CONFLICT_LABEL, itemLabel, templateLabel } from "./brain/copy";
import { extractDays, planDays, plannedSleepOf, plannedWakeOf } from "./brain/signals";
import { addDays, hm } from "./date";
import { fmt, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-8";
import { age, targets } from "./health";
import { dayFor, type State } from "./model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { itemsFor, resolveTemplate } from "./schedule";
import { dayItems, insights, rangeStats, sleepDebt, streak, timeBudget, weightStats } from "./stats";
import { classesOn, termOn } from "./term";

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
const hrs = (min: number) => Math.round(min / 6) / 10;
const m = msgs(M);

export function aiSummary(s: State, today: string): string {
  const p = s.profile;
  const w = weightStats(s, today);
  const t = targets(p, w.cur, s.settings.kcalAdjust);
  const r7 = rangeStats(s, today, 7);
  const r30 = rangeStats(s, today, 30);
  const st = streak(s, today);
  const day = s.days[today];
  const lines: string[] = [];
  const cfg = s.schedule;
  const tl = (key: string) => templateLabel(cfg, key, { canonical: true });
  const il = (id: string) => itemLabel(cfg, "", id, { canonical: true });
  const todayList = itemsFor(cfg, dayFor(s, today), today);
  const wake = plannedWakeOf(todayList), sleep = plannedSleepOf(todayList);
  const job = m(s.settings.job === "yes" ? "aiSummary.job.yes" : s.settings.job === "no" ? "aiSummary.job.no" : "aiSummary.job.unknown");

  lines.push(m("aiSummary.profile", { sex: m(p.sex === "m" ? "aiSummary.sex.m" : "aiSummary.sex.f"), age: age(p.birth), height: p.heightCm, start: p.startKg, goal: p.goalKg }));
  lines.push(m("aiSummary.life", { wake: hm(wake), sleep: sleep === null ? "-" : hm(sleep), job, shift: s.schedule.shiftMin }));
  const plan = Array.from({ length: 7 }, (_, k) => addDays(today, k)).map((date) => ({ date, ...resolveTemplate(cfg, dayFor(s, date).type) }));
  lines.push(m("aiSummary.plan7", { plan: plan.map((p) => `${fmt.dowShort(new Date(p.date + "T12:00:00").getDay())}:${tl(p.key)}`).join(" "), work: plan.filter((p) => p.def.work).length }));
  const b = timeBudget(s, today);
  lines.push(m("aiSummary.budget", { game: hrs(b.game), singDays: b.singDays, sing: hrs(b.sing), mc: hrs(b.mc), gym: b.gym, cardio: b.cardio, trade: b.trade }));
  // v1.8 term day: class hours only (titles never go out).
  if (termOn(cfg.term, today)) {
    const clsMin = Array.from({ length: 7 }, (_, k) => classesOn(cfg.term, addDays(today, k))).flat().reduce((a, c) => a + c.e - c.s, 0);
    lines.push(m("aiSummary.term", { cls: hrs(clsMin), stream: hrs(b.stream) }));
  } else if (b.stream) lines.push(m("aiSummary.preTerm", { stream: hrs(b.stream) }));
  lines.push(m("aiSummary.nutrition", { kcal: t.kcal, protein: t.protein }));
  lines.push(m("aiSummary.weight", { cur: w.cur.toFixed(1), rate: w.rate === null ? "-" : `${w.rate >= 0 ? "+" : ""}${w.rate.toFixed(2)} kg` }));
  lines.push(m("aiSummary.streak", { days: st.days, pct: pct(s.settings.goodDay) }));
  const sigs = extractDays(s, today, 28);
  const areas = scoreAreas(sigs, s, today);
  const bal = balanceOf(areas, s.settings);
  if (bal.b !== null) {
    const top = detectConflicts(sigs, planDays(s, today, 7), areas, s, today).reduce<{ id: keyof typeof CONFLICT_LABEL; sev: number } | null>((a, c) => (!a || c.sev > a.sev ? c : a), null);
    const weak = bal.weakest ? m("aiSummary.weakArea", { area: AREA_LABEL[bal.weakest], score: String(areas.find((a) => a.key === bal.weakest)?.score) }) : "";
    lines.push(m("aiSummary.balance", { b: bal.b, weak, conflict: top ? CONFLICT_LABEL[top.id] : "-" }));
  }
  const debt = sleepDebt(s, today, 7);
  if (debt.nights) lines.push(m("aiSummary.sleepDebt", { h: debt.hours.toFixed(1), nights: debt.nights }));

  for (const [label, r] of [[m("aiSummary.range.7"), r7], [m("aiSummary.range.30"), r30]] as const) {
    lines.push(m("aiSummary.r.logged", { label, logged: r.loggedDays, n: r.n }));
    lines.push(m("aiSummary.r.score", { score: pct(r.avgScore), good: r.goodDays, onTime: pct(r.onTimeRate), water: (r.waterAvg / 1000).toFixed(1), waterMet: r.waterMetDays }));
    lines.push(m("aiSummary.r.gym", { sessions: r.sessions, perWeek: r.perWeek.toFixed(1), rotation: Object.entries(r.rotation).map(([k, v]) => `${k}:${v}`).join(" "), tennis: r.tennis }));
    lines.push(m("aiSummary.r.persona", { persona: Object.values(r.persona).reduce((a, b) => a + b, 0), journals: r.journals }));
    lines.push(m("aiSummary.r.acts", { sing: r.acts.sing, singPlanned: r.acts.singPlanned, mc: r.acts.mc, mcPlanned: r.acts.mcPlanned }));
    lines.push(m("aiSummary.r.trade", { days: r.trade.days, count: r.trade.count, win: r.trade.win, loss: r.trade.loss, be: r.trade.be, skip: r.trade.skip }));
    if (r.sleepAvg !== null) lines.push(m("aiSummary.r.sleep", { avg: r.sleepAvg.toFixed(1), nights: r.sleepNights }));
    if (r.sleep.bedSd !== null) lines.push(m("aiSummary.r.sleepSd", { bed: Math.round(r.sleep.bedSd), wake: r.sleep.wakeSd === null ? "-" : Math.round(r.sleep.wakeSd) }));
    if (r.feel.n) lines.push(m("aiSummary.r.feel", { sleep: String(r.feel.sleep?.toFixed(1)), energy: String(r.feel.energy?.toFixed(1)), mood: String(r.feel.mood?.toFixed(1)), n: r.feel.n }));
    if (r.weight) lines.push(m("aiSummary.r.weight", { from: r.weight.from.toFixed(1), to: r.weight.to.toFixed(1), perWeek: r.weight.perWeek.toFixed(2), weighIns: r.weight.weighIns }));
    const weak = r.items.filter((i) => i.planned >= 2).slice(0, 4).map((i) => `${il(i.id)} ${i.done}/${i.planned}${i.avgDelay !== null ? m("aiSummary.r.itemLate", { d: i.avgDelay }) : ""}`);
    if (weak.length) lines.push(m("aiSummary.r.weakItems", { list: weak.join("; ") }));
    const wd = Array.from({ length: 7 }, (_, i) => `${fmt.dowShort(i)}:${pct(r.weekday[i])}`).join(" ");
    lines.push(m("aiSummary.r.weekday", { wd }));
  }

  // insights() quotes item titles: hand it canonical labels.
  lines.push(m("aiSummary.insights", { list: insights({ ...r30, items: r30.items.map((i) => ({ ...i, title: il(i.id) })) }, s).join(" | ") }));
  if (day) {
    const items = dayItems(s, day, today);
    const { key, def } = resolveTemplate(cfg, day.type);
    const left = items.filter((i) => !day.done[i.id]).map((i) => `${hm(i.min)} ${il(i.id)}`).slice(0, 8);
    lines.push(m("aiSummary.today", { date: today, plan: tl(key), work: def.work ? m("aiSummary.todayWork") : "", done: items.length - left.length, total: items.length, left: left.join(", ") || "-" }));
    if (day.checkin?.mood) lines.push(m("aiSummary.checkin", { sleep: String(day.checkin.sleep), energy: String(day.checkin.energy), mood: String(day.checkin.mood) }));
  }
  const g = nextInCycle(GYM_CYCLE, s.workouts.filter((x) => x.date !== today));
  lines.push(m("aiSummary.nextGym", { code: g, label: GYM_LABEL[g], yday: m(s.days[addDays(today, -1)] ? "aiSummary.yday.logged" : "aiSummary.yday.none") }));
  return lines.join("\n");
}

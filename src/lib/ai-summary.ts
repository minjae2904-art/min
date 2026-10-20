// Compact, numbers-only summary for the AI coach. Raw journal text and notes stay out
// (privacy + tokens) - same rule as min1lot-web: the model sees progress figures, not raw data.
// Item and template names are canonical (built-in labels); user titles and template names never go out.
import { balanceOf, scoreAreas } from "./brain/areas";
import { detectConflicts } from "./brain/conflicts";
import { AREA_LABEL, CONFLICT_LABEL, itemLabel, templateLabel } from "./brain/copy";
import { extractDays, planDays, plannedSleepOf, plannedWakeOf } from "./brain/signals";
import { addDays, hm } from "./date";
import { age, targets } from "./health";
import { dayFor, type State } from "./model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { itemsFor, resolveTemplate } from "./schedule";
import { dayItems, insights, rangeStats, sleepDebt, streak, timeBudget, weightStats } from "./stats";

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
const hrs = (min: number) => Math.round(min / 6) / 10;
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

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
  const job = s.settings.job === "yes" ? "ยังทำงานกะดึก" : s.settings.job === "no" ? "ไม่ได้ทำงานกะแล้ว" : "ไม่ระบุเรื่องงานกะ";

  lines.push(`โปรไฟล์: ${p.sex === "m" ? "ชาย" : "หญิง"} ${age(p.birth)} ปี สูง ${p.heightCm} cm เป้าเพิ่มน้ำหนัก ${p.startKg} -> ${p.goalKg} kg`);
  lines.push(`ชีวิต: วันนี้แผนตื่น ${hm(wake)} นอน ${sleep === null ? "-" : hm(sleep)} · ${job} · เรียนร้องเพลง · เทรด (บันทึกวินัย) · ทำเซิร์ฟ Minecraft · เกมเป็นกิจกรรมหลักที่วางแผนไว้ · เข้ายิม · เพิ่มน้ำหนัก · ตารางเลื่อน ${s.schedule.shiftMin} นาที`);
  const plan = Array.from({ length: 7 }, (_, k) => addDays(today, k)).map((date) => ({ date, ...resolveTemplate(cfg, dayFor(s, date).type) }));
  lines.push(`แผน 7 วันข้างหน้า: ${plan.map((p) => `${DOW[new Date(p.date + "T12:00:00").getDay()]}:${tl(p.key)}`).join(" ")} (มีกะงาน ${plan.filter((p) => p.def.work).length} วัน)`);
  const b = timeBudget(s, today);
  lines.push(`งบเวลา 7 วันข้างหน้า (แผน): เกม ~${hrs(b.game)} ชม. · ร้องเพลง ${b.singDays} วัน ~${hrs(b.sing)} ชม. · เซิฟ ~${hrs(b.mc)} ชม. · ยก ${b.gym} ครั้ง · คาร์ดิโอ ${b.cardio} · เทรด ${b.trade} วัน`);
  lines.push(`เป้าโภชนาการ: ~${t.kcal} kcal/วัน โปรตีน ~${t.protein} g ไม่นับแคลละเอียด ใช้ติ๊กมื้อ`);
  lines.push(`น้ำหนักแนวโน้มตอนนี้ ${w.cur.toFixed(1)} kg, อัตราต่อสัปดาห์ (14 วันล่าสุด) ${w.rate === null ? "-" : `${w.rate >= 0 ? "+" : ""}${w.rate.toFixed(2)} kg`}`);
  lines.push(`ต่อเนื่อง ${st.days} วัน (เกณฑ์วันที่ดี ${pct(s.settings.goodDay)})`);
  const sigs = extractDays(s, today, 28);
  const areas = scoreAreas(sigs, s, today);
  const bal = balanceOf(areas, s.settings);
  if (bal.b !== null) {
    const top = detectConflicts(sigs, planDays(s, today, 7), areas, s, today).reduce<{ id: keyof typeof CONFLICT_LABEL; sev: number } | null>((a, c) => (!a || c.sev > a.sev ? c : a), null);
    const weak = bal.weakest ? ` · จุดที่ควรดูแล ${AREA_LABEL[bal.weakest]} (${areas.find((a) => a.key === bal.weakest)?.score})` : "";
    lines.push(`สมดุล ${bal.b}/100${weak} · ชนกัน: ${top ? CONFLICT_LABEL[top.id] : "-"}`);
  }
  const debt = sleepDebt(s, today, 7);
  if (debt.nights) lines.push(`หนี้นอน 7 วัน ${debt.hours.toFixed(1)} ชม. (${debt.nights} คืน)`);

  for (const [label, r] of [["7 วัน", r7], ["30 วัน", r30]] as const) {
    lines.push(`--- ${label}: บันทึก ${r.loggedDays}/${r.n} วัน`);
    lines.push(`ความครบเฉลี่ย ${pct(r.avgScore)} วันที่ดี ${r.goodDays} ตรงเวลา ${pct(r.onTimeRate)} น้ำเฉลี่ย ${(r.waterAvg / 1000).toFixed(1)} L ถึงเป้า ${r.waterMetDays} วัน`);
    lines.push(`ยิม ${r.sessions} ครั้ง (${r.perWeek.toFixed(1)}/สัปดาห์) แยก ${Object.entries(r.rotation).map(([k, v]) => `${k}:${v}`).join(" ")} เทนนิส ${r.tennis}`);
    lines.push(`ฝึกบุคลิก ${Object.values(r.persona).reduce((a, b) => a + b, 0)} ครั้ง, journal ${r.journals} วัน`);
    lines.push(`ร้องเพลง ${r.acts.sing}/${r.acts.singPlanned} วันที่มีในแผน · เซิฟ ${r.acts.mc}/${r.acts.mcPlanned} วัน`);
    lines.push(`เทรด: เช็กแผน ${r.trade.days} วัน ${r.trade.count} ไม้ ชนะ/แพ้/เสมอ ${r.trade.win}/${r.trade.loss}/${r.trade.be} ไม่มีจังหวะไม่เข้า ${r.trade.skip}`);
    if (r.sleepAvg !== null) lines.push(`นอนเฉลี่ย ${r.sleepAvg.toFixed(1)} ชม./คืน (${r.sleepNights} คืน)`);
    if (r.sleep.bedSd !== null) lines.push(`ความสม่ำเสมอการนอน: เวลาเข้านอนแกว่ง ±${Math.round(r.sleep.bedSd)} นาที เวลาตื่น ±${r.sleep.wakeSd === null ? "-" : Math.round(r.sleep.wakeSd)} นาที`);
    if (r.feel.n) lines.push(`เช็กอินเฉลี่ย (1-5): นอน ${r.feel.sleep?.toFixed(1)} พลังงาน ${r.feel.energy?.toFixed(1)} อารมณ์ ${r.feel.mood?.toFixed(1)} (${r.feel.n} วัน)`);
    if (r.weight) lines.push(`น้ำหนัก ${r.weight.from.toFixed(1)} -> ${r.weight.to.toFixed(1)} kg (${r.weight.perWeek.toFixed(2)} kg/สัปดาห์, ชั่ง ${r.weight.weighIns} ครั้ง)`);
    const weak = r.items.filter((i) => i.planned >= 2).slice(0, 4).map((i) => `${il(i.id)} ${i.done}/${i.planned}${i.avgDelay !== null ? ` ช้า ${i.avgDelay}น.` : ""}`);
    if (weak.length) lines.push(`รายการที่พลาดบ่อย: ${weak.join("; ")}`);
    const wd = DOW.map((d, i) => `${d}:${pct(r.weekday[i])}`).join(" ");
    lines.push(`ตามวัน: ${wd}`);
  }

  // insights() quotes item titles: hand it canonical labels.
  lines.push(`ข้อสังเกตอัตโนมัติ: ${insights({ ...r30, items: r30.items.map((i) => ({ ...i, title: il(i.id) })) }, s).join(" | ")}`);
  if (day) {
    const items = dayItems(s, day, today);
    const { key, def } = resolveTemplate(cfg, day.type);
    const left = items.filter((i) => !day.done[i.id]).map((i) => `${hm(i.min)} ${il(i.id)}`).slice(0, 8);
    lines.push(`วันนี้ (${today}, แผน "${tl(key)}"${def.work ? " มีกะงาน 16:00-02:00" : ""}): ทำแล้ว ${items.length - left.length}/${items.length} ยังเหลือ: ${left.join(", ") || "-"}`);
    if (day.checkin?.mood) lines.push(`เช็กอินวันนี้: นอน ${day.checkin.sleep} พลังงาน ${day.checkin.energy} อารมณ์ ${day.checkin.mood}`);
  }
  const g = nextInCycle(GYM_CYCLE, s.workouts.filter((x) => x.date !== today));
  lines.push(`ยิมครั้งถัดไป: ${g} ${GYM_LABEL[g]} · เมื่อวาน: ${s.days[addDays(today, -1)] ? "มีบันทึก" : "ไม่มีบันทึก"}`);
  return lines.join("\n");
}

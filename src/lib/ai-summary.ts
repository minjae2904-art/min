// Compact, numbers-only summary for the AI coach. Raw journal text and notes stay out
// (privacy + tokens) - same rule as min1lot-web: the model sees progress figures, not raw data.
import { addDays, hm } from "./date";
import { age, targets } from "./health";
import type { State } from "./model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { dayItems, insights, rangeStats, streak, weightStats } from "./stats";

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);

export function aiSummary(s: State, today: string): string {
  const p = s.profile;
  const w = weightStats(s, today);
  const t = targets(p, w.cur);
  const r7 = rangeStats(s, today, 7);
  const r30 = rangeStats(s, today, 30);
  const st = streak(s, today);
  const day = s.days[today];
  const lines: string[] = [];

  lines.push(`โปรไฟล์: ${p.sex === "m" ? "ชาย" : "หญิง"} ${age(p.birth)} ปี สูง ${p.heightCm} cm เป้าเพิ่มน้ำหนัก ${p.startKg} -> ${p.goalKg} kg`);
  lines.push(`งาน: กะดึก 16:00-02:00 เข้ายิมหลังเลิกงาน นอนราว 05:00-13:00 ตารางเลื่อน ${s.schedule.shiftMin} นาที`);
  lines.push(`เป้าโภชนาการ: ~${t.kcal} kcal/วัน โปรตีน ~${t.protein} g ไม่นับแคลละเอียด ใช้ติ๊กมื้อ`);
  lines.push(`น้ำหนักแนวโน้มตอนนี้ ${w.cur.toFixed(1)} kg, 7 วันล่าสุด ${w.rate === null ? "-" : `${w.rate >= 0 ? "+" : ""}${w.rate.toFixed(2)} kg`}`);
  lines.push(`ต่อเนื่อง ${st.days} วัน (เกณฑ์วันที่ดี ${pct(s.settings.goodDay)})`);

  for (const [label, r] of [["7 วัน", r7], ["30 วัน", r30]] as const) {
    lines.push(`--- ${label}: บันทึก ${r.loggedDays}/${r.n} วัน`);
    lines.push(`ความครบเฉลี่ย ${pct(r.avgScore)} วันที่ดี ${r.goodDays} ตรงเวลา ${pct(r.onTimeRate)} น้ำเฉลี่ย ${(r.waterAvg / 1000).toFixed(1)} L ถึงเป้า ${r.waterMetDays} วัน`);
    lines.push(`ยิม ${r.sessions} ครั้ง (${r.perWeek.toFixed(1)}/สัปดาห์) แยก ${Object.entries(r.rotation).map(([k, v]) => `${k}:${v}`).join(" ")} เทนนิส ${r.tennis}`);
    lines.push(`ฝึกบุคลิก ${Object.values(r.persona).reduce((a, b) => a + b, 0)} ครั้ง, journal ${r.journals} วัน`);
    lines.push(`เทรด: เช็กแผน ${r.trade.days} วัน ${r.trade.count} ไม้ ชนะ/แพ้/เสมอ ${r.trade.win}/${r.trade.loss}/${r.trade.be} ไม่มีจังหวะไม่เข้า ${r.trade.skip}`);
    if (r.feel.n) lines.push(`เช็กอินเฉลี่ย (1-5): นอน ${r.feel.sleep?.toFixed(1)} พลังงาน ${r.feel.energy?.toFixed(1)} อารมณ์ ${r.feel.mood?.toFixed(1)} (${r.feel.n} วัน)`);
    if (r.weight) lines.push(`น้ำหนัก ${r.weight.from.toFixed(1)} -> ${r.weight.to.toFixed(1)} kg (${r.weight.perWeek.toFixed(2)} kg/สัปดาห์, ชั่ง ${r.weight.weighIns} ครั้ง)`);
    const weak = r.items.filter((i) => i.planned >= 2).slice(0, 4).map((i) => `${i.title} ${i.done}/${i.planned}${i.avgDelay !== null ? ` ช้า ${i.avgDelay}น.` : ""}`);
    if (weak.length) lines.push(`รายการที่พลาดบ่อย: ${weak.join("; ")}`);
    const wd = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => `${d}:${pct(r.weekday[i])}`).join(" ");
    lines.push(`ตามวัน: ${wd}`);
  }

  lines.push(`ข้อสังเกตอัตโนมัติ: ${insights(r30, s).join(" | ")}`);
  if (day) {
    const items = dayItems(s, day);
    const left = items.filter((i) => !day.done[i.id]).map((i) => `${hm(i.min)} ${i.title}`).slice(0, 8);
    lines.push(`วันนี้ (${today}, ${day.type === "work" ? "วันทำงาน" : "วันหยุด"}): ทำแล้ว ${items.length - left.length}/${items.length} ยังเหลือ: ${left.join(", ") || "-"}`);
    if (day.checkin?.mood) lines.push(`เช็กอินวันนี้: นอน ${day.checkin.sleep} พลังงาน ${day.checkin.energy} อารมณ์ ${day.checkin.mood}`);
  }
  const g = nextInCycle(GYM_CYCLE, s.workouts.filter((x) => x.date !== today));
  lines.push(`ยิมครั้งถัดไป: ${g} ${GYM_LABEL[g]} · เมื่อวาน: ${s.days[addDays(today, -1)] ? "มีบันทึก" : "ไม่มีบันทึก"}`);
  return lines.join("\n");
}

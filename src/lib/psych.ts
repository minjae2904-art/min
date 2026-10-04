// Behaviour-design helpers. Each feature maps to a well-studied effect:
//  - Two-minute rule / tiny habits: when something is overdue, shrink it so starting is easy.
//  - Identity-based habits: show who you are becoming, not just what to do.
//  - Fresh-start effect: Mondays and the 1st of the month are natural restart points.
//  - Self-compassion after a miss predicts getting back on track better than guilt.
//  - Positive reinforcement with some variability keeps rewards from going stale.
//  - Achievements mark milestones (progress principle: visible progress fuels motivation).
import { addDays } from "./date";
import type { State } from "./model";
import type { Item } from "./schedule";
import { dayScore, streak, weightStats } from "./stats";

export const DEFAULT_IDENTITY = "ฉันคือคนที่ดูแลร่างกายและทำตามแผนทุกวัน ไม่ว่ากะไหน";

export function microStep(i: Item): string {
  switch (i.kind) {
    case "meal": return "เริ่มแค่ครึ่งจานก่อน ที่เหลือค่อยตามมา";
    case "supp": return "ชงไว้ก่อน ใช้เวลาไม่ถึง 1 นาที";
    case "gym": return "แค่ไปถึงยิมแล้ววอร์มอัพ 5 นาที วันไหนเหนื่อยเล่นเบาก็ยังนับ";
    case "personality": return "เปิดคลิปแล้วพูดตาม 2 นาทีก็พอ";
    case "weigh": return "ขึ้นชั่ง 10 วินาที จดตัวเลขแล้วไปต่อ";
    case "trade": return "เปิดกราฟดูแผน 2 นาที ถ้าไม่มีจังหวะ ไม่เข้าก็นับว่าทำตามวินัยแล้ว";
    case "sleep": return "วางมือถือไกลเตียง ปิดไฟ";
    default: return "ทำแค่ 2 นาทีก็นับว่าเริ่มแล้ว";
  }
}

const PRAISE = [
  "ดีมาก ทีละข้อแบบนี้แหละ",
  "อีกก้าวสู่เป้าหมาย",
  "ทำได้ตามที่ตั้งใจ",
  "ร่างกายขอบคุณนะ",
  "ความสม่ำเสมอชนะทุกอย่าง",
  "นี่แหละตัวตนที่คุณเลือก",
  "เก็บแต้มความมั่นใจไปอีกหนึ่ง",
];
// Show praise on roughly 1 in 3 ticks so it stays meaningful (variable reinforcement).
export function maybePraise(roll: number): string | null {
  return roll < 0.33 ? PRAISE[Math.floor((roll / 0.33) * PRAISE.length) % PRAISE.length] : null;
}

export function dayMessage(s: State, today: string): string | null {
  const d = new Date(today + "T12:00:00");
  const yesterday = s.days[addDays(today, -1)];
  const hadHistory = Object.keys(s.days).length > 1;
  if (hadHistory && yesterday && dayScore(s, yesterday) < s.settings.goodDay) return "เมื่อวานไม่ครบไม่เป็นไร วันนี้แค่ไม่พลาดซ้ำ 2 วันติดก็พอ";
  if (d.getDate() === 1) return "เดือนใหม่ เริ่มต้นใหม่ เป็นจังหวะที่ดีที่สุดในการตั้งใจอีกครั้ง";
  if (d.getDay() === 1) return "สัปดาห์ใหม่ เริ่มต้นใหม่";
  return null;
}

export type Badge = { id: string; title: string; desc: string; group: string };

// Every badge the app can award, with a check against current data.
export function badgeCatalog(s: State, today: string): (Badge & { earned: boolean })[] {
  const st = streak(s, today).days;
  const gym = s.workouts.filter((w) => w.code.startsWith("D")).length;
  const persona = s.personality.length;
  const perfect = Object.values(s.days).filter((d) => dayScore(s, d) >= 1).length;
  const gained = weightStats(s, today).cur - s.profile.startKg;
  const waterDays = Object.values(s.days).filter((d) => d.waterMl >= 2500).length;
  const journals = Object.values(s.days).filter((d) => d.journal && (d.journal.good || d.journal.fix || d.journal.thanks)).length;
  const out: (Badge & { earned: boolean })[] = [];
  const add = (id: string, group: string, title: string, desc: string, earned: boolean) => out.push({ id, group, title, desc, earned });
  for (const n of [3, 7, 14, 30, 60, 100]) add(`streak-${n}`, "ต่อเนื่อง", `${n} วันติด`, `ทำครบตามเป้า ${n} วันติดต่อกัน`, st >= n);
  for (const n of [1, 7, 30]) add(`perfect-${n}`, "ครบ 100%", n === 1 ? "วันสมบูรณ์แบบ" : `ครบ 100% ${n} วัน`, "ทุกรายการในวันเดียว", perfect >= n);
  for (const n of [10, 25, 50, 100, 200]) add(`gym-${n}`, "ยิม", `ยิม ${n} ครั้ง`, `เช็กอินยิมรวม ${n} ครั้ง`, gym >= n);
  for (const n of [1, 3, 5, 10, 15]) add(`kg-${n}`, "น้ำหนัก", `+${n} kg`, `น้ำหนักแนวโน้มเพิ่มจากจุดเริ่ม ${n} kg`, gained >= n);
  add("kg-goal", "น้ำหนัก", "ถึงเป้าหมาย", `แตะ ${s.profile.goalKg} kg`, gained > 0 && weightStats(s, today).cur >= s.profile.goalKg);
  for (const n of [7, 30]) add(`water-${n}`, "น้ำ", `ดื่มน้ำดี ${n} วัน`, `ดื่ม 2.5 ลิตรขึ้นไป ${n} วัน`, waterDays >= n);
  for (const n of [10, 30, 100]) add(`persona-${n}`, "บุคลิกภาพ", `ฝึก ${n} ครั้ง`, `ฝึกบุคลิกภาพรวม ${n} ครั้ง`, persona >= n);
  const tradeDays = Object.values(s.days).filter((d) => d.trade).length;
  const disciplined = Object.values(s.days).filter((d) => d.trade?.result === "skip").length;
  for (const n of [10, 30, 100]) add(`trade-${n}`, "เทรด", `บันทึกเทรด ${n} วัน`, `เช็กแผนเทรดและบันทึกผล ${n} วัน`, tradeDays >= n);
  add("trade-discipline", "เทรด", "วินัยเหนือใจ", "ไม่มีจังหวะแล้วไม่เข้า 5 ครั้ง", disciplined >= 5);
  for (const n of [7, 30]) add(`journal-${n}`, "ทบทวนตัวเอง", `journal ${n} วัน`, `เขียนทบทวนก่อนนอน ${n} วัน`, journals >= n);
  return out;
}

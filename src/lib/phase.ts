// "What time is it in my day?" - the current block of the night-shift day, for the big Now banner.
import type { DayLog, State } from "./model";
import { buildDay, type Item } from "./schedule";

export type Phase = { key: string; label: string; tip: string; color: string; start: number; end: number };

const find = (items: Item[], id: string) => items.find((i) => i.id === id)?.min;

export function phases(s: State, d: DayLog): Phase[] {
  const items = buildDay(d.type, d.meal2, s.schedule);
  const wake = find(items, "weigh") ?? items[0]?.min ?? 13 * 60;
  const sleep = find(items, "sleep") ?? 29 * 60;
  const P = (key: string, label: string, tip: string, color: string, start: number, end: number): Phase => ({ key, label, tip, color, start, end });

  if (d.type === "off") {
    const cardio = find(items, "cardio") ?? 16 * 60;
    const meal3 = find(items, "meal3") ?? 25 * 60;
    return [
      P("morning", "ช่วงสบาย", "ทำนิสัยเล็กๆ ให้ครบตั้งแต่เช้า วันหยุดจะง่ายขึ้นทั้งวัน", "var(--orange)", wake, cardio),
      P("move", "เวลาขยับร่างกาย", "เทนนิส/คาร์ดิโอ หรือเดินเบาๆ ทากันแดดด้วย", "var(--green)", cardio, cardio + 120),
      P("evening", "ช่วงเย็น", "กินมื้อ 2 ให้อิ่ม เตรียมของสำหรับพรุ่งนี้", "var(--pink)", cardio + 120, meal3),
      P("winddown", "ผ่อนคลายก่อนนอน", "ลดแสงจอ ทบทวนวันนี้ เตรียมนอนเวลาเดิม", "var(--purple)", meal3, sleep),
      P("sleep", "เวลานอน", "นอนเวลาเดิมแม้วันหยุด ร่างกายจะไม่เพลียเหมือน jet lag", "var(--blue)", sleep, wake + 1440),
    ];
  }

  const workIn = find(items, "work-in") ?? 16 * 60;
  const workOut = find(items, "work-out") ?? 26 * 60;
  const meal2 = find(items, "meal2") ?? 21 * 60;
  const gym = find(items, "gym") ?? workOut + 30;
  const gymEnd = gym + 75;
  return [
    P("prep", "ช่วงเตรียมตัว", "ช่วงสมองสดที่สุด กินมื้อใหญ่ + ฝึกบุคลิกให้จบก่อนเข้างาน", "var(--orange)", wake, workIn),
    P("work1", "ทำงาน ช่วงแรก", "จิบน้ำทุกชั่วโมง โฟกัสงาน", "var(--blue)", workIn, meal2),
    P("break", "พักกะ", "โปรตีนนำ กินช้าๆ ถ้าไม่ทันกิน whey แทนแล้วเลือกแบบในแอป", "var(--pink)", meal2, meal2 + 60),
    P("work2", "ทำงาน ช่วงหลัง", "เตรียม whey ก่อนยิม ช่วงดึกกินเบาๆ", "var(--blue)", meal2 + 60, workOut),
    P("commute", "เลิกงาน ไปยิม", "อย่าแวะนาน ยิ่งเริ่มเร็วยิ่งได้นอนเร็ว", "var(--teal)", workOut, gym),
    P("gym", "เวลายิม", "วอร์มอัพ 5 นาที จดน้ำหนักที่ยก เล่นใกล้หมดแรง 1-3 ครั้ง", "var(--green)", gym, gymEnd),
    P("recover", "ฟื้นฟู เตรียมนอน", "whey + มื้อเบา อาบน้ำ ลดแสง เขียน journal", "var(--purple)", gymEnd, sleep),
    P("sleep", "เวลานอน", "ห้องมืด เย็น เงียบ นอนให้ครบ 8 ชั่วโมง", "var(--indigo, #5e5ce6)", sleep, wake + 1440),
  ];
}

export function currentPhase(s: State, d: DayLog, nowMin: number) {
  const list = phases(s, d);
  // Before wake-up the logical day hasn't started: treat as the tail of last night's sleep.
  const m = nowMin < list[0].start ? nowMin + 1440 : nowMin;
  const i = Math.max(0, list.findIndex((p) => m >= p.start && m < p.end));
  const p = list[i];
  const next = list[(i + 1) % list.length];
  return { phase: p, next, progress: Math.min(1, Math.max(0, (m - p.start) / Math.max(1, p.end - p.start))), left: p.end - m };
}

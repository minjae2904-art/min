import { at } from "./date";
import type { ScheduleCfg } from "./model";

export type Kind = "weigh" | "meal" | "supp" | "gym" | "habit" | "personality" | "trade" | "sleep" | "work";
export type Ring = "food" | "body" | "habit";
export type Meal2 = "A" | "B" | "C";
export type DayType = "work" | "off";

export type Item = {
  id: string;
  min: number; // logical minutes (see date.ts)
  title: string;
  sub?: string;
  kind: Kind;
  ring?: Ring; // items without a ring are info-only (work start/end)
  remind?: boolean; // false = never notify for this item
  cue?: string; // habit stacking: the event this item follows
  custom?: boolean;
};

export const MEAL2_LABEL: Record<Meal2, string> = {
  A: "กินข้าวตอนพัก 21:00",
  B: "กิน whey แทน",
  C: "รอกินก่อนเข้ายิม",
};

// Habit stacking / implementation intentions: each habit hangs on an event that already happens.
// Research: event-based cues build automaticity better than clock-time reminders.
export const CUES: Record<string, string> = {
  weigh: "ทันทีที่ตื่น หลังเข้าห้องน้ำ",
  posture: "หลังชั่งน้ำหนัก",
  supp1: "พร้อมมื้อหลัก 1",
  persona: "หลังมื้อแรก ก่อนหยิบมือถือ",
  supp2: "ก่อนเลิกงาน 30 นาที",
  trade: "หลังฝึกบุคลิกภาพ เปิดกราฟดูแผนก่อน",
  supp3: "ทันทีที่จบเซ็ตสุดท้าย",
  night: "หลังกินมื้อ 3",
  sleep: "หลังเขียน journal",
};

// The day as the user configured it: base template + shift offset + per-item overrides + custom items.
// dayShift = today-only offset on top of the global shift (set from the wake-up button).
export function buildDay(type: DayType, meal2?: Meal2, cfg?: ScheduleCfg, dayShift = 0): Item[] {
  const base = baseDay(type, meal2);
  if (!cfg) return base;
  const shift = cfg.shiftMin + dayShift;
  const out: Item[] = [];
  for (const i of base) {
    const o = cfg.overrides[`${type}:${i.id}`] ?? {};
    if (o.enabled === false) continue;
    const min = (o.min !== undefined ? o.min + dayShift : undefined) ?? (i.ring ? i.min + shift : i.min);
    out.push({ ...i, min, title: o.title || i.title, remind: o.remind ?? true, cue: CUES[i.id] });
  }
  for (const c of cfg.custom) {
    if (c.days !== "both" && c.days !== type) continue;
    const o = cfg.overrides[`${type}:${c.id}`] ?? {};
    out.push({ id: c.id, title: c.title, sub: c.sub, min: c.min + shift, kind: c.ring === "food" ? "meal" : "habit", ring: c.ring, remind: o.remind ?? true, custom: true });
  }
  return out.sort((a, b) => a.min - b.min);
}

// Night shift 16:00-02:00, gym right after work. See research/system-design.md section 2.
export function baseDay(type: DayType, meal2?: Meal2): Item[] {
  if (type === "off") {
    return [
      { id: "weigh", min: at(13), title: "ตื่น + ชั่งน้ำหนัก", sub: "ก่อนกิน หลังเข้าห้องน้ำ", kind: "weigh", ring: "body" },
      { id: "posture", min: at(13, 10), title: "Chin tuck + Wall angel", sub: "อย่างละ 10 ครั้ง", kind: "habit", ring: "habit" },
      { id: "meal1", min: at(13, 30), title: "มื้อหลัก 1", sub: "มื้อใหญ่สุดของวัน", kind: "meal", ring: "food" },
      { id: "supp1", min: at(13, 30), title: "Whey #1 + Creatine", sub: "creatine 3-5 g", kind: "supp", ring: "food" },
      { id: "persona", min: at(14, 30), title: "ฝึกบุคลิกภาพ", kind: "personality", ring: "habit" },
      { id: "trade", min: at(15, 15), title: "เทรด 1 ไม้ตามแผน", sub: "ไม่มีจังหวะ = ไม่เข้า ก็นับว่าทำแล้ว", kind: "trade", ring: "habit" },
      { id: "cardio", min: at(16), title: "เทนนิส / คาร์ดิโอ / พัก", sub: "ทากันแดด + น้ำเพิ่ม", kind: "gym", ring: "body" },
      { id: "meal2", min: at(18, 30), title: "มื้อหลัก 2", kind: "meal", ring: "food" },
      { id: "snack", min: at(22), title: "ของว่าง / Whey", kind: "supp", ring: "food" },
      { id: "meal3", min: at(1), title: "มื้อหลัก 3", kind: "meal", ring: "food" },
      { id: "night", min: at(4, 30), title: "Skincare + Journal", sub: "ดีวันนี้ 1 / แก้ 1 / ขอบคุณ 1", kind: "habit", ring: "habit" },
      { id: "sleep", min: at(5), title: "นอน", sub: "ห้องมืด ปิดเสียง", kind: "sleep", ring: "habit" },
    ];
  }

  const c = meal2 === "C";
  const items: Item[] = [
    { id: "weigh", min: at(13), title: "ตื่น + ชั่งน้ำหนัก", sub: "ก่อนกิน หลังเข้าห้องน้ำ", kind: "weigh", ring: "body" },
    { id: "posture", min: at(13, 10), title: "Chin tuck + Wall angel", sub: "อย่างละ 10 ครั้ง", kind: "habit", ring: "habit" },
    { id: "meal1", min: at(13, 30), title: "มื้อหลัก 1", sub: "มื้อใหญ่สุด ~900 kcal", kind: "meal", ring: "food" },
    { id: "supp1", min: at(13, 30), title: "Whey #1 + Creatine", sub: "creatine 3-5 g", kind: "supp", ring: "food" },
    { id: "persona", min: at(14, 15), title: "ฝึกบุคลิกภาพ", sub: "30-45 นาที", kind: "personality", ring: "habit" },
    { id: "trade", min: at(15), title: "เทรด 1 ไม้ตามแผน", sub: "ไม่มีจังหวะ = ไม่เข้า ก็นับว่าทำแล้ว", kind: "trade", ring: "habit" },
    { id: "snack", min: at(15, 30), title: "ของว่างก่อนเข้างาน", sub: "นม / กล้วย / แซนด์วิช", kind: "meal", ring: "food" },
    { id: "work-in", min: at(16), title: "เข้างาน", kind: "work" },
    { id: "meal2", min: at(21), title: "มื้อหลัก 2", sub: meal2 ? MEAL2_LABEL[meal2] : "แตะเพื่อเลือกแบบ", kind: "meal", ring: "food" },
    { id: "work-out", min: at(2), title: "เลิกงาน", kind: "work" },
    { id: "gym", min: c ? at(3) : at(2, 30), title: "เข้ายิม", kind: "gym", ring: "body" },
    { id: "supp3", min: c ? at(4, 15) : at(3, 45), title: "Whey #3 หลังยิม", kind: "supp", ring: "food" },
    { id: "meal3", min: c ? at(4, 30) : at(4), title: "มื้อหลัก 3", sub: c ? "มื้อเบา (กินก่อนยิมแล้ว)" : "ย่อยง่าย ไม่มันจัด", kind: "meal", ring: "food" },
    { id: "night", min: c ? at(5) : at(4, 30), title: "อาบน้ำ + Skincare + Journal", kind: "habit", ring: "habit" },
    { id: "sleep", min: c ? at(5, 30) : at(5), title: "นอน 8 ชม.", sub: "ห้องมืด ปิดเสียง", kind: "sleep", ring: "habit" },
  ];
  if (meal2 === "B") items.push({ id: "snack-b", min: at(23, 45), title: "ของว่างชดเชย ~500 kcal", sub: "นม + ขนมปังเนยถั่ว", kind: "meal", ring: "food" });
  if (meal2 === "C") items.push({ id: "meal2c", min: at(2, 5), title: "กินข้าวก่อนยิม", sub: "ไม่ต้องหนักมาก", kind: "meal", ring: "food" });
  else items.push({ id: "supp2", min: at(1, 30), title: "Whey #2 + กล้วย", sub: "ก่อนยิม 30-60 นาที", kind: "supp", ring: "food" });
  // C moves the meal to 02:05 (meal2c), so the 21:00 slot is dropped rather than left undone.
  return items.filter((i) => !(meal2 === "C" && i.id === "meal2")).sort((a, b) => a.min - b.min);
}

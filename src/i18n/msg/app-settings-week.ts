// Dictionary for src/app/settings/week/page.tsx (batch 7). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // week (src/app/settings/week/page.tsx)
  "week.default": "ตามค่าพื้นฐาน",
  "week.title": "แผนประจำสัปดาห์",
  "week.sub": "วันที่ยังไม่ได้บันทึกจะใช้แผนนี้ เปลี่ยนรายวันได้ที่หน้าวันนี้",
  "week.presets.header": "ชุดสำเร็จรูป",
  "week.daily.header": "รายวัน",
  "week.daily.footer": "7 วันข้างหน้าตามแผน: {stream}เกม ~{game} ชม. · ร้องเพลง {singDays} วัน ~{sing} ชม. · เซิฟ ~{mc} ชม. · ยก {gym} ครั้ง · คาร์ดิโอ {cardio} · เทรด {trade} วัน · มีผลกับวันที่ยังไม่ได้บันทึกเท่านั้น",
  "week.daily.footerStream": "ไลฟ์ ~{h} ชม. · ",
  "week.row.default": "ตามค่าพื้นฐาน · {kind} (แบบเดิม)",
  "week.kind.off": "วันหยุด",
  "week.kind.work": "วันทำงาน",
  "week.row.fxClosed": "ตลาด FX ปิด วันนั้นกด 'ไม่มีจังหวะ' หรือเลือกแผนที่ไม่มีเทรด",
  "week.base.header": "ค่าพื้นฐานเมื่อไม่ได้เลือกแผน",
  "week.base.footer": "วันที่เลือก = วันหยุด (แบบเดิม) ที่เหลือ = วันทำงาน (แบบเดิม)",
  "week.base.title": "วันหยุดประจำ",
  "week.base.sub": "วันที่ยังไม่ได้บันทึกจะเริ่มเป็นวันหยุด (สลับได้ในหน้าวันนี้)",
  "week.confirm.title": "ใช้ชุด \"{name}\"",
  "week.confirm.btn": "ใช้ชุดนี้",
  "week.toast.applied": "ใช้ชุด \"{name}\" แล้ว",
};

export const en: Tr<typeof th> = {
  "week.default": "Default",
  "week.title": "Week plan",
  "week.sub": "Days not logged yet use this plan. Change a single day on Today",
  "week.presets.header": "Presets",
  "week.daily.header": "By day",
  "week.daily.footer": "Next 7 days by plan: {stream}Gaming ~{game} h · Singing {singDays|# day|# days} ~{sing} h · Server ~{mc} h · Lifting {gym|# time|# times} · Cardio {cardio} · Trade {trade|# day|# days} · Only affects days not logged yet",
  "week.daily.footerStream": "Live ~{h} h · ",
  "week.row.default": "Default · {kind} (old style)",
  "week.kind.off": "Day off",
  "week.kind.work": "Workday",
  "week.row.fxClosed": "FX market is closed. That day, tap 'No setup' or pick a plan without trading",
  "week.base.header": "Default when no plan is picked",
  "week.base.footer": "Selected days = day off (old style), the rest = workday (old style)",
  "week.base.title": "Regular days off",
  "week.base.sub": "Days not logged yet start as a day off (switch it on Today)",
  "week.confirm.title": "Use \"{name}\"",
  "week.confirm.btn": "Use this preset",
  "week.toast.applied": "Using \"{name}\"",
};

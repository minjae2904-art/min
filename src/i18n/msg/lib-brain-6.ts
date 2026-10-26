// Dictionary for src/lib/brain/rules.ts (batch 6). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // rules (src/lib/brain/rules.ts): variant button labels
  "rules.v.tryIt": "จะลองดู",
  "rules.v.lastMatchNotify": "แจ้งเตือนแมตช์สุดท้าย",
  "rules.v.setFocus": "ปักโฟกัส",
  "rules.v.easyDay": "วันเล่นเบา",
  "rules.v.toRestDay": "เปลี่ยนเป็นวันพัก",
  "rules.v.remindOn": "เปิดเตือน",
  "rules.v.autoWater": "เป้าน้ำอัตโนมัติ",
  "rules.v.water90": "เตือนทุก 90 นาที",
  "rules.v.meal2Earlier": "มื้อ 2 เร็วขึ้น 30 นาที",
  "rules.v.deloadWeek": "สัปดาห์ deload",
  "rules.v.voiceRest": "พักเสียง",
  "rules.v.resetSing": "คืนเวลาร้องเดิม",
  "rules.v.start2": "เริ่ม 2 นาที",
  "rules.v.moveSing": "ขยับเวลาร้อง",
  "rules.v.mcBuildDay": "สลับเป็นวันลุยเซิฟ",
  "rules.v.lighterTomorrow": "พรุ่งนี้เบาลง",
  "rules.v.minDay": "วันขั้นต่ำ",
  "rules.v.cutExtras": "ตัดรายการเสริม",
  "rules.v.addRestDay": "เพิ่มวันพัก",
};

export const en: Tr<typeof th> = {
  "rules.v.tryIt": "Try it",
  "rules.v.lastMatchNotify": "Last-match reminder",
  "rules.v.setFocus": "Set focus",
  "rules.v.easyDay": "Easy day",
  "rules.v.toRestDay": "Make it a rest day",
  "rules.v.remindOn": "Turn on reminder",
  "rules.v.autoWater": "Auto water goal",
  "rules.v.water90": "Remind every 90 min",
  "rules.v.meal2Earlier": "Meal 2, 30 min earlier",
  "rules.v.deloadWeek": "Deload week",
  "rules.v.voiceRest": "Voice rest",
  "rules.v.resetSing": "Restore singing time",
  "rules.v.start2": "Start with 2 min",
  "rules.v.moveSing": "Move singing time",
  "rules.v.mcBuildDay": "Swap to a server build day",
  "rules.v.lighterTomorrow": "Lighter tomorrow",
  "rules.v.minDay": "Minimum day",
  "rules.v.cutExtras": "Cut extras",
  "rules.v.addRestDay": "Add a rest day",
};

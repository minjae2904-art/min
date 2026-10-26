// Dictionary for src/app/api/auth/pin/route.ts (batch 10). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // pin (src/app/api/auth/pin/route.ts)
  "pin.err.locked": "ใส่ผิดหลายครั้ง ลองใหม่ใน 15 นาที",
  "pin.err.required": "ต้องใช้ PIN",
  "pin.err.wrong": "PIN ไม่ถูกต้อง",
  "pin.err.format": "PIN ต้องเป็นตัวเลข 4-6 หลัก",
  "pin.err.wrongOld": "PIN เดิมไม่ถูกต้อง",
};

export const en: Tr<typeof th> = {
  "pin.err.locked": "Too many wrong tries. Try again in 15 minutes",
  "pin.err.required": "PIN required",
  "pin.err.wrong": "Wrong PIN",
  "pin.err.format": "The PIN is 4-6 digits",
  "pin.err.wrongOld": "Current PIN is wrong",
};

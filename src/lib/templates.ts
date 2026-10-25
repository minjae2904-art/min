// Built-in day templates. Each new one is a declarative patch on a baseDay() body (schedule.ts), so the
// weight-gain core (weigh, posture, meal1, supp1, meal2, snack, meal3, night, sleep) is shared by id.
// "work" and "off" are the legacy built-ins and return baseDay() unchanged.
import { at } from "./date";
import type { Item, PhaseDef, TemplateDef } from "./schedule";

// Items shared by id across templates (ticks survive a template switch).
const MC_CHECK: Item = { id: "mc-check", min: at(13, 50), dur: 10, title: "เช็กเซิฟ 10 นาที", sub: "log / backup รันไหม / รีพอร์ตผู้เล่น", kind: "mc", ring: "habit" };
const GYM: Item = { id: "gym", min: at(17, 30), dur: 90, title: "เข้ายิม", sub: "หมุน D1-D4", kind: "gym", ring: "body" };
const SUPP3: Item = { id: "supp3", min: at(19), dur: 10, title: "Whey หลังยิม + กล้วย", sub: "~300 kcal + น้ำ 500 ml", kind: "supp", ring: "food" };
const CAF: Item = { id: "caf", min: at(23), title: "งดกาแฟ / ชูกำลังหลังจากนี้", kind: "habit", moves: true };
const GAME_STOP: Item = { id: "game-stop", min: at(3), dur: 45, title: "หยุดเกมแข่ง เหลือเกมชิลหรือพัก", kind: "game", moves: true };
const PRESLEEP: Item = { id: "presleep", min: at(3, 45), title: "โปรตีนก่อนนอน", sub: "นม / เคซีน 30-40 g ~300 kcal", kind: "supp", ring: "food" };
const game = (min: number, title: string, sub: string, session?: "ny"): Item => ({ id: "game", min, endAt: "game-stop", title, sub, kind: "game", moves: true, ...(session ? { session } : {}) });
const game1 = (title: string, sub?: string): Item => ({ id: "game1", min: at(15), dur: 90, title, ...(sub ? { sub } : {}), kind: "game", moves: true });

// Core patches shared by the no-work templates.
const MORNING = { meal1: { min: at(13, 20), sub: "~650 kcal โปรตีน 30-40 g" }, supp1: { min: at(13, 20) }, persona: { defaultOff: true } };
const LATE = { snack: { min: at(0), title: "มื้อกลางเกม (พักจอ)", kind: "meal" as const, sub: "~450 kcal" }, night: { min: at(4, 15), title: "ปิดจอ อาบน้ำ Skincare + Journal" } };
const OFF_CUES = { trade: "หลัง whey หลังยิม", night: "หลังโปรตีนก่อนนอน" };

const ph = (key: string, anchor: PhaseDef["at"], label: string, tip: string, color: string): PhaseDef => ({ key, at: anchor, label, tip, color });
const P_MORNING = ph("morning", "weigh", "เช้าสบาย", "น้ำอุ่น 500 ml · ชั่ง · มื้อ 1 + creatine · เช็กเซิฟ · ไม่ตะโกนก่อนวอร์มเสียง", "var(--orange)");
const P_SING = ph("sing", "sing", "ร้องเพลง", "วอร์ม 10-15 > ฝึก 1 เทคนิค + 1 เพลง > คูลดาวน์ 5 · เจ็บคอ = หยุด", "var(--pink)");
const P_BUILD = ph("build", "mc", "ลุยเซิฟ", "10-15 นาทีแรกเช็ก log/backup แล้วทำเป้าเดียว", "var(--teal)");
const P_FUEL = ph("fuel", "meal2", "กิน + เตรียมยิม", "คาร์บ + โปรตีน ไขมันต่ำ พักให้ย่อยก่อนยิม", "var(--orange)");
const P_GYM = ph("gym", "gym", "เวลายิม", "วอร์มอัพ 5 นาที จดน้ำหนักที่ยก เล่นใกล้หมดแรง 1-3 ครั้ง", "var(--green)");
const P_DINNER = ph("dinner", "meal3", "มื้อเย็น", "มื้อหลักหลังยิม กินให้อิ่มก่อนเริ่มเกม", "var(--pink)");
const P_GAME = ph("game", "game", "เวลาเกม", "เล่นเต็มที่ ไม่ต้องรู้สึกผิด · ลุกยืดทุก 60 นาที · จิบน้ำ · งดกาแฟหลัง 23:00", "var(--purple)");
const P_WIND = ph("winddown", "game-stop", "ผ่อนคลายก่อนนอน", "เกมแข่งพอแล้ว เกมชิลหรือพัก · โปรตีนก่อนนอน · ปิดจอ 04:00", "var(--teal)");
const P_MOVE = ph("move", "cardio", "ขยับเบาๆ", "เทนนิส/คาร์ดิโอเบา/เดิน ไม่หนัก ทากันแดด", "var(--green)");

// v1.4 stream season: wake 09:30, sleep 01:30, live 19:00-00:30 (marathon 15:00). No session items: go-live stays
// 19:00 when US DST ends (2026-11-01); London opens 15:00 BKK all season (UK on GMT from 2026-10-25).
// Placed after ph() (the SP_* phases call it at module load).
const S_CORE = {
  weigh: { min: at(9, 30), sub: "ก่อนกิน หลังเข้าห้องน้ำ · น้ำ 400 ml · ออกไปรับแสง 10-15 นาที" },
  posture: { min: at(9, 45) },
  meal1: { min: at(10), sub: "~650 kcal โปรตีน 30-40 g · กาแฟได้" },
  supp1: { min: at(10), title: "Creatine 3-5 g", sub: "ทุกวันรวมวันพัก · เติม whey ถ้ามื้อ 1 โปรตีนไม่ถึง 30 g" },
  persona: { defaultOff: true },
  meal2: { min: at(13), sub: "~750 kcal โปรตีน 35-40 g" },
  meal3: { min: at(18), title: "มื้อเย็น (ก่อนไลฟ์)", sub: "~800 kcal โปรตีน 35-40 g · กินเสร็จก่อนไลฟ์ 1 ชม." },
  snack: { min: at(21, 45), title: "ของว่างกลางไลฟ์ (BRB)", kind: "meal" as const, sub: "~400 kcal shake นม + โอ๊ต + กล้วย + whey · ปิดไมค์ตอนกิน" },
  night: { min: at(0, 55), title: "อาบน้ำ + Skincare + Journal", sub: "หรี่ไฟ · มือถือไว้ไกลเตียง · ไม่อ่านแชต ไม่ตัดคลิป" },
  sleep: { min: at(1, 30), title: "นอน 8 ชม.", sub: "ห้องมืด เย็น ปิดเสียง" },
};
const S_TRADE = { min: at(14, 45), dur: 50, title: "เทรด London: เตรียม 15 · เทรด 1 ไม้ · จด", sub: "ลอนดอนเปิด 15:00 เวลาไทย · ไม่มี setup = ไม่เข้า (นับว่าทำ) · ถึง loss limit = หยุด · ตั้ง SL/TP ก่อนลุก หรือปิดก่อนเตรียมไลฟ์ · ไม่เทรดระหว่างไลฟ์" };
const S_CAF: Item = { id: "caf", min: at(17, 30), title: "งดกาแฟ / ชูกำลังหลังจากนี้", sub: "คาเฟอีนภายใน 6 ชม. ก่อนนอนทำให้หลับตื้น", kind: "habit", moves: true };
const S_END: Item = { id: "stream-end", min: at(0, 30), title: "ปิดไลฟ์ + raid", sub: "บอกเวลาไลฟ์พรุ่งนี้ · raid ช่องขนาดใกล้กัน · มาร์กคลิปไว้ ไม่ตัดต่อคืนนี้", kind: "stream", moves: true };
const S_PRESLEEP: Item = { ...PRESLEEP, min: at(0, 40), sub: "นม / กรีกโยเกิร์ต โปรตีน 30-40 g ~250 kcal" };
const LIVE_SUB = "พักเงียบ 5 นาทีทุกชั่วโมง (ปิดไมค์) · ลุกยืนทุก 30 นาที · 20-20-20 ตอนโหลด · ขวดน้ำ 1 ลิตรบนโต๊ะ";
const S_SING_SUB = "วอร์ม 10 · ฝึก 1 เทคนิค 10 · คูลดาวน์ 5 · เสียงสดสุดตอนนี้ · แหบ/เจ็บ = หยุด คืนนี้ยังไลฟ์";
const prep = (min: number, dur: number, title: string, sub: string): Item => ({ id: "stream-prep", min, dur, title, sub, kind: "stream", ring: "habit" });
const live = (min: number, title: string, sub: string): Item => ({ id: "stream", min, endAt: "stream-end", title, sub, kind: "stream", ring: "habit" });
const clips = (min: number, dur: number, title: string, sub: string): Item => ({ id: "clips", min, dur, title, sub, kind: "stream", ring: "habit" });
const snack2 = (min: number, title: string, sub: string): Item => ({ id: "snack2", min, dur: 10, title, sub, kind: "meal", ring: "food" });
const S_CUES = { trade: "หลังมื้อ 2 · เปิดกราฟก่อนลอนดอนเปิด", presleep: "หลังปิดไลฟ์ + raid", night: "หลังโปรตีนก่อนนอน", "stream-prep": "หลังมื้อเย็น", stream: "หลังวอร์มเสียง", sing: "หลังมื้อแรก ~45 นาที" };
const SP_MORNING = ph("morning", "weigh", "เช้า: ตื่น + รับแสง", "น้ำ 400 ml · ออกไปรับแสง 10-15 นาทีภายใน 30 นาทีหลังตื่น · มื้อ 1 + creatine", "var(--orange)");
const SP_SING = ph("sing", "sing", "ร้องเพลง (เสียงสด)", "วอร์ม 10 > ฝึก 1 เทคนิค > คูลดาวน์ 5 · แหบ/เจ็บ = หยุด คืนนี้ยังต้องไลฟ์", "var(--pink)");
const SP_CLIPS = ph("clips", "clips", "ตัดคลิป + โพสต์", "1-2 คลิปสั้นจากไลฟ์เมื่อคืน · ตั้งโพสต์ 12:30 / 18:00 · แคปชันบอก 'ไลฟ์ทุกวัน {stream}'", "var(--red)");
const SP_MID = ph("midday", "meal2", "กิน + พัก", "มื้อ 2 ให้อิ่ม · พักจอ · งีบไม่เกิน 20 นาที ไม่งีบหลัง 15:00", "var(--orange)");
const SP_TRADE = ph("trade", "trade", "เทรด London", "15:00 ลอนดอนเปิด · setup เดียว 1 ไม้ · จด journal · ตั้ง SL/TP ก่อนลุก", "var(--blue)");
const SP_PREP = ph("prep", "stream-prep", "เตรียมไลฟ์", "ตั้งชื่อ/ปก · โพสต์ 'ไลฟ์ {stream}' · ขวดน้ำ 1 ลิตร · วอร์มเสียง 5-10 นาที", "var(--red)");
const SP_LIVE = ph("stream", "stream", "ไลฟ์", "ตอบแชตบ่อยๆ · พักเงียบ 5 นาทีทุกชั่วโมง · ลุกยืนทุก 30 นาที · 20-20-20 ตอนโหลด · ชั่วโมงสุดท้ายหรี่ไฟหน้า", "var(--red)");
const SP_WIND = ph("winddown", "stream-end", "ปิดไลฟ์ + ผ่อนคลาย", "raid เพื่อน · มาร์กคลิปไว้พรุ่งนี้ · โปรตีนก่อนนอน · หรี่ไฟ ไม่อ่านแชต · นอน {sleep}", "var(--teal)");

const WORK_ADD: Item[] = [
  { ...MC_CHECK, min: at(14, 15), sub: "log / backup / รีพอร์ต · วันทำงานไม่ทำ deep work" },
  { id: "sing", min: at(14, 30), dur: 30, title: "ร้องเพลง", sub: "วอร์ม 10 · ฝึก 15 · คูลดาวน์ 5 · ร้องก่อนเข้างาน เสียงยังสด", kind: "sing", ring: "habit" },
  CAF,
];
const WORK_TRADE = { title: "เทรด: ตั้งออเดอร์ หรือข้าม", sub: "ระหว่างกะดูกราฟไม่ได้ · ใช้ออเดอร์ที่มี SL/TP ไม่ต้องเฝ้า หรือกด 'ไม่มีจังหวะ' ก็นับว่าทำ", dur: 15 };

export const TEMPLATES: TemplateDef[] = [
  {
    id: "balanced", name: "วันสมดุล", short: "ร้อง 45 น. · เซิฟ 90 น. · ยิม · เทรด · เกม ~5.75 ชม.", color: "var(--green)", base: "off", work: false,
    drop: ["cardio"],
    patch: {
      ...MORNING,
      meal2: { min: at(16, 30), title: "มื้อ 2 ก่อนยิม", sub: "~750 kcal คาร์บ + โปรตีน ไขมันต่ำ" },
      trade: { min: at(19, 15), title: "เทรด: เตรียม 15 · เทรด ไม่เกิน 1 ชม. · จด", sub: "ปฏิทินข่าว + แนวรับต้าน + setup เดียว · 1 ไม้ · ถึง loss limit = หยุด · ไม่มี setup = ไม่เข้า (นับว่าทำ)", dur: 75, session: "ny" },
      meal3: { min: at(20, 45), title: "มื้อเย็นหลังยิม", sub: "~850 kcal", session: "ny" },
      ...LATE,
      snack: { ...LATE.snack, min: at(0, 30), sub: "~450 kcal พักจอ 15 นาที" },
    },
    add: [
      MC_CHECK,
      { id: "sing", min: at(14, 15), dur: 45, title: "ร้องเพลง", sub: "วอร์ม 10-15 · ฝึก 1 เทคนิค + 1 เพลง · คูลดาวน์ 5 · เจ็บ = หยุด", kind: "sing", ring: "habit" },
      { id: "mc", min: at(15), dur: 90, title: "ลุยเซิฟ (เป้าเดียว)", sub: "build/config 1 อย่าง ไม่เข้าเล่น · พัก 15 นาทีหลังจบ", kind: "mc", ring: "habit" },
      GYM, SUPP3,
      game(at(21, 15), "เวลาเกม (หลัก)", "ลุกยืดทุก 60 นาที · 20-20-20 ตอนโหลด · ขวดน้ำบนโต๊ะ · เทสเซิฟกับผู้เล่น 21:30-22:30 นับเป็นเวลาเกม", "ny"),
      { ...CAF, sub: "ช่วยให้หลับลึกตอน 05:00" },
      GAME_STOP, PRESLEEP,
    ],
    cues: OFF_CUES,
    phases: [
      P_MORNING, P_SING, P_BUILD, P_FUEL, P_GYM,
      ph("trade", "trade", "เทรด", "ปฏิทินข่าว · แนวรับต้าน · setup เดียว · 1 ไม้ · จด journal", "var(--blue)"),
      P_DINNER, P_GAME, P_WIND,
    ],
  },
  {
    id: "game-max", name: "เกมจัดเต็ม", short: "เกม ~8 ชม. 2 รอบ · ร้อง 30 น. · ยิม · เช็กกราฟ", color: "var(--purple)", base: "off", work: false,
    drop: ["cardio"],
    patch: {
      ...MORNING,
      meal2: { min: at(16, 30), title: "มื้อ 2 ก่อนยิม", sub: "~750 kcal คาร์บ + โปรตีน ไขมันต่ำ" },
      trade: { min: at(19, 15), title: "เช็กกราฟ 1 ไม้", sub: "ดูแผนก่อนข่าว US 19:30 · ไม่มี setup = ไม่เข้า (นับว่าทำ)", dur: 30, session: "ny" },
      meal3: { min: at(20), title: "มื้อเย็น", sub: "~850 kcal", session: "ny" },
      ...LATE,
      snack: { ...LATE.snack, min: at(0, 15) },
    },
    add: [
      MC_CHECK,
      { id: "sing", min: at(14, 15), dur: 30, title: "ร้องเพลง (สั้น)", sub: "วอร์ม 10 · ฝึก 15 · คูลดาวน์ 5 · ร้องก่อนเล่น เสียงยังสด", kind: "sing", ring: "habit" },
      game1("เกมรอบบ่าย", "ลุกยืดครั้งหนึ่งกลางรอบ"),
      { ...GYM, sub: "ยิมก่อนเกมรอบหลัก" }, SUPP3,
      game(at(20, 30), "เวลาเกม (หลัก)", "ลุกยืดทุก 60 นาที · 20-20-20 ตอนโหลด · ขวดน้ำบนโต๊ะ · คุยไมค์เสียงปกติ", "ny"),
      CAF, GAME_STOP, PRESLEEP,
    ],
    cues: OFF_CUES,
    phases: [
      P_MORNING, P_SING,
      ph("game1", "game1", "เกมรอบบ่าย", "เล่นให้สนุก แล้วไปกินก่อนยิม", "var(--purple)"),
      P_FUEL, P_GYM,
      ph("trade", "trade", "เช็กกราฟ", "ดูแผนก่อนข่าว US · ไม่มี setup = ไม่เข้า", "var(--blue)"),
      P_DINNER, P_GAME, P_WIND,
    ],
  },
  {
    id: "mc-build", name: "วันลุยเซิฟ", short: "เซิฟ 2 รอบ ~3 ชม. · ร้องสั้น · คาร์ดิโอเบา · เล่นกับผู้เล่น ~6 ชม.", color: "var(--teal)", base: "off", work: false,
    patch: {
      ...MORNING,
      trade: { defaultOff: true },
      meal2: { min: at(16, 30), sub: "~750 kcal" },
      cardio: { min: at(17, 30), title: "เทนนิส / คาร์ดิโอเบา / เดิน", sub: "ไม่หนัก (ช่วงเพิ่มน้ำหนัก) · ทากันแดด · บันทึกเป็น R", dur: 60 },
      meal3: { min: at(20, 15), title: "มื้อเย็น", sub: "~850 kcal" },
      ...LATE,
    },
    add: [
      { id: "sing", min: at(14, 15), dur: 30, title: "ร้องเพลง (สั้น)", sub: "วอร์ม + 1 เพลง", kind: "sing", ring: "habit" },
      { id: "mc", min: at(14, 45), dur: 100, title: "ลุยเซิฟ รอบ 1 (2 x 50 นาที)", sub: "10-15 นาทีแรกเช็ก log/backup/อัปเดต · พัก 10 นาทีตรงกลาง", kind: "mc", ring: "habit" },
      { id: "supp3", min: at(18, 40), dur: 10, title: "Whey + กล้วย", kind: "supp", ring: "food" },
      { id: "mc2", min: at(19), dur: 75, title: "ลุยเซิฟ รอบ 2: เตรียมอัปเดตก่อนผู้เล่นเข้า", kind: "mc", ring: "habit" },
      game(at(20, 45), "เล่นกับผู้เล่นในเซิฟ + เกมหลัก", "เทสฟีเจอร์ใหม่ช่วงคนเยอะ · ลุกยืดทุก 60 นาที"),
      CAF, GAME_STOP, PRESLEEP,
    ],
    cues: { supp3: "หลังคาร์ดิโอ", night: "หลังโปรตีนก่อนนอน" },
    phases: [
      P_MORNING, P_SING, P_BUILD,
      ph("fuel", "meal2", "กิน + พัก", "มื้อ 2 ให้อิ่ม พักให้ย่อยก่อนขยับ", "var(--orange)"),
      P_MOVE,
      ph("build2", "mc2", "เตรียมอัปเดต", "ทำอัปเดตให้เสร็จก่อนผู้เล่นเข้า", "var(--teal)"),
      ph("dinner", "meal3", "มื้อเย็น", "กินให้อิ่มก่อนเริ่มเล่นกับผู้เล่น", "var(--pink)"),
      ph("game", "game", "เล่นกับผู้เล่น", "เทสฟีเจอร์ใหม่ช่วงคนเยอะ · ลุกยืดทุก 60 นาที · จิบน้ำ · งดกาแฟหลัง 23:00", "var(--purple)"),
      P_WIND,
    ],
  },
  {
    id: "rest", name: "วันพัก (พักเสียง พักยิม)", short: "ไม่ร้อง ไม่ยกเวท ไม่เทรด · เกม ~8 ชม. · ทบทวนสัปดาห์", color: "var(--orange)", base: "off", work: false,
    patch: {
      ...MORNING,
      meal1: { min: at(13, 20), sub: "~650 kcal" },
      supp1: { min: at(13, 20), sub: "creatine 3-5 g · กินทุกวันรวมวันพัก" },
      trade: { defaultOff: true },
      meal2: { min: at(16, 30), sub: "~750 kcal" },
      cardio: { min: at(17, 30), title: "เดิน / เทนนิส / ยืดเหยียด (เบาๆ)", sub: "ไม่บังคับ · บันทึกเป็น R / R-tennis / R-cardio", dur: 60 },
      meal3: { min: at(20), title: "มื้อเย็น", sub: "~850 kcal" },
      ...LATE,
    },
    add: [
      { id: "mc-check", min: at(14), dur: 10, title: "เช็กเซิฟ 10 นาที", kind: "mc", ring: "habit" },
      { id: "review", min: at(14, 15), dur: 30, title: "ทบทวนสัปดาห์", sub: "journal เทรด 7 วัน · ดูงบเวลา · เลือกแผนสัปดาห์หน้าในแอป", kind: "habit", ring: "habit" },
      game1("เกมรอบบ่าย (ชิล)"),
      { id: "supp3", min: at(18, 40), dur: 10, title: "Whey + ผลไม้", sub: "วันพักยังต้องได้โปรตีน", kind: "supp", ring: "food" },
      game(at(20, 30), "เวลาเกม (หลัก)", "วันพักเสียง: คุยไมค์น้อยๆ เบาๆ · ลุกยืดทุก 60 นาที"),
      CAF, GAME_STOP, PRESLEEP,
    ],
    cues: { supp3: "หลังเดิน/เทนนิส", night: "หลังโปรตีนก่อนนอน" },
    phases: [
      P_MORNING,
      ph("review", "review", "ทบทวนสัปดาห์", "journal เทรด 7 วัน · ดูงบเวลา · เลือกแผนสัปดาห์หน้า", "var(--blue)"),
      ph("game1", "game1", "เกมรอบบ่าย", "เกมชิล เล่นให้สนุก แล้วไปกินมื้อ 2", "var(--purple)"),
      ph("evening", "meal2", "กิน + พัก", "วันพักยังต้องกินครบทุกมื้อ", "var(--orange)"),
      { ...P_MOVE, tip: "เดิน/เทนนิส/ยืดเหยียด เบาๆ ไม่บังคับ ทากันแดด" },
      ph("dinner", "meal3", "มื้อเย็น", "กินให้อิ่มก่อนเริ่มเกม", "var(--pink)"),
      { ...P_GAME, tip: "เล่นเต็มที่ ไม่ต้องรู้สึกผิด · วันพักเสียง คุยไมค์เบาๆ · ลุกยืดทุก 60 นาที · จิบน้ำ" },
      P_WIND,
    ],
  },
  {
    id: "work-plus", name: "ทำงาน + ร้องเพลง + ยิม", short: "ร้องก่อนเข้างาน · ตั้งออเดอร์ไม่ต้องเฝ้า · ยิมหลังเลิกงาน", color: "var(--blue)", base: "work", work: true,
    patch: { persona: { defaultOff: true }, trade: WORK_TRADE },
    add: WORK_ADD,
    cues: { trade: "หลังร้องเพลง" },
  },
  {
    id: "work-game", name: "ทำงาน + เกมหลังเลิกงาน", short: "วันพักยิม · เกม 02:30-03:45 หลังเลิกงาน", color: "var(--pink)", base: "work", work: true,
    drop: ["gym"],
    patch: {
      persona: { defaultOff: true }, trade: WORK_TRADE,
      supp2: { sub: "ระหว่างกะ (วันนี้พักยิม)" },
      supp3: { title: "Whey #3 / นม", sub: "วันพักยิมยังต้องได้โปรตีน" },
      meal2c: { title: "กินข้าวหลังเลิกงาน" },
    },
    add: [
      ...WORK_ADD,
      { id: "game", min: at(2, 30), dur: 75, kind: "game", title: "เวลาเกมหลังเลิกงาน", sub: "เกมแข่งถึง 03:00 แล้วเปลี่ยนเป็นเกมชิล · Whey/นม + มื้อ 3 ก่อนนอน" },
    ],
    cues: { trade: "หลังร้องเพลง", supp3: "หลังเลิกเล่นเกม" },
    phases: [
      ph("prep", "weigh", "ช่วงเตรียมตัว", "กินมื้อใหญ่ ร้องเพลง ตั้งออเดอร์ ให้จบก่อนเข้างาน", "var(--orange)"),
      ph("work1", "work-in", "ทำงาน ช่วงแรก", "จิบน้ำทุกชั่วโมง โฟกัสงาน", "var(--blue)"),
      ph("break", "meal2", "พักกะ", "โปรตีนนำ กินช้าๆ ถ้าไม่ทันกิน whey แทนแล้วเลือกแบบในแอป", "var(--pink)"),
      ph("work2", ["meal2", 60], "ทำงาน ช่วงหลัง", "งดกาแฟหลัง 23:00 ช่วงดึกกินเบาๆ", "var(--blue)"),
      ph("commute", "work-out", "เลิกงาน กลับบ้าน", "วันนี้พักยิม กลับไปพักได้เลย", "var(--green)"),
      ph("game", "game", "เวลาเกม", "เกมแข่งถึง 03:00 แล้วเกมชิล · ลุกยืด · จิบน้ำ", "var(--purple)"),
      ph("winddown", "supp3", "ผ่อนคลายก่อนนอน", "Whey/นม + มื้อ 3 อาบน้ำ ลดแสง journal", "var(--teal)"),
    ],
  },
  {
    id: "stream-gym", name: "ไลฟ์ + ยิม", short: "ไลฟ์ 19:00-00:30 (5.5 ชม.) · ยิม 16:00 · เทรด London 15:00 · ร้อง 25 น.", color: "var(--red)", base: "off", work: false, season: "stream",
    drop: ["cardio"],
    patch: { ...S_CORE, trade: S_TRADE },
    add: [
      { id: "sing", min: at(10, 45), dur: 25, title: "ร้องเพลง (สั้น)", sub: S_SING_SUB, kind: "sing", ring: "habit" },
      clips(at(11, 15), 45, "ตัดคลิป + ตั้งโพสต์", "1-2 คลิปจากไลฟ์เมื่อคืน · TikTok/Reels/Shorts โพสต์ 12:30 และ 18:00"),
      { ...MC_CHECK, min: at(12, 15) },
      snack2(at(15, 40), "ของว่างก่อนยิม + กาแฟแก้วสุดท้าย", "กล้วย + ขนมปัง/โอ๊ต ~250 kcal"),
      { ...GYM, min: at(16), dur: 75, sub: "หมุน D1-D4 · วอร์มอัพ 5 นาที · จดน้ำหนัก · เล่นใกล้หมดแรง 1-3 ครั้ง" },
      { ...SUPP3, min: at(17, 20) },
      S_CAF,
      prep(at(18, 30), 25, "เตรียมไลฟ์ + วอร์มเสียง", SP_PREP.tip),
      live(at(19), "ไลฟ์", LIVE_SUB),
      S_END, S_PRESLEEP,
    ],
    cues: { ...S_CUES, clips: "หลังร้องเพลง", snack2: "หลังเทรด" },
    phases: [
      SP_MORNING, SP_SING, SP_CLIPS, SP_MID, SP_TRADE, P_GYM,
      ph("fuel", "supp3", "ฟื้นตัว + มื้อเย็น", "whey หลังยิม · อาบน้ำ · มื้อเย็นเสร็จก่อนไลฟ์ 1 ชม. · งดกาแฟหลัง {caf}", "var(--pink)"),
      SP_PREP, SP_LIVE, SP_WIND,
    ],
  },
  {
    id: "stream-mc", name: "ไลฟ์ + เซิฟ MC", short: "ไลฟ์ 19:00-00:30 (5.5 ชม.) · เซิฟ 90 น. · คาร์ดิโอเบา · เทรด London", color: "var(--teal)", base: "off", work: false, season: "stream",
    patch: {
      ...S_CORE, trade: S_TRADE,
      meal2: { min: at(12, 45), sub: "~750 kcal" },
      cardio: { min: at(16, 15), dur: 45, title: "เทนนิส / คาร์ดิโอเบา / เดิน", sub: "ไม่หนัก (ช่วงเพิ่มน้ำหนัก) · ทากันแดด · บันทึกเป็น R" },
    },
    add: [
      { id: "sing", min: at(10, 30), dur: 25, title: "ร้องเพลง (สั้น)", sub: S_SING_SUB, kind: "sing", ring: "habit" },
      { id: "mc", min: at(11), dur: 90, title: "ลุยเซิฟ (เป้าเดียว)", sub: "10-15 นาทีแรกเช็ก log/backup · ลุกยืนทุก 30-60 นาที · เตรียมของที่จะโชว์ในไลฟ์คืนนี้", kind: "mc", ring: "habit" },
      clips(at(13, 30), 45, "ตัดคลิป + ตั้งโพสต์", "1-2 คลิปจากไลฟ์เมื่อคืน · TikTok/Reels/Shorts โพสต์ 18:00"),
      snack2(at(15, 45), "ของว่างบ่าย + กาแฟแก้วสุดท้าย", "~250 kcal"),
      { ...SUPP3, min: at(17, 10), title: "Whey + ผลไม้", sub: "~250 kcal + น้ำ 500 ml" },
      S_CAF,
      prep(at(18, 30), 25, "เตรียมไลฟ์ + วอร์มเสียง", SP_PREP.tip),
      live(at(19), "ไลฟ์ (เซิฟ MC ได้)", "คืนนี้ลองไลฟ์ build/เทสกับผู้เล่น = คอนเทนต์ + โปรโมตเซิฟ · พักเงียบ 5 นาทีทุกชั่วโมง"),
      S_END, S_PRESLEEP,
    ],
    cues: { ...S_CUES, clips: "หลังมื้อ 2", supp3: "หลังคาร์ดิโอ" },
    phases: [
      SP_MORNING, SP_SING,
      ph("build", "mc", "ลุยเซิฟ", "เช็ก log/backup แล้วทำเป้าเดียว · เก็บของไว้โชว์ในไลฟ์", "var(--teal)"),
      SP_MID, SP_CLIPS, SP_TRADE,
      ph("move", "cardio", "ขยับเบาๆ", "เทนนิส/คาร์ดิโอเบา/เดิน ไม่หนัก ทากันแดด", "var(--green)"),
      ph("fuel", "supp3", "พัก + มื้อเย็น", "whey/ผลไม้ · อาบน้ำ · มื้อเย็นเสร็จก่อนไลฟ์ 1 ชม. · งดกาแฟหลัง {caf}", "var(--pink)"),
      SP_PREP, { ...SP_LIVE, label: "ไลฟ์ (เซิฟ MC ได้)" }, SP_WIND,
    ],
  },
  {
    id: "stream-marathon", name: "ไลฟ์มาราธอน", short: "ไลฟ์ยาว 15:00-00:30 (9.5 ชม.) · ไม่ยก ไม่เทรด · วอร์มเสียงอย่างเดียว", color: "var(--purple)", base: "off", work: false, season: "stream",
    drop: ["cardio"],
    patch: {
      ...S_CORE,
      trade: { defaultOff: true }, // FX is closed on Saturday
      weigh: { ...S_CORE.weigh, sub: "ก่อนกิน หลังเข้าห้องน้ำ · น้ำ 400 ml · เดินรับแสง 15-20 นาที" },
      meal1: { min: at(10), sub: "~750 kcal มื้อใหญ่ โปรตีน 35-40 g" },
      meal2: { min: at(12, 30), sub: "~800 kcal" },
      meal3: { min: at(17, 45), title: "BRB 30 นาที: มื้อเย็นนอกกล้อง", sub: "~800 kcal · กลับมาไลฟ์ {meal3+30} · เดินสั้นๆ · เติมน้ำ" },
      snack: { ...S_CORE.snack, title: "shake กลางไลฟ์ (BRB)" },
    },
    add: [
      clips(at(10, 45), 60, "ตัดคลิป + โพสต์ประกาศมาราธอน", "1-2 คลิป · โพสต์ 'ไลฟ์ยาว {stream}-{stream-end}' · ทำปก/ชื่อไลฟ์ไว้เลย"),
      { ...MC_CHECK, min: at(12) },
      prep(at(14, 15), 30, "เตรียมไลฟ์ยาว + วอร์มเสียง", "ขวดน้ำ 2 ลิตร · เตรียมของว่าง · วอร์มเสียง 10 นาที (วันนี้ไม่ฝึกร้อง) · กาแฟแก้วสุดท้ายก่อน {caf}"),
      live(at(15), "ไลฟ์มาราธอน", "พักเงียบ 5 นาทีทุกชั่วโมง · ลุกยืนทุก 30 นาที · BRB มื้อเย็น {meal3}-{meal3+30} · ปิด {stream-end} แม้แชตยังคึก"),
      snack2(at(16, 15), "ของว่างในไลฟ์ (ปิดไมค์)", "~300 kcal โยเกิร์ต / กล้วย / ขนมปังเนยถั่ว"),
      S_CAF, S_END, S_PRESLEEP,
    ],
    cues: { ...S_CUES, clips: "หลังมื้อแรก", "stream-prep": "หลังมื้อ 2 + พัก" },
    phases: [
      SP_MORNING,
      { ...SP_CLIPS, tip: "1-2 คลิป · โพสต์ประกาศ 'ไลฟ์ยาว {stream}-{stream-end}' · ทำปกไว้เลย" },
      ph("midday", "meal2", "กิน + พักก่อนไลฟ์ยาว", "งีบได้ไม่เกิน 20 นาที เสร็จก่อน 14:00 · เตรียมของว่าง + น้ำ 2 ลิตร", "var(--orange)"),
      SP_PREP, { ...SP_LIVE, label: "ไลฟ์มาราธอน" },
      ph("brb", "meal3", "BRB มื้อเย็น", "นอกกล้อง 30 นาที · กินให้อิ่ม · เดินสั้นๆ · เติมน้ำ", "var(--pink)"),
      ph("stream2", ["meal3", 30], "ไลฟ์ช่วงค่ำ (คนดูเยอะ)", "พลังงานเต็ม ตอบแชต · พักเงียบ 5 นาทีทุกชั่วโมง · ชั่วโมงสุดท้ายหรี่ไฟหน้า", "var(--red)"),
      SP_WIND,
    ],
  },
  {
    id: "stream-rest", name: "ไลฟ์ชิล + พักฟื้น", short: "ไลฟ์ชิล 19:00-00:30 (5.5 ชม.) · เช้าพักเสียง · ไม่ยก ไม่เทรด · ทบทวนสัปดาห์", color: "var(--orange)", base: "off", work: false, season: "stream",
    patch: {
      ...S_CORE,
      trade: { defaultOff: true },
      supp1: { ...S_CORE.supp1, sub: "ทุกวันรวมวันพัก" },
      meal2: { min: at(12), sub: "~750 kcal" },
      cardio: { min: at(10, 45), dur: 45, title: "เดิน / เทนนิสเบาๆ (ไม่บังคับ)", sub: "เช้าพักเสียง: คุยน้อย ไม่ร้อง · บันทึกเป็น R / R-tennis" },
    },
    add: [
      { ...MC_CHECK, min: at(12, 45) },
      { id: "review", min: at(13), dur: 45, title: "ทบทวนสัปดาห์ + ตารางไลฟ์", sub: "สถิติไลฟ์ (คนดูสูงสุด/เฉลี่ย ผู้ติดตามใหม่ คลิปไหนพาคนมา) · น้ำหนัก · การนอน · โพสต์ตารางสัปดาห์หน้า + ตั้งไลฟ์ YouTube ล่วงหน้า", kind: "habit", ring: "habit" },
      clips(at(14), 90, "ตัดคลิปล่วงหน้า 3-4 คลิป", "ตั้งโพสต์ทั้งสัปดาห์ · เตรียมอาหาร"),
      { ...SUPP3, min: at(16), title: "Whey + ผลไม้", sub: "~350 kcal · วันพักยังต้องได้โปรตีน" },
      S_CAF,
      prep(at(18, 30), 20, "เตรียมไลฟ์ + วอร์มเสียงเบาๆ", "ตั้งชื่อ/ปก · โพสต์ 'ไลฟ์ {stream}' · วอร์มเสียงเบาๆ 5 นาที"),
      live(at(19), "ไลฟ์ชิล", "เกมชิล/เล่นกับคนดู · พูดเบาๆ ไม่ตะโกน · พักเงียบ 5 นาทีทุกชั่วโมง"),
      S_END, S_PRESLEEP,
    ],
    cues: { ...S_CUES, clips: "หลังทบทวนสัปดาห์", supp3: "หลังตัดคลิป" },
    phases: [
      SP_MORNING,
      ph("move", "cardio", "ขยับเบาๆ + พักเสียง", "เดิน/เทนนิสเบาๆ ไม่บังคับ · คุยน้อย ไม่ร้อง", "var(--green)"),
      SP_MID,
      ph("review", "review", "ทบทวนสัปดาห์", "ดูสถิติไลฟ์ 30-45 นาที · ตั้งตารางสัปดาห์หน้า", "var(--blue)"),
      ph("clips", "clips", "ตัดคลิปล่วงหน้า", "3-4 คลิป ตั้งโพสต์ทั้งสัปดาห์", "var(--red)"),
      ph("rest", "supp3", "พักก่อนไลฟ์", "ไม่งีบหลัง 15:00 · กาแฟแก้วสุดท้ายก่อน {caf} · มื้อเย็น {meal3}", "var(--pink)"),
      SP_PREP, { ...SP_LIVE, label: "ไลฟ์ชิล" }, SP_WIND,
    ],
  },
  { id: "work", name: "วันทำงาน (แบบเดิม)", short: "กะดึก 16:00-02:00 ยิมหลังเลิกงาน ตามตารางเดิม", color: "var(--label2)", base: "work", work: true, legacy: true },
  { id: "off", name: "วันหยุด (แบบเดิม)", short: "ตารางวันหยุดเดิม เทนนิส/คาร์ดิโอ", color: "var(--label2)", base: "off", work: false, legacy: true },
];

export const TEMPLATE_BY_ID: ReadonlyMap<string, TemplateDef> = new Map(TEMPLATES.map((t) => [t.id, t]));
export const BUILTIN_IDS: ReadonlySet<string> = new Set(TEMPLATES.map((t) => t.id));

export const WEEK_PRESETS: { id: string; name: string; note: string; days: string[] }[] = [
  { id: "job", name: "ยังทำงานกะดึก (หยุด ส-อา)", note: "จ-ศ ทำงาน · พุธพักยิมเล่นเกม · เสาร์ลุยเซิฟ · อาทิตย์พัก", days: ["rest", "work-plus", "work-plus", "work-game", "work-plus", "work-plus", "mc-build"] },
  { id: "nojob", name: "ไม่มีงานประจำ (สมดุล)", note: "ยก 4 วัน เทรด 4 วัน ร้อง 6 วัน เกม ~48 ชม.", days: ["rest", "balanced", "game-max", "mc-build", "balanced", "game-max", "mc-build"] },
  { id: "gamer", name: "ช่วงเกมจัดเต็ม", note: "เกมเป็นหลัก ~52 ชม. ยังยก 4 วัน พักเสียง 2 วัน", days: ["rest", "game-max", "balanced", "rest", "game-max", "game-max", "mc-build"] },
  { id: "stream", name: "ช่วงไลฟ์ยาวก่อนเปิดเทอม", note: "ไลฟ์ทุกวัน ~42.5 ชม. (19:00-00:30 · เสาร์ 15:00-00:30) · ยก 4 วัน · เทรด London 5 วัน · นอน 01:30",
    days: ["stream-rest", "stream-gym", "stream-gym", "stream-mc", "stream-gym", "stream-gym", "stream-marathon"] },
];

// job=true: build from the user's off weekdays. Off days in Sunday-first order get rest, then mc-build, then game-max.
// Work days get work-plus; with 5+ work days the 3rd work day gets work-game. Empty offWeekdays -> WEEK_PRESETS[0].
export function introPreset(offWeekdays: number[], job: boolean): string[] {
  if (!job) return [...WEEK_PRESETS[1].days];
  if (!offWeekdays.length) return [...WEEK_PRESETS[0].days];
  const workDays = 7 - offWeekdays.length; let off = 0, work = 0;
  return Array.from({ length: 7 }, (_, dow) => offWeekdays.includes(dow)
    ? (["rest", "mc-build"][off++] ?? "game-max")
    : (++work === 3 && workDays >= 5 ? "work-game" : "work-plus"));
}

// Self-care presets: slot routines, pack steps, levels, periodic tasks, health checks and the step library (pure data).
// General wellness wording only: no brands, no drug strengths; pharmacy-only items say "ตามที่เภสัชกรแนะนำ".
import type { Check, Level, Routine, Step, Tag } from "./types";

export type SlotId = "am" | "gym" | "prep" | "pm";
export const SLOTS: { id: SlotId; name: string; anchor: Routine["anchor"] }[] = [
  { id: "am", name: "เช้า", anchor: { item: ["weigh"], off: 10 } },
  { id: "gym", name: "หลังยิม", anchor: { item: ["gym", "cardio"], off: 5, end: true } },
  { id: "prep", name: "ก่อนไลฟ์", anchor: { host: "stream-prep" } },
  { id: "pm", name: "ก่อนนอน", anchor: { host: "night" } },
];
// A fresh slot routine: off and empty until a level or pack adds steps. Reminders default off (host rows keep their own).
export const slotRoutine = (id: SlotId): Routine => {
  const s = SLOTS.find((x) => x.id === id)!;
  return { id, name: s.name, anchor: structuredClone(s.anchor), remind: false, on: false, steps: [] };
};

export const LEVEL_RANK: Record<Level, number> = { lite: 0, std: 1, full: 2 };
export const LEVEL_LABEL: Record<Level, string> = { lite: "เบา", std: "มาตรฐาน", full: "ครบ" };
export const LEVEL_SUMMARY: Record<Level, string> = {
  lite: "กันแดด แปรงฟัน อาบน้ำล้างหน้าก่อนนอน",
  std: "เพิ่มผิวหน้า ไหมขัดฟัน ก่อนไลฟ์ หลังยิม ผ่อนคลายก่อนนอน งานประจำสัปดาห์",
  full: "เพิ่มโลชั่น ยาระงับเหงื่อ ยืดเหยียด หายใจ และงานรายเดือน",
};

// A pack step: lvl = lowest level that turns it on; req = levels where it is required (omitted = required at every level;
// [] = always optional). Steps of opt-in packs ignore lvl.
export type PackStep = { slot: SlotId; step: Step; lvl: Level; req?: Level[] };
const ALL: Level[] = ["lite", "std", "full"];
const ps = (slot: SlotId, step: Step, lvl: Level, req?: Level[]): PackStep => ({ slot, step, lvl, ...(req ? { req } : {}) });
const OPT: Level[] = [];

const PREP_SET: Step = { id: "set", title: "ตั้งชื่อไลฟ์ + ปก", tag: "mind", pack: "prep" };
const PREP_POST: Step = { id: "post", title: "โพสต์ประกาศไลฟ์ (ตั้งเวลาไว้ได้)", tag: "mind", pack: "prep" };
const PREP_WARM: Step = { id: "warm", title: "วอร์มเสียง 10 นาที", tag: "voice", min: 10, hint: "lip trill · ฮัม · ไซเรนเบาๆ", pack: "prep" };
const PREP_BT: Step = { id: "bt", title: "ขวดน้ำ 1 ลิตรบนโต๊ะ", tag: "water", pack: "prep" };

// Preset order per slot = the order steps appear in a routine.
export const PACK_STEPS: PackStep[] = [
  ps("am", { id: "cl", title: "ล้างหน้า น้ำเปล่า/โฟมอ่อนโยน", tag: "face", min: 2, pack: "face-am" }, "std", ["std", "full"]),
  ps("am", { id: "nia", title: "ไนอะซินาไมด์ ก่อนมอยส์", tag: "face", pack: "acne" }, "lite", OPT),
  ps("am", { id: "mo", title: "มอยส์บางเบา ทาตอนหน้ายังชื้น", tag: "face", pack: "face-am" }, "std", OPT),
  ps("am", { id: "spf", title: "กันแดด SPF 30+ PA+++", tag: "face", hint: "2 ข้อนิ้ว หน้า+คอ · ก่อนออกแดด 15 นาที", pack: "face-am" }, "lite", ALL),
  ps("am", { id: "lip", title: "ลิปบาล์ม SPF 30", tag: "oral", pack: "face-am" }, "std", OPT),
  ps("am", { id: "deo", title: "ระงับกลิ่นกาย", tag: "body", pack: "face-am" }, "full", OPT),
  ps("am", { id: "br", title: "แปรงฟัน 2 นาที ยาสีฟันฟลูออไรด์", tag: "oral", min: 2, hint: "บ้วนน้ำลายทิ้ง ไม่ต้องบ้วนน้ำตาม", pack: "teeth" }, "lite", ALL),

  ps("gym", { id: "sh", title: "อาบน้ำ + ล้างหน้า ภายในราว 1 ชม.", tag: "body", hint: "อาบไม่ได้: เช็ดตัว ล้างหน้า", pack: "gym" }, "std"),
  ps("gym", { id: "dry", title: "เปลี่ยนเสื้อ/ถุงเท้า เช็ดเท้า ซอกนิ้ว ขาหนีบให้แห้ง", tag: "body", pack: "gym" }, "std"),
  ps("gym", { id: "bpw", title: "เจลอาบน้ำสำหรับสิวที่หลัง-อก ทิ้ง 2 นาที (ตามที่เภสัชกรแนะนำ)", tag: "body", cad: "w:1,3,5", irr: "bp", hint: "ใช้ผ้าขนหนูสีขาว (บางสูตรทำผ้าด่าง)", pack: "acne" }, "lite", OPT),
  ps("gym", { id: "ld", title: "เสื้อยิมลงตะกร้า ไม่ใส่ซ้ำ", tag: "body", pack: "gym" }, "std", OPT),
  ps("gym", { id: "el", title: "เกลือแร่", tag: "water", cad: "h", hint: "วันร้อน หรือออกกำลังเกิน 60 นาที · ยกเวท 60-75 นาทีน้ำเปล่าพอ", pack: "gym" }, "std", OPT),

  ps("prep", PREP_SET, "std"),
  ps("prep", PREP_POST, "std"),
  ps("prep", PREP_WARM, "std"),
  ps("prep", PREP_BT, "std"),
  ps("prep", { id: "vol", title: "หูฟังไม่เกิน 60%", tag: "eye", pack: "prep" }, "std", OPT),
  ps("prep", { id: "lt", title: "เปิดไฟห้อง · จอห่าง 50-70 ซม. ต่ำกว่าตาเล็กน้อย", tag: "eye", pack: "prep" }, "std", OPT),

  ps("pm", { id: "dim", title: "หรี่ไฟ · ปิดแชต/โซเชียล · มือถือไกลเตียง", tag: "mind", pack: "wind" }, "std", OPT),
  ps("pm", { id: "sh", title: "อาบน้ำ", tag: "body", pack: "face-pm" }, "lite"),
  ps("pm", { id: "cl", title: "ล้างหน้า", tag: "face", hint: "ทากันแดดกันน้ำ = ล้าง 2 รอบ", pack: "face-pm" }, "lite"),
  ps("pm", { id: "ret", title: "เรตินอยด์ (ถ้าเภสัชกร/แพทย์แนะนำ) ปริมาณเม็ดถั่ว ทาตอนหน้าแห้ง", tag: "face", cad: "r@2026-01-01", irr: "ret", hint: "ทากันแดดทุกเช้า · เริ่มช้าๆ", pack: "acne" }, "lite", OPT),
  ps("pm", { id: "bha", title: "BHA/ซาลิไซลิก (สิวอุดตัน)", tag: "face", cad: "w:2,6", irr: "bha", pack: "acne" }, "lite", OPT),
  ps("pm", { id: "mo", title: "มอยส์เจอไรเซอร์", tag: "face", pack: "face-pm" }, "std"),
  ps("pm", { id: "lip", title: "ลิปบาล์ม/วาสลีน", tag: "oral", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "ap", title: "ยาระงับเหงื่อ ทาตอนผิวแห้งสนิท", tag: "body", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "bl", title: "โลชั่นตัว ทาตอนผิวยังชื้น", tag: "body", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "br", title: "แปรงฟัน 2 นาที", tag: "oral", min: 2, pack: "teeth" }, "lite"),
  ps("pm", { id: "fl", title: "ไหมขัดฟัน/แปรงซอกฟัน", tag: "oral", pack: "teeth" }, "std", OPT),
  ps("pm", { id: "desk", title: "ยืดเหยียด 5 นาที (คอ อก สะโพก ข้อมือ)", tag: "move", min: 5, pack: "wind" }, "full", OPT),
  ps("pm", { id: "brth", title: "หายใจผ่อนคลาย 3 นาที", tag: "mind", min: 3, hint: "สูดจมูก 2 ครั้ง แล้วผ่อนลมทางปากยาวๆ", pack: "wind" }, "full", OPT),
  ps("pm", { id: "jr", title: "Journal 1 บรรทัด + พรุ่งนี้ 3 อย่าง", tag: "mind", act: "journal", pack: "wind" }, "std", OPT),
];

// Pre-live checklist (Live mode): the same step objects as the prep pack, all required. Ticks live in DayLog.care.prep.
export const PRELIVE: Step[] = [PREP_SET, PREP_POST, PREP_WARM, PREP_BT];

export const PACKS: { id: string; name: string; desc: string; optIn?: true }[] = [
  { id: "face-am", name: "ผิวหน้าเช้า", desc: "ล้างหน้า มอยส์ กันแดด ลิป" },
  { id: "teeth", name: "ดูแลฟัน", desc: "แปรงฟันเช้า-ก่อนนอน ไหมขัดฟัน เปลี่ยนแปรงทุก 3 เดือน" },
  { id: "prep", name: "ก่อนไลฟ์ (ตา หู เสียง)", desc: "ชื่อไลฟ์ โพสต์ วอร์มเสียง ขวดน้ำ ระดับเสียงหูฟัง ไฟห้อง" },
  { id: "gym", name: "หลังยิม", desc: "อาบน้ำ เปลี่ยนเสื้อ เช็ดให้แห้ง เกลือแร่วันร้อน" },
  { id: "wind", name: "ผ่อนคลายก่อนนอน", desc: "หรี่ไฟ journal ยืดเหยียด หายใจ" },
  { id: "face-pm", name: "ผิวก่อนนอน", desc: "อาบน้ำ ล้างหน้า มอยส์ โลชั่น" },
  { id: "acne", name: "สิว/ผิวมัน (สลับคืน)", desc: "ไนอะซินาไมด์ เจลอาบน้ำ เรตินอยด์ BHA เริ่มช้าๆ", optIn: true },
  { id: "week", name: "ร่างกายประจำสัปดาห์", desc: "เล็บ ปลอกหมอน ฟองหูฟัง ผ้าปู" },
  { id: "extra", name: "งานรายเดือน", desc: "ผ้าเช็ดตัว คีย์บอร์ด ส่องไฝ ใบมีดโกน" },
  { id: "humid", name: "อากาศร้อนชื้น", desc: "ฟอกตัวกันเกลื้อน แชมพูขจัดรังแค", optIn: true },
];
export const LEVEL_PACKS: Record<Level, string[]> = {
  lite: ["face-am", "teeth", "face-pm"],
  std: ["face-am", "teeth", "face-pm", "prep", "gym", "wind", "week"],
  full: ["face-am", "teeth", "face-pm", "prep", "gym", "wind", "week", "extra"],
};
export const OPT_IN_PACKS = ["acne", "humid"];

export type TaskPreset = { id: string; title: string; tag: Tag; every: number; pack: string; lvl: Level; hint?: string; off?: true /* created off */ };
export const TASK_PRESETS: TaskPreset[] = [
  { id: "nailh", title: "ตัดเล็บมือหลังอาบน้ำ ตัดตรงแล้วมนปลาย", tag: "body", every: 7, pack: "week", lvl: "std" },
  { id: "nailf", title: "ตัดเล็บเท้า ตัดตรง กันเล็บขบ", tag: "body", every: 21, pack: "week", lvl: "std" },
  { id: "pillow", title: "เปลี่ยนปลอกหมอน", tag: "face", every: 7, pack: "week", lvl: "std" },
  { id: "pads", title: "เช็ดฟองหูฟังและที่ครอบหู", tag: "eye", every: 7, pack: "week", lvl: "std" },
  { id: "sheet", title: "เปลี่ยนผ้าปูที่นอน", tag: "body", every: 14, pack: "week", lvl: "std" },
  { id: "brush", title: "เปลี่ยนแปรงสีฟัน", tag: "oral", every: 90, pack: "teeth", lvl: "std" },
  { id: "towel", title: "ซักผ้าเช็ดตัว (อากาศชื้น)", tag: "body", every: 4, pack: "extra", lvl: "full" },
  { id: "keys", title: "ทำความสะอาดคีย์บอร์ด เมาส์ มือถือ", tag: "body", every: 30, pack: "extra", lvl: "full" },
  { id: "mole", title: "ส่องไฝแบบ ABCDE 3 นาที หลังอาบน้ำ", tag: "body", every: 30, pack: "extra", lvl: "full" },
  { id: "blade", title: "เปลี่ยนใบมีดโกน", tag: "hair", every: 14, pack: "extra", lvl: "full" },
  { id: "hair", title: "ถ่ายรูปไรผม มุมเดิม แสงเดิม เก็บในอัลบั้ม", tag: "hair", every: 90, pack: "extra", lvl: "full", off: true },
  { id: "keto", title: "ฟอกตัวด้วยแชมพูขจัดเชื้อรา ทิ้ง 5 นาที (ตามที่เภสัชกรแนะนำ)", tag: "body", every: 21, pack: "humid", lvl: "lite", hint: "กันเกลื้อนช่วงร้อนชื้น" },
  { id: "dand", title: "แชมพูขจัดรังแค ทิ้ง 5 นาที", tag: "hair", every: 3, pack: "humid", lvl: "lite", off: true },
];

// Created on the first level choice. everyM 0 = only when there are symptoms.
export const CHECK_DEFAULTS: Check[] = [
  { id: "annual", name: "ตรวจสุขภาพประจำปี", everyM: 12, note: "ช่วงเปิดเทอม พ.ย. 2026 (ตรวจนักศึกษา หรือสิทธิ์ตรวจฟรี)" },
  { id: "bp", name: "วัดความดัน", everyM: 12 },
  { id: "dent", name: "ทำฟัน/ขูดหินปูน", everyM: 6 },
  { id: "lab", name: "ตรวจเลือด: ไขมัน น้ำตาล การทำงานไต", everyM: 12, note: "บอกหมอว่ากิน creatine (ค่า creatinine อาจสูงได้)" },
  { id: "vitd", name: "วิตามินดี 25(OH)D", everyM: 0 },
  { id: "eye", name: "ตรวจตา", everyM: 24 },
  { id: "ear", name: "ตรวจการได้ยิน", everyM: 0 },
];

export const TAG_LABEL: Record<Tag, string> = { face: "หน้า", body: "ตัว", oral: "ปาก", hair: "ผม", eye: "ตา/หู", voice: "เสียง", move: "ขยับ", mind: "ใจ", water: "น้ำ/อาหาร" };

// Steps the editor can add (grouped by tag in the UI). Ids are library ids; the editor makes them unique per routine.
export const STEP_LIBRARY: Pick<Step, "id" | "title" | "tag" | "hint" | "irr">[] = [
  { id: "fcl", title: "ล้างหน้า", tag: "face" },
  { id: "fcl2", title: "ล้างหน้า 2 รอบ", tag: "face", hint: "รอบแรกล้างกันแดด รอบสองล้างหน้า" },
  { id: "fmo", title: "มอยส์", tag: "face" },
  { id: "fspf", title: "กันแดด", tag: "face", hint: "2 ข้อนิ้ว หน้า+คอ" },
  { id: "fnia", title: "ไนอะซินาไมด์", tag: "face" },
  { id: "fret", title: "เรตินอยด์ (ตามคำแนะนำ)", tag: "face", irr: "ret", hint: "ทากันแดดทุกเช้า" },
  { id: "fbha", title: "BHA", tag: "face", irr: "bha" },
  { id: "fspot", title: "ยาแต้มสิว", tag: "face" },
  { id: "fsw", title: "ล้างหน้าหลังเหงื่อ", tag: "face" },
  { id: "fpick", title: "ไม่แกะสิววันนี้", tag: "face" },
  { id: "bsh", title: "อาบน้ำ", tag: "body" },
  { id: "bdry", title: "เช็ดแห้ง", tag: "body", hint: "ซอกนิ้วเท้า ขาหนีบ" },
  { id: "bchg", title: "เปลี่ยนเสื้อ/ถุงเท้า", tag: "body" },
  { id: "bbpw", title: "เจลอาบน้ำสำหรับสิว", tag: "body", irr: "bp", hint: "ตามที่เภสัชกรแนะนำ" },
  { id: "blot", title: "โลชั่น", tag: "body" },
  { id: "bap", title: "ยาระงับเหงื่อ", tag: "body" },
  { id: "bdeo", title: "ระงับกลิ่น", tag: "body" },
  { id: "bspf", title: "ทากันแดดซ้ำ", tag: "body", hint: "ทุก 2 ชม. ตอนอยู่กลางแจ้ง" },
  { id: "obr", title: "แปรงฟัน", tag: "oral" },
  { id: "ofl", title: "ไหมขัดฟัน", tag: "oral" },
  { id: "orin", title: "บ้วนน้ำหลังเชคหวาน", tag: "oral" },
  { id: "olip", title: "ลิป SPF", tag: "oral" },
  { id: "ovas", title: "วาสลีน", tag: "oral" },
  { id: "hwash", title: "สระผม", tag: "hair" },
  { id: "hdand", title: "แชมพูขจัดรังแค", tag: "hair", hint: "ทิ้ง 5 นาที" },
  { id: "hscal", title: "ล้างหนังศีรษะหลังยิม", tag: "hair" },
  { id: "hshav", title: "โกนตามแนวขน + มอยส์", tag: "hair" },
  { id: "ebt", title: "ขวดน้ำ", tag: "water" },
  { id: "evol", title: "หูฟังไม่เกิน 60%", tag: "eye" },
  { id: "elt", title: "ไฟห้อง", tag: "eye" },
  { id: "ebrb", title: "พัก BRB", tag: "eye" },
  { id: "vsip", title: "จิบน้ำ + ลิปหลังร้อง", tag: "voice" },
  { id: "vrest", title: "พักเสียงเงียบ 5 นาที", tag: "voice" },
  { id: "mstr", title: "ยืด 5 นาที", tag: "move" },
  { id: "mwalk", title: "เดินหลังมื้อ 10 นาที", tag: "move" },
  { id: "msun", title: "แดดเช้า 10 นาที", tag: "move" },
  { id: "ndim", title: "หรี่ไฟ/ปิดจอ", tag: "mind" },
  { id: "nchat", title: "ปิดแชตหลังไลฟ์", tag: "mind" },
  { id: "nbr", title: "หายใจ 3 นาที", tag: "mind" },
  { id: "njr", title: "journal", tag: "mind" },
  { id: "n3", title: "พรุ่งนี้ 3 อย่าง", tag: "mind" },
  { id: "nview", title: "ดูยอดวิววันละครั้ง", tag: "mind" },
  { id: "ntalk", title: "คุยกับคนจริง", tag: "mind" },
  { id: "wel", title: "เกลือแร่", tag: "water", hint: "วันร้อน หรือออกกำลังเกิน 60 นาที" },
  { id: "wban", title: "กล้วย/โอ๊ตในเชค", tag: "water" },
  { id: "wveg", title: "ผัก 1 ส่วน", tag: "water" },
];

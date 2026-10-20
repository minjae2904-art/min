// Thai copy for the brain (pure). Invitational tone: "ลอง...ไหม", "ถ้า...แล้ว...". No emoji.
// Canonical labels (static tables, built-in template names) are what the AI context may see; user titles never.
import type { ScheduleCfg } from "../model";
import { microStep } from "../psych";
import { resolveTemplate, type Item } from "../schedule";
import { TEMPLATE_BY_ID } from "../templates";
import type { AreaKey, ConflictId, MicroStepId, PatternId, RuleId, TipId } from "./types";

export const AREA_LABEL: Record<AreaKey, string> = {
  sleep: "การนอน", nutrition: "กิน + น้ำหนัก", training: "ยิม", voice: "ร้องเพลง", trading: "วินัยเทรด",
  projects: "เซิร์ฟ MC", leisure: "เกม/พักผ่อน", recovery: "ฟื้นตัว/อารมณ์", consistency: "ความสม่ำเสมอ",
};
export const STATUS = { good: "ดี", ok: "พอใช้", low: "ควรดูแล", thin: "ข้อมูลน้อย" } as const;
export const statusLabel = (score: number | null, conf: number) =>
  score === null || conf < 0.4 ? STATUS.thin : score >= 75 ? STATUS.good : score >= 50 ? STATUS.ok : STATUS.low;

// Static canonical label for every built-in item id (never the user's override title).
export const ITEM_LABEL: Record<string, string> = {
  weigh: "ตื่น + ชั่งน้ำหนัก", posture: "ท่าทาง (chin tuck)", meal1: "มื้อหลัก 1", supp1: "Whey #1 + Creatine", persona: "ฝึกบุคลิกภาพ",
  trade: "เทรด", snack: "ของว่าง", "snack-b": "ของว่างชดเชย", meal2: "มื้อหลัก 2", meal2c: "กินข้าวก่อนยิม", supp2: "Whey #2",
  gym: "เข้ายิม", supp3: "Whey หลังยิม", meal3: "มื้อหลัก 3", night: "Skincare + Journal", sleep: "นอน", cardio: "คาร์ดิโอ/เทนนิส",
  "mc-check": "เช็กเซิฟ", mc: "ลุยเซิฟ", mc2: "ลุยเซิฟ รอบ 2", sing: "ร้องเพลง", review: "ทบทวนสัปดาห์", presleep: "โปรตีนก่อนนอน",
  game: "เวลาเกม", game1: "เกมรอบบ่าย", "game-stop": "หยุดเกมแข่ง", caf: "งดกาแฟ", "work-in": "เข้างาน", "work-out": "เลิกงาน",
};
export const CUSTOM_LABEL = "รายการที่เพิ่มเอง";

type LabelOpt = { canonical?: boolean };
// canonical: built-in name, or the built-in it was copied from + " (สำเนา #n)". Otherwise the user's own name.
export function templateLabel(cfg: ScheduleCfg | undefined, id: string, opt: LabelOpt = {}): string {
  const b = TEMPLATE_BY_ID.get(id);
  if (b) return b.name;
  const list = cfg?.templates ?? [];
  const i = list.findIndex((t) => t.id === id);
  const from = i >= 0 ? TEMPLATE_BY_ID.get(list[i].from) : undefined;
  if (from) return opt.canonical ? `${from.name} (สำเนา #${i + 1})` : list[i].name;
  return TEMPLATE_BY_ID.get("off")!.name;
}
export function itemLabel(cfg: ScheduleCfg | undefined, tpl: string, id: string, opt: LabelOpt = {}): string {
  const custom = cfg?.custom.find((c) => c.id === id);
  if (opt.canonical) return custom ? CUSTOM_LABEL : ITEM_LABEL[id] ?? "รายการ";
  const title = cfg?.overrides[`${resolveTemplate(cfg, tpl).key}:${id}`]?.title || custom?.title;
  return title || ITEM_LABEL[id] || "รายการ";
}

const DOW_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const ymdParts = (date: string) => { const [, m, d] = date.split("-").map(Number); return { m, d }; };
export const dowName = (dow: number) => DOW_LONG[dow] ?? "";
// "ศุกร์ 24 ต.ค." (no Intl: identical on every runtime)
export const thaiDate = (date: string) => { const { m, d } = ymdParts(date); return `${DOW_LONG[new Date(date + "T12:00:00").getDay()]} ${d} ${MON[m - 1]}`; };
export const thaiRange = (from: string, to: string) => {
  const a = ymdParts(from), b = ymdParts(to);
  return a.m === b.m ? `${a.d}-${b.d} ${MON[b.m - 1]}` : `${a.d} ${MON[a.m - 1]}-${b.d} ${MON[b.m - 1]}`;
};

export const CONFLICT_LABEL: Record<ConflictId, string> = {
  C1: "เกมลากเวลานอน", C2: "หนี้นอนแต่มียิม", C3: "ร้องติดกันนาน", C4: "ร้องหลังยิม", C5: "กินใกล้ยิม",
  C6: "เวลานอนวันงานกับวันว่างต่างกัน", C7: "เทรดแก้มือ", C8: "เทรดเกิน 1 ไม้", C9: "แผนแน่นเกิน", C10: "สัปดาห์ไม่มีวันพัก",
  C11: "สัญญาณล้า", C12: "น้ำหนักกับการซ้อมไม่สัมพันธ์", C13: "ยังไม่ได้ทำรายการเดิม 2 วันติด",
};

// ev key -> Thai with {v}. Used by the "ทำไม?" disclosure and area sheets.
export const EV_LABEL: Record<string, string> = {
  avgH: "นอนเฉลี่ย {v} ชม.", wakeSd: "เวลาตื่นแกว่ง ±{v} นาที", bedSd: "เวลาเข้านอนแกว่ง ±{v} นาที", debtH: "หนี้นอน 7 วัน {v} ชม.",
  nights: "คืนที่มีข้อมูล {v}", wakes: "วันที่กดตื่น {v}", sleepH: "เมื่อคืนนอน {v} ชม.", sq: "คะแนนการนอน {v}/5",
  rate: "น้ำหนัก {v} kg/สัปดาห์", lo: "ช่วงเป้าต่ำสุด {v} kg/สัปดาห์", hi: "ช่วงเป้าสูงสุด {v} kg/สัปดาห์", weighIns: "ชั่ง {v} ครั้งใน 14 วัน",
  kg: "น้ำหนัก {v} kg", waterMet: "ดื่มน้ำถึงเป้า {v} วัน", logged: "วันที่บันทึก {v}",
  planned: "มีในแผน {v} วัน", done: "ทำได้ {v} วัน", excused: "ไม่นับเพราะนอนน้อย/deload {v} วัน", sessions: "ยก {v} ครั้ง",
  delay: "ช้ากว่าแผนเฉลี่ย {v} นาที", run: "ร้องติดกัน {v} วัน", strain: "เสียงแหบ/ตึง {v} วัน",
  days: "{v} วัน", of: "จาก {v} วัน", avgLate: "เข้านอนช้ากว่าแผนเฉลี่ย {v} นาที", avgSleepH: "นอนเฉลี่ย {v} ชม.",
  tradeDays: "บันทึกเทรด {v} วัน", one: "วันที่ 1 ไม้ {v} วัน", over: "เกิน 1 ไม้ {v} วัน", lossThenMore: "แพ้แล้วเข้าต่อ {v} วัน",
  gameH: "เวลาเกมในแผน {v} ชม./สัปดาห์", gameDays: "วันเกม {v} วัน", m7: "พลังงาน/อารมณ์เฉลี่ย 7 วัน {v}/5", base: "ปกติของคุณ {v}/5",
  burnout: "สัญญาณล้า {v}", lowDays: "วันพลังงานต่ำ {v} วัน", checkins: "เช็กอิน {v} วัน",
  avgScore: "ความครบเฉลี่ย {v}%", bad: "วันที่ยังไม่ถึงเกณฑ์ {v} วัน", pairs: "ยังไม่ถึงเกณฑ์ 2 วันติด {v} ครั้ง",
  sjlMin: "กึ่งกลางการนอนต่างกัน {v} นาที", minWinH: "ช่วงนอนสั้นสุด {v} ชม.", load: "แผนแน่น {v}%",
};
export const evText = (key: string, v: number) => (EV_LABEL[key] ?? `${key} {v}`).replace("{v}", String(Math.round(v * 100) / 100));

export const TIP_TEXT: Record<TipId, string> = {
  "wake-anchor": "ตื่นเวลาเดิมราว ±1 ชม. ทุกวัน รวมวันว่าง ช่วยให้นาฬิกาชีวิตนิ่ง",
  "light-after-wake": "รับแสงจ้า 5-10 นาทีหลังตื่น ช่วยตั้งนาฬิกาชีวิตให้คงที่",
  "last-match": "ตั้งแมตช์สุดท้ายไว้ล่วงหน้า จบแล้วเปลี่ยนเป็นเกมชิล",
  "eye-20-20-20": "ทุก 20 นาที มองไกล 20 ฟุต 20 วินาที ช่วยพักตา",
  "stand-60": "ลุกยืดทุก 60 นาทีระหว่างเล่นเกม",
  "protein-split": "แบ่งโปรตีนเป็น 4-5 มื้อ มื้อละ 30-40 g ใช้ได้ดีกว่ากินรวมมื้อเดียว",
  "shake-400": "shake ราว 400 kcal (นม + กล้วย + ข้าวโอ๊ต + เนยถั่ว) เติมแคลอรี่ได้ง่าย",
  "kcal-up": "เพิ่มทีละน้อย 150-250 kcal แล้วดูน้ำหนัก 2 สัปดาห์",
  "kcal-down": "ลดของทอดหรือของหวานลง 1 อย่างก่อน มื้อหลักยังกินครบ",
  "micro-2min": "วันที่ไม่ไหว ทำแค่ 2 นาทีก็นับว่าเริ่มแล้ว",
  mvd: "วันขั้นต่ำ: รับแสงหลังตื่น · โปรตีน 1 มื้อ · น้ำ 1 ขวด",
  "trade-cooloff": "แพ้แล้วพัก 15 นาทีก่อนกลับไปดูกราฟ",
  "trade-checklist": "ก่อนเข้าไม้ เช็ก 3 ข้อ: อยู่ในแผน · มี SL · ยังไม่ถึงลิมิตวันนี้",
  "trade-review-line": "จด 1 บรรทัดหลังเทรด: ทำตามแผนไหม",
  "voice-blocks": "ร้องเป็นช่วงสั้น วอร์ม 10 · ฝึก 15 · พัก แล้วค่อยต่อ",
  "voice-ent": "ถ้าเสียงแหบหรือเจ็บนานเกิน 2 สัปดาห์ ลองปรึกษาแพทย์หู คอ จมูก (เป็นคำแนะนำทั่วไป)",
  "sing-focus-rotate": "สลับเทคนิคที่ฝึกทุกสัปดาห์ เช่น ลมหายใจ เสียงสูง การออกเสียง",
  "sing-before-gym": "ร้องก่อนยิม เสียงยังสดกว่าหลังยิม",
  "mc-one-goal": "ลุยเซิฟแบบเป้าเดียวต่อรอบ จบแล้วค่อยเลือกเป้าถัดไป",
  "deload-explain": "deload คือท่าเดิม น้ำหนักเดิม เซ็ตราวครึ่งหนึ่ง 1 สัปดาห์ ให้ร่างกายได้ฟื้น",
  "sleep-before-volume": "นอนไม่พอ ร่างกายฟื้นได้น้อย วันนี้เล่นเบาลงก็ยังนับ (เป็นคำแนะนำทั่วไป)",
  "talk-support": "ถ้ายังหนักต่อเนื่อง การคุยกับคนที่ไว้ใจหรือผู้เชี่ยวชาญช่วยได้",
  "log-sleep-buttons": "กด \"เข้านอน\" และ \"ตื่นแล้ว\" ทุกวัน คะแนนการนอนจะแม่นขึ้น",
  "log-checkin": "เช็กอินหลังตื่น 10 วินาที ช่วยให้เห็นพลังงานและอารมณ์",
  "weigh-daily": "ชั่งหลังตื่นทุกวัน แอปใช้ค่าแนวโน้ม น้ำหนักแกว่งรายวันเป็นเรื่องปกติ",
};

const GENERIC_ITEM: Item = { id: "x", min: 0, title: "", kind: "habit" };
// mvd = minimum viable day: sleep anchor + protein + water + one 2-minute step (psych.microStep).
export const mvdText = (item?: Item) => `วันขั้นต่ำ: รับแสงหลังตื่น · โปรตีน 1 มื้อ · น้ำ 1 ขวด · ${microStep(item ?? GENERIC_ITEM)}`;
export const MICRO_STEPS: Record<MicroStepId, string> = {
  "sleep-anchor": "ถ้าตื่นแล้ว แล้วเปิดม่าน/รับแสง 5 นาทีก่อนจับมือถือ",
  "sleep-anchor-both": "ถ้าเป็นวันว่าง แล้วตื่นให้ห่างจากเวลาตื่นวันงานไม่เกิน 1 ชม. และรับแสง 5 นาที",
  mvd: mvdText(),
  "sing-2min": "ถ้ากินมื้อแรกเสร็จ แล้วฮัม + lip trill 2 นาทีก็นับ",
  "mc-one-goal": "ถ้าเปิดเซิฟ แล้วเขียนเป้าเดียวของรอบนี้ก่อนเริ่ม",
  "meal-half": "ถ้าถึงเวลามื้อ แล้วเริ่มแค่ครึ่งจานก่อน ที่เหลือค่อยตามมา",
  "water-bottle": "ถ้าตื่นแล้ว แล้วเติมขวดน้ำวางไว้ข้างตัว",
  "kcal-up": "ถ้ากินมื้อหลักเสร็จ แล้วเติมนมหรือ shake อีก 1 แก้ว",
  "kcal-down": "ถ้าอยากกินของทอด/ของหวาน แล้วเลือกข้าว + โปรตีนแทน 1 ครั้ง",
  "log-sleep": "ถ้าวางมือถือก่อนนอน แล้วกด \"เข้านอน\" ก่อน",
  "log-weigh": "ถ้าเข้าห้องน้ำหลังตื่น แล้วขึ้นชั่ง 10 วินาที",
  "log-checkin": "ถ้ากด \"ตื่นแล้ว\" แล้วเช็กอิน 3 ข้อต่อทันที",
};

export const VARIANT_LABEL = ["เบา", "กลาง", "มาก"] as const;

// Per-rule deterministic copy from engine numbers. a = ev numbers plus labels (tpl, item, area).
type CA = Record<string, number | string | undefined>;
type RuleCopy = { short: string; title: (a: CA) => string; why: (a: CA) => string; ifThen: (a: CA) => string };
const n1 = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v ?? "-"));
const n2 = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : String(v ?? "-"));
const R22_TITLE: Record<string, string> = { sleep: "ลองกดปุ่มเข้านอน/ตื่นแล้วทุกวันไหม", nutrition: "ลองชั่งน้ำหนักหลังตื่นทุกวันไหม", recovery: "ลองเช็กอินหลังตื่นทุกวันไหม" };
const R22_IF: Record<string, string> = { sleep: MICRO_STEPS["log-sleep"], nutrition: MICRO_STEPS["log-weigh"], recovery: MICRO_STEPS["log-checkin"] };

export const RULE_COPY: Record<RuleId, RuleCopy> = {
  R01: {
    short: "หยุดเกมแข่งเร็วขึ้น",
    title: (a) => (a.tpl ? `ลองหยุดเกมแข่งเร็วขึ้นใน${a.tpl}ไหม` : "ลองเปิดแจ้งเตือนแมตช์สุดท้ายไหม"),
    why: (a) => `เข้านอนช้ากว่าแผน ${a.days} ใน ${a.of} วันเกม เฉลี่ย ${n1(a.avgLate)} นาที${a.avgSleepH !== undefined ? ` · นอนเฉลี่ย ${n1(a.avgSleepH)} ชม.` : ""}`,
    ifThen: () => "ถ้าจบแมตช์หลังเวลาหยุดเกมแข่ง แล้วไม่เริ่มแมตช์ใหม่ เปลี่ยนเป็นเกมชิล",
  },
  R02: {
    short: "ตั้งหลักเวลาตื่น",
    title: () => "ลองตั้งหลักเวลาตื่นให้คงที่ไหม",
    why: (a) => `เวลาตื่นแกว่ง ±${n1(a.wakeSd)} นาที จาก ${a.wakes} วัน`,
    ifThen: () => MICRO_STEPS["sleep-anchor"],
  },
  R03: {
    short: "เล่นยิมเบาวันนี้",
    title: () => "วันนี้ลองเล่นยิมเบาลงไหม",
    why: (a) => `${typeof a.debtH === "number" && a.debtH > 5 ? `หนี้นอน 7 วัน ${n1(a.debtH)} ชม.` : `เมื่อคืนนอน ${n1(a.sleepH)} ชม.`} · เป็นคำแนะนำทั่วไป`,
    ifThen: () => "ถ้าถึงยิมแล้วยังล้า แล้วเล่นท่าเดิม เซ็ตราวครึ่งหนึ่ง แล้วกลับไปนอนให้พอ",
  },
  R04: {
    short: "ให้เวลานอนวันงานกับวันว่างใกล้กัน",
    title: () => "ลองให้เวลานอนวันงานกับวันว่างใกล้กันขึ้นไหม",
    why: (a) => `กึ่งกลางการนอนวันงานกับวันว่างต่างกัน ${n1(a.sjlMin)} นาที`,
    ifThen: () => MICRO_STEPS["sleep-anchor-both"],
  },
  R05: {
    short: "เพิ่มแคลอรี่อีกนิด",
    title: () => "ลองเพิ่มเป้าแคลอรี่อีกนิดไหม",
    why: (a) => `น้ำหนักขึ้น ${n2(a.rate)} kg/สัปดาห์ ต่ำกว่าช่วงเป้า ${n2(a.lo)}-${n2(a.hi)} 2 สัปดาห์ติด${a.c12 ? " · กินครบแต่ขึ้นช้า น่าจะเป็นที่ปริมาณ" : ""}`,
    ifThen: () => MICRO_STEPS["kcal-up"],
  },
  R06: {
    short: "ลดแคลอรี่ลงนิด",
    title: () => "ลองลดเป้าแคลอรี่ลงเล็กน้อยไหม",
    why: (a) => `น้ำหนักขึ้น ${n2(a.rate)} kg/สัปดาห์ เร็วกว่าช่วงเป้า ${n2(a.lo)}-${n2(a.hi)} 2 สัปดาห์ติด`,
    ifThen: () => MICRO_STEPS["kcal-down"],
  },
  R07: {
    short: "ปรับมื้อที่ยังไม่ได้กิน",
    title: (a) => (a.mode === "delay" ? `ลองขยับเวลา ${a.item} ใน${a.tpl}ไหม` : `ลองทำให้ ${a.item} ง่ายขึ้นไหม`),
    why: (a) => `${a.item} ทำได้ ${a.done}/${a.planned} วัน${a.delay !== undefined ? ` · ช้ากว่าแผนเฉลี่ย ${n1(a.delay)} นาที` : ""}`,
    ifThen: (a) => `ถ้าถึงเวลา ${a.item} แล้วเริ่มแค่ครึ่งจานก่อน ที่เหลือค่อยตามมา`,
  },
  R08: {
    short: "ดื่มน้ำให้ถึงเป้าง่ายขึ้น",
    title: () => "ลองปรับให้ดื่มน้ำถึงเป้าง่ายขึ้นไหม",
    why: (a) => `ดื่มน้ำถึงเป้า ${a.waterMet}/${a.logged} วัน`,
    ifThen: () => MICRO_STEPS["water-bottle"],
  },
  R09: {
    short: "ขยับเวลายิม",
    title: (a) => `ลองขยับเวลายิมใน${a.tpl}ไหม`,
    why: (a) => `เข้ายิมช้ากว่าแผนเฉลี่ย ${n1(a.delay)} นาที จาก ${a.n} ครั้ง`,
    ifThen: () => "ถ้ากินมื้อ 2 เสร็จ แล้วเตรียมกระเป๋ายิมไว้ทันที",
  },
  R10: {
    short: "เว้นมื้อกับยิมให้ห่างขึ้น",
    title: () => "ลองเว้นมื้อกับยิมให้ห่างขึ้นไหม",
    why: (a) => `กินมื้อหลักภายใน 45 นาทีก่อนยิม ${a.days} วัน`,
    ifThen: () => "ถ้าใกล้เวลายิมแล้วยังไม่ได้กิน แล้วเปลี่ยนเป็น whey + กล้วยแทนมื้อหนัก",
  },
  R11: {
    short: "พักยิมแบบ deload สักสัปดาห์",
    title: () => "ลองสัปดาห์ deload ไหม",
    why: (a) => (a.lowE !== undefined ? `พลังงานต่ำ (2 หรือน้อยกว่า) ${a.lowE} วันในสัปดาห์นี้` : `ยกมาแล้ว ${n1(a.weeks)} สัปดาห์ ${a.sessions} ครั้งนับจาก deload ครั้งก่อน`),
    ifThen: () => "ถ้าถึงยิมในสัปดาห์ deload แล้วเล่นท่าเดิม น้ำหนักเดิม เซ็ตราวครึ่งหนึ่ง",
  },
  R12: {
    short: "พักเสียง 1 วัน",
    title: () => "ลองพักเสียง 1 วันไหม",
    why: (a) => (typeof a.run === "number" && a.run >= 7 ? `ร้องติดกัน ${a.run} วันโดยไม่พักเสียง` : `เสียงแหบ/ตึง ${a.strain} วันในสัปดาห์นี้`),
    ifThen: () => "ถ้าเป็นวันพักเสียง แล้วคุยเบาๆ จิบน้ำอุ่น ไม่ร้องไม่ตะโกน",
  },
  R13: {
    short: "ร้องก่อนยิม",
    title: () => "ลองร้องเพลงก่อนยิมแทนหลังยิมไหม",
    why: (a) => (a.days ? `ร้องภายใน 1 ชม. หลังยิม ${a.days} วัน` : "ในแผนมีร้องภายใน 1 ชม. หลังยิม"),
    ifThen: () => "ถ้ากลับจากยิมแล้ว แล้วพักเสียงอย่างน้อย 1 ชม. ก่อนร้อง",
  },
  R14: {
    short: "เริ่มร้องแค่ 2 นาที",
    title: () => "ลองเริ่มร้องแค่ 2 นาทีไหม",
    why: (a) => `ร้องได้ ${a.done}/${a.planned} วันที่มีในแผน${a.delay !== undefined ? ` · ช้ากว่าแผนเฉลี่ย ${n1(a.delay)} นาที` : ""}`,
    ifThen: () => MICRO_STEPS["sing-2min"],
  },
  R15: {
    short: "ใช้เช็กลิสต์ก่อนเข้าไม้",
    title: () => "ลองใช้เช็กลิสต์ก่อนเข้าไม้ไหม",
    why: (a) => `วันที่ 1 ไม้: ${a.one} วัน · เกิน 1 ไม้: ${a.over} วัน`,
    ifThen: () => "ถ้าจะเข้าไม้ที่ 2 แล้วอ่านเช็กลิสต์ 3 ข้อก่อน แล้วค่อยตัดสินใจ",
  },
  R16: {
    short: "พักหลังไม้ที่แพ้",
    title: () => "ลองพัก 15 นาทีหลังไม้ที่แพ้ไหม",
    why: (a) => `วันที่แพ้แล้วเข้าไม้ต่อ: ${a.days} วัน`,
    ifThen: () => "ถ้าไม้แรกแพ้ แล้วปิดกราฟ 15 นาที และเขียน 1 บรรทัดว่าเกิดอะไรขึ้น",
  },
  R17: {
    short: "ตั้งเป้าเดียวต่อรอบเซิฟ",
    title: () => "ลองตั้งเป้าเดียวต่อรอบลุยเซิฟไหม",
    why: (a) => `ได้ลุยเซิฟจริง ${a.done}/${a.planned} วันที่มีในแผน`,
    ifThen: () => MICRO_STEPS["mc-one-goal"],
  },
  R18: {
    short: "พักให้เบาลงสักสัปดาห์",
    title: () => "ลองสัปดาห์เบาๆ ไหม",
    why: (a) => `ช่วงนี้พลังงานและอารมณ์ต่ำกว่าปกติของคุณมา ${a.lowDays} วัน ลองสัปดาห์เบาๆ ไหม ถ้ายังหนักต่อเนื่อง การคุยกับคนที่ไว้ใจหรือผู้เชี่ยวชาญช่วยได้${typeof a.debtH === "number" && a.debtH > 5 ? ` · หนี้นอน ${n1(a.debtH)} ชม.` : ""}`,
    ifThen: () => "ถ้าพรุ่งนี้ตื่นมายังล้า แล้วทำแค่วันขั้นต่ำ: รับแสง โปรตีน น้ำ",
  },
  R19: {
    short: "กลับมาทำแบบขั้นต่ำ",
    title: (a) => `ลองกลับมาทำ ${a.item} แบบขั้นต่ำวันนี้ไหม`,
    why: (a) => `${a.item} ยังไม่ได้ทำ 2 วันติด · 1 วันไม่เป็นไร แค่ไม่ให้เป็น 2 วันติด`,
    ifThen: (a) => `ถ้าถึงเวลา ${a.item} แล้วทำแค่ 2 นาทีก็นับ`,
  },
  R20: {
    short: "เพิ่มวันพักในสัปดาห์",
    title: () => "ลองเปลี่ยนวันที่แน่นสุดเป็นวันพักไหม",
    why: (a) => [a.days ? `แผนสัปดาห์นี้แน่นเกิน 90% ${a.days} วัน` : "", typeof a.minWinH === "number" && a.minWinH < 7.5 ? `ช่วงนอนสั้นสุด ${n1(a.minWinH)} ชม.` : ""].filter(Boolean).join(" · "),
    ifThen: () => "ถ้าวันไหนรู้สึกแน่น แล้วเลือกตัดรายการเสริม 1 อย่างก่อน",
  },
  R21: {
    short: "เพิ่มวันพัก",
    title: () => "ลองเพิ่มวันพักในสัปดาห์หน้าไหม",
    why: (a) => `7 วันข้างหน้าร้อง ${a.sing} วัน ยก ${a.gym} วัน และยังไม่มีวันพัก`,
    ifThen: () => "ถ้าเป็นวันพัก แล้วพักทั้งเสียงและยิม เล่นเกมหรือเดินเบาๆ",
  },
  R22: {
    short: "บันทึกเพิ่มอีกนิด",
    title: (a) => R22_TITLE[String(a.area)] ?? "ลองบันทึกเพิ่มอีกนิดไหม",
    why: (a) => `${AREA_LABEL[a.area as AreaKey] ?? ""} ยังมีข้อมูลน้อย ระบบจึงยังสรุปให้ไม่ได้`,
    ifThen: (a) => R22_IF[String(a.area)] ?? MICRO_STEPS["log-checkin"],
  },
};

// Hedged pattern copy: correlation only ("มักจะ", "ดูเหมือน").
const pctOf = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;
const r1 = (v: number | undefined) => String(Math.round((v ?? 0) * 10) / 10);
type PA = { eff: number; nA?: number; nB?: number; n?: number; mA?: number; mB?: number };
export const PATTERN_TEXT: Record<PatternId, (p: PA) => string> = {
  P1: (p) => `วันที่นอน 7 ชม.ขึ้นไป ${p.eff > 0 ? "มักทำได้ครบกว่า" : "ดูเหมือนทำได้ครบน้อยกว่า"} (${pctOf(p.mA)} vs ${pctOf(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P2: (p) => `ดูเหมือนคืนที่นอนนานขึ้น ${p.eff > 0 ? "พลังงานวันถัดมามักดีขึ้น" : "พลังงานมักต่ำลง"} (${p.n} วัน)`,
  P3: (p) => `หลังคืนที่เข้านอนช้ากว่าแผนเกิน 45 นาที พลังงาน${p.eff < 0 ? "มักต่ำกว่า" : "ดูเหมือนไม่ต่ำลง"} (${r1(p.mA)} vs ${r1(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P4: (p) => `วันเกมจัดเต็ม${p.eff > 0 ? "มักเข้านอนช้ากว่าแผนมากกว่า" : "ดูเหมือนเข้านอนตรงแผนกว่า"} (${Math.round(p.mA ?? 0)} vs ${Math.round(p.mB ?? 0)} นาที, ${p.nA}/${p.nB} วัน)`,
  P5: (p) => `วันทำงาน${p.eff > 0 ? "มักทำได้ครบกว่า" : "มักทำได้ครบน้อยกว่า"}วันว่าง (${pctOf(p.mA)} vs ${pctOf(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P6: (p) => `วันหลังไปยิม อารมณ์${p.eff > 0 ? "มักดีกว่า" : "ดูเหมือนไม่ดีขึ้น"} (${r1(p.mA)} vs ${r1(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P7: (p) => `วันที่ได้ร้องเพลง อารมณ์${p.eff > 0 ? "มักดีกว่า" : "ดูเหมือนไม่ดีขึ้น"} (${r1(p.mA)} vs ${r1(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P8: (p) => `วันที่ดื่มน้ำถึงเป้า พลังงาน${p.eff > 0 ? "มักดีกว่า" : "ดูเหมือนไม่ต่างกัน"} (${r1(p.mA)} vs ${r1(p.mB)}, ${p.nA}/${p.nB} วัน)`,
  P9: (p) => `วันที่เทรดเกิน 1 ไม้ อารมณ์${p.eff < 0 ? "มักต่ำกว่า" : "ดูเหมือนไม่ต่างกัน"} (${r1(p.mA)} vs ${r1(p.mB)}, ${p.nA}/${p.nB} วัน)`,
};

export const LOW_DATA_HEADLINE = "ข้อมูลยังน้อย ลองกดเข้านอน/ตื่นแล้ว ชั่งน้ำหนัก และเช็กอินทุกวัน แล้วสมดุลจะเริ่มแสดง";
export const logMoreDays = (n: number) => `บันทึกอีก ${n} วันเพื่อเริ่มดูสมดุล`;
export const EVAL_CAVEAT = "เป็นการดูความเปลี่ยนแปลง ไม่ได้พิสูจน์ว่าเป็นเพราะการปรับนี้";
export const VERDICT_LABEL = { better: "ดูเหมือนช่วย", same: "เท่าเดิม", worse: "แย่ลง", nodata: "ข้อมูลไม่พอ", waiting: "รอผล" } as const;
export const CLIP_SAFE = "ปรับให้อยู่ในช่วงปลอดภัยแล้ว";
export const CLIP_MOVE = "ขยับได้ไม่เกิน 60 นาทีต่อครั้ง";

// Doctor flags (pure): at most one notice at a time, chosen by priority. General wellness only: every flag says it is not a
// diagnosis; heuristic thresholds are labelled as such. No mental-health flag (help numbers live in settings).
import { addDays } from "../date";
import type { DayLog, State } from "../model";
import { bpHigh } from "./body";

export type CareFlag = { id: string; title: string; body: string; who: string; tips: string[]; heuristic?: true; call?: "1669" };
const NOT_DX = "ไม่ใช่การวินิจฉัย";

// Days in the window (today back, inclusive) that match.
function countDays(s: State, today: string, n: number, f: (d: DayLog) => boolean): number {
  let k = 0;
  for (let i = 0; i < n; i++) { const d = s.days[addDays(today, -i)]; if (d && f(d)) k++; }
  return k;
}
const hasSym = (d: DayLog, sym: string) => Array.isArray(d.sym) && d.sym.includes(sym as never);
// Only the voice symptom chip or a "เจ็บหรือแหบมาก" recap: mild hoarseness after a long live usually clears overnight.
const voiceSig = (d: DayLog) => hasSym(d, "voice") || d.live?.v === 2;

function candidates(s: State, today: string): CareFlag[] {
  const c = s.care, out: CareFlag[] = [];
  const red = c.shelf.find((p) => !p.done && p.patch?.res === "red");
  if (red) out.push({ id: "patch", title: `หยุดใช้ ${red.name}`, who: "เภสัชกร หรือแพทย์ผิวหนัง", call: "1669",
    body: `ผลทดสอบผิวแดง-คัน หยุดใช้ไว้ก่อน · ${NOT_DX}`, tips: ["ล้างออกด้วยน้ำสะอาด", "หน้า/ปากบวม หายใจลำบาก โทร 1669 ทันที"] });
  if (c.ms.mole === 3) out.push({ id: "mole", title: "ไฝเปลี่ยน คัน หรือมีเลือดออก", who: "แพทย์ผิวหนัง",
    body: `ควรให้แพทย์ผิวหนังดูเร็วๆ นี้ · ${NOT_DX}`, tips: ["ถ่ายรูปไว้เทียบ มุมเดิม แสงเดิม"] });
  if (countDays(s, today, 21, voiceSig) >= 12) out.push({ id: "voice", title: "เสียงแหบเกิน 3 สัปดาห์", who: "หมอ หู คอ จมูก",
    body: `เสียงแหบหรือเจ็บคอบ่อยใน 3 สัปดาห์ ควรพบหมอ หู คอ จมูก · ${NOT_DX}`, tips: ["พักเสียง ไม่กระซิบ", "จิบน้ำบ่อยๆ", "ไลฟ์พูดเบาลง"] });
  if (bpHigh(c.checks.find((x) => x.id === "bp"))) out.push({ id: "bp", title: "ความดันสูงกว่าเกณฑ์ 2 วัน", who: "แพทย์",
    body: `ค่าที่วัดเองที่บ้าน 2 วันสูงกว่า 135/85 ควรให้แพทย์ตรวจซ้ำ · ${NOT_DX}`, tips: ["วัดหลังนั่งพัก 5 นาที", "ไม่วัดหลังกาแฟ ออกกำลัง หรือไลฟ์"] });
  const lab = c.checks.find((x) => x.flag);
  if (lab) out.push({ id: "lab", title: `ผล${lab.name}มีค่าผิดปกติ`, who: "แพทย์",
    body: `นำใบผลไปปรึกษาแพทย์ · ${NOT_DX}`, tips: ["บอกหมอว่ากิน creatine และ whey"] });
  if (c.ms["pm.ret.84"] === 2 || c.ms["pm.ret.84"] === 3) out.push({ id: "skin", title: "ใช้เรตินอยด์ครบ 12 สัปดาห์แล้วผิวยังไม่ดีขึ้น", who: "แพทย์ผิวหนัง",
    body: `เรตินอยด์มักเห็นผลราว 12 สัปดาห์ ถ้ายังไม่ดีขึ้นควรพบแพทย์ผิวหนัง · ${NOT_DX}`, tips: ["ทากันแดดทุกเช้า", "ไม่แกะสิว"] });
  if (countDays(s, today, 21, (d) => d.bowel === 2 || d.bowel === 3) >= 15) out.push({ id: "bowel", title: "การขับถ่ายเปลี่ยนเกิน 3 สัปดาห์", who: "แพทย์",
    body: `ควรปรึกษาแพทย์ · ถ่ายเป็นเลือดหรือสีดำ ไปหาหมอทันที · ${NOT_DX}`, tips: ["ดื่มน้ำให้พอ", "ผัก/ผลไม้วันละ 5 ส่วน"] });
  if (countDays(s, today, 14, (d) => hasSym(d, "ear")) >= 3) out.push({ id: "ear", title: "หูอื้อหรือมีเสียงวี้ดบ่อย", who: "ตรวจการได้ยิน",
    body: `ควรตรวจการได้ยิน · ${NOT_DX}`, tips: ["หูฟังไม่เกิน 60%", "พักหูทุกชั่วโมง"] });
  if (countDays(s, today, 14, (d) => hasSym(d, "eye")) >= 7) out.push({ id: "eye", title: "ตาล้าหรือแห้งบ่อย", who: "ตรวจตา",
    body: `ควรตรวจตา · ${NOT_DX}`, tips: ["20-20-20: ทุก 20 นาที มองไกล 6 เมตร 20 วินาที", "เปิดไฟห้องตอนไลฟ์"] });
  if (countDays(s, today, 30, (d) => hasSym(d, "head")) >= 8) out.push({ id: "head", title: "ปวดหัวบ่อย", who: "แพทย์", heuristic: true,
    body: `ปวดหัวหลายวันในเดือนนี้ ควรปรึกษาแพทย์ · เกณฑ์โดยประมาณ · ${NOT_DX}`, tips: ["ดื่มน้ำให้พอ", "นอนให้ตรงเวลา"] });
  const sick = [0, 1, 2, 3, 4].map((i) => { const d = s.days[addDays(today, -i)]; return !!d && hasSym(d, "sick"); });
  if (sick.some((_, i) => i <= 2 && sick[i] && sick[i + 1] && sick[i + 2])) out.push({ id: "sick", title: "ไม่สบาย 3 วันติด", who: "แพทย์", heuristic: true,
    body: `ไม่สบายติดกันหลายวัน ควรพบแพทย์ · เกณฑ์โดยประมาณ · ${NOT_DX}`, tips: ["พักผ่อน ดื่มน้ำ", "งดยิมจนหายดี"] });
  return out;
}

// The first flag by priority that is not snoozed (snooze["f:"+id] earlier than today shows it again). Null before setup.
export function careFlag(s: State, today: string): CareFlag | null {
  if (s.care.level === null) return null;
  return candidates(s, today).find((f) => { const sn = s.care.snooze["f:" + f.id]; return !sn || sn < today; }) ?? null;
}
export function snoozeFlag(x: State, id: string, today: string) { x.care.snooze["f:" + id] = addDays(today, 14); }

// Static text (no trigger), from the brief section 12.
export const RED_FLAGS = [
  "ปัสสาวะสีแดงหรือน้ำตาล",
  "อาการลมแดด (ตัวร้อนจัด สับสน อาเจียน เป็นลม): ทำให้ตัวเย็นลงแล้วโทร 1669",
  "ใจสั่นหรือเจ็บหน้าอกหลังดื่มเครื่องดื่มชูกำลัง",
  "ปากแห้งแตกไม่ดีขึ้นใน 2-3 สัปดาห์",
  "รังแคหรือผิวลอกเกินราว 6 สัปดาห์ หรือแชมพูทำให้แสบ",
  "ผื่นที่ลามหรือเป็นซ้ำ",
  "สิวลึก เจ็บ หรือเริ่มเป็นแผลเป็น",
  "เหงื่อออกมากจนผลิตภัณฑ์ทั่วไปช่วยไม่ได้",
];
export const HELP: [string, string][] = [["1323", "สายด่วนสุขภาพจิต ฟรี 24 ชม."], ["1669", "เจ็บป่วยฉุกเฉิน"], ["191", "เหตุด่วน"]];

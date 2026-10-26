// Light trackers (pure): fruit/veg, urine colour, caffeine, steps band, bowel, symptoms. General wellness only.
import { dayFor, type DayLog, type State, type Sym } from "../model";
import type { Care } from "./types";

export const VEG_TARGET = 5;
export const URINE = ["ใส/เหลืองอ่อน", "เหลืองเข้ม", "อำพัน"];
export const WALK = ["น้อยกว่า 4 พัน", "4-7 พัน", "7 พันขึ้นไป"];
export const BOWEL = ["ปกติ", "แข็ง", "เหลว"];
export const SYM_LABEL: Record<Sym, string> = { voice: "เสียงแหบ/เจ็บคอ", head: "ปวดหัว", eye: "ตาล้า/แห้ง", ear: "หูอื้อ/มีเสียงวี้ด", skin: "ผิวระคาย", sick: "ไม่สบาย" };
export const CAF_LABEL: Record<CafKind, string> = { c: "กาแฟ", t: "ชา", e: "ชูกำลัง", p: "พรีเวิร์กเอาต์" };
export type CafKind = "c" | "t" | "e" | "p";
const KINDS: CafKind[] = ["c", "t", "e", "p"];

const cnt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
// Estimated mg from drink counts x the user's mg per drink.
export function cafTotal(day: DayLog | undefined, mg: Care["cafMg"]): number {
  const c = day?.caf && typeof day.caf === "object" ? day.caf : {};
  return KINDS.reduce((n, k) => n + cnt(c[k]) * mg[k], 0);
}
// Last coffee/tea/energy ~9 h before planned sleep; strong pre-workout ~13 h.
export const cafCutoff = (sleepMin: number) => ({ coffee: sleepMin - 540, pre: sleepMin - 780 });

// over = 400 mg or more (warn tone); late / preLate (a pre-workout logged past its cutoff) are neutral info lines, shown once.
// nowMin/sleepMin stay in the signature for callers; the late flags are stamped at log time by logCaf.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function cafNote(day: DayLog | undefined, mg: Care["cafMg"], nowMin: number, sleepMin: number): { over: boolean; late: boolean; preLate: boolean } {
  const c = day?.caf && typeof day.caf === "object" ? day.caf : {};
  return { over: cafTotal(day, mg) >= 400, late: cnt(c.late) > 0, preLate: cnt(c.pl) > 0 };
}

// +1 drink; late counts only coffee/tea/energy past the coffee cutoff (pre-workout never feeds cafLateDays).
export function logCaf(x: State, date: string, kind: CafKind, nowMin: number, sleepMin: number) {
  const d = dayFor(x, date);
  const c = { ...(d.caf && typeof d.caf === "object" ? d.caf : {}) };
  c[kind] = cnt(c[kind]) + 1;
  if (kind !== "p" && nowMin > cafCutoff(sleepMin).coffee) c.late = cnt(c.late) + 1;
  if (kind === "p" && nowMin > cafCutoff(sleepMin).pre) c.pl = cnt(c.pl) + 1;
  d.caf = c;
  x.days[date] = d;
}

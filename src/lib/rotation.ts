export type LogEntry = { date: string; code: string };

export const GYM_CYCLE = ["D1", "D2", "D3", "D4", "R"] as const;
export const GYM_LABEL: Record<string, string> = {
  D1: "ขา + หน้าท้อง",
  D2: "อก + หลังแขน",
  D3: "หลัง + หน้าแขน",
  D4: "ไหล่ + ส่วนที่ขาด",
  R: "พัก / คาร์ดิโอ / เทนนิส",
};

export const PERSONALITY_CYCLE = ["P1", "P2", "P3", "P4", "P5"] as const;
export const PERSONALITY_LABEL: Record<string, string> = {
  P1: "การพูด / น้ำเสียง",
  P2: "ภาษากาย",
  P3: "อ่านหนังสือ + สรุป",
  P4: "ภาษาอังกฤษ / ทักษะใหม่",
  P5: "ภาพลักษณ์",
};

/**
 * What comes next in a rotating cycle, based on what was actually done (not the calendar).
 * Rules:
 *  - "R-tennis" / "R-cardio" count as "R".
 *  - Follows the last real session: if D3 was done out of order, next is D4.
 *  - Extra rest days never push the cycle forward: after R, R, the next is still D1.
 */
export function nextInCycle(cycle: readonly string[], history: LogEntry[]): string {
  const last = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return cycle[0];
  const i = cycle.indexOf(last.code.split("-")[0]);
  return i < 0 ? cycle[0] : cycle[(i + 1) % cycle.length];
}

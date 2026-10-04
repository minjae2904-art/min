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
 * Used by both the gym split (D1-D4, R) and personality training (P1-P5).
 *
 * history: all logged entries, any order. A code like "R-tennis" counts as "R".
 * Returns a code from `cycle`.
 */
export function nextInCycle(cycle: readonly string[], history: LogEntry[]): string {
  // TODO(user): decide the rotation rule. Placeholder always starts the cycle over.
  return cycle[0];
}

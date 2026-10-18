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
 *  - Follows the last real (non-rest) session: if D3 was done out of order, next is D4.
 *  - After D4 the rest day R is offered once; once a rest day has been logged the cycle
 *    moves on (D4, R -> D1) and extra rest days never push it further (D4, R, R -> D1).
 */
export function nextInCycle(cycle: readonly string[], history: LogEntry[]): string {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const newest = sorted[0];
  if (!newest) return cycle[0];
  const isRest = (c: string) => c.split("-")[0] === "R";
  const lastReal = sorted.find((h) => !isRest(h.code));
  if (!lastReal) return cycle[0];
  const i = cycle.indexOf(lastReal.code.split("-")[0]);
  if (i < 0) return cycle[0];
  let next = cycle[(i + 1) % cycle.length];
  if (isRest(newest.code) && isRest(next)) next = cycle[(i + 2) % cycle.length];
  return next;
}

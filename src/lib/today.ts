// Pure Today helpers (Round B). Tested in today.test.ts.
import type { Item } from "./schedule";

// QuickLog item steps. Input = pending ring items (weigh excluded). due = up to 30 min ahead (the v1.x filter);
// phase = the rest of the current phase, or 30 min ahead if that is later (sleep phase = due); all = everything.
export function quickScope(items: Item[], scope: "phase" | "due" | "all", o: { phaseKey: string; phaseEnd: number; nowMin: number }): Item[] {
  if (scope === "all") return items;
  const lim = scope === "phase" && o.phaseKey !== "sleep" ? Math.max(o.phaseEnd - 1, o.nowMin + 30) : o.nowMin + 30;
  return items.filter((i) => i.min <= lim);
}

// ---- Today notice slot (G4) ----
export type NoticeKey = "health" | "flag" | "stream" | "intro" | "care" | "dnd" | "voice" | "daymsg";
export const NOTICE_ORDER: readonly NoticeKey[] = ["health", "flag", "stream", "intro", "care", "dnd", "voice", "daymsg"];

// Priority order; daymsg only when it is alone. Up to max shown; past that, the first one plus a "more" pill (more = the rest).
export function arrangeNotices<T extends { key: NoticeKey }>(list: T[], max = 2): { shown: T[]; more: T[] } {
  const sorted = [...list].sort((a, b) => NOTICE_ORDER.indexOf(a.key) - NOTICE_ORDER.indexOf(b.key));
  const rest = sorted.some((n) => n.key !== "daymsg") ? sorted.filter((n) => n.key !== "daymsg") : sorted;
  if (rest.length <= max) return { shown: rest, more: [] };
  const k = Math.max(1, max - 1);
  return { shown: rest.slice(0, k), more: rest.slice(k) };
}

// ---- Now card variant (G4) ----
export type NowVariant = "day" | "live" | "sleep" | "over" | "done";
export function nowVariant(o: { phaseKey: string; live: boolean; hasNext: boolean; pending: number }): NowVariant {
  if (!o.hasNext) return o.pending > 0 ? "over" : "done";
  if (o.phaseKey === "sleep") return "sleep";
  return o.live ? "live" : "day";
}

// ---- Checklist done group (G5) ----
// Partition a section list: done items leave for the "ทำแล้ว" group unless still settling (ticked on this visit).
// Info rows (never done) stay pending. Both halves keep the input (time) order.
export function splitDone(list: Item[], done: Record<string, number>, settling: ReadonlySet<string>): { pending: Item[]; done: Item[] } {
  const p: Item[] = [], d: Item[] = [];
  for (const i of list) (done[i.id] && !settling.has(i.id) ? d : p).push(i);
  return { pending: p, done: d };
}

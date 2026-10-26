// v1.8 term mode (pure): the class timetable, the class rows of a date and the class-quiet helpers.
// Imports only types, date.ts and the i18n core, so model.ts and schedule.ts can import it without a cycle.
import { msgs } from "../i18n";
import * as M from "../i18n/msg/lib-3";
import { hm } from "./date";
import type { Cls, Term } from "./model";
import type { Item } from "./schedule";

const m = msgs(M);

export const CLS_CAP = 30, OFF_CAP = 40, CLS_MIN = 480, CLS_MAX = 1439, EARLY_WARN = 540;
export const GO_DEFAULT = 30; // minutes to leave home before the first class (re-exported by model.ts)

const ISO = /^\d{4}-\d{2}-\d{2}$/, CID = /^[a-z0-9]{1,8}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !ISO.test(v)) return false;
  const t = Date.parse(v + "T12:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v; // rejects 2026-02-30 rolling over
};
const dayN = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

function clsOf(v: unknown): Cls | null {
  if (!isObj(v) || typeof v.id !== "string" || !CID.test(v.id)) return null;
  const { d, s, e } = v;
  if (!isInt(d) || d < 0 || d > 6 || !isInt(s) || !isInt(e) || s % 5 || e % 5) return null;
  if (s < CLS_MIN || e > CLS_MAX || e - s < 15 || e - s > 600) return null;
  const t = typeof v.t === "string" ? v.t.trim().slice(0, 40) : "";
  if (!t) return null;
  const r = typeof v.r === "string" ? v.r.trim().slice(0, 20) : "";
  return { id: v.id, d, s, e, t, ...(r ? { r } : {}) };
}

// A stored term is used only with valid dates (end >= start, span <= 400 days); bad classes, off dates and go are dropped.
export function sanitizeTerm(v: unknown): Term | null {
  if (!isObj(v) || !isDate(v.start) || !isDate(v.end) || v.end < v.start || dayN(v.start, v.end) > 400) return null;
  const cls: Cls[] = [];
  for (const x of Array.isArray(v.cls) ? v.cls : []) {
    const c = clsOf(x);
    if (c && !cls.some((y) => y.id === c.id)) cls.push(c);
  }
  cls.sort((a, b) => a.d - b.d || a.s - b.s);
  const t: Term = { start: v.start, end: v.end, cls: cls.slice(0, CLS_CAP) };
  const off = [...new Set((Array.isArray(v.off) ? v.off : []).filter(isDate))].sort().slice(0, OFF_CAP);
  if (off.length) t.off = off;
  if (isInt(v.go) && v.go >= 0 && v.go <= 120 && v.go % 5 === 0) t.go = v.go;
  return t;
}

export const dowOf = (date: string) => new Date(date + "T12:00:00").getDay(); // same weekday on the UTC server and the phone
export const goOf = (t: Term | null | undefined) => t?.go ?? GO_DEFAULT;
export const termOn = (t: Term | null | undefined, date: string): boolean => !!t && date >= t.start && date <= t.end && !t.off?.includes(date);
export function classesOn(t: Term | null | undefined, date: string): Cls[] {
  if (!t || !termOn(t, date)) return [];
  const d = dowOf(date);
  return t.cls.filter((c) => c.d === d).sort((a, b) => a.s - b.s);
}
// Info rows (no ring, never reminded): they show on Today and quiet reminders, but never score.
export const classItems = (t: Term | null | undefined, date: string): Item[] => classesOn(t, date).map((c) => ({
  id: "cls-" + c.id, min: c.s, dur: c.e - c.s, title: c.t, sub: c.r ? m("term.room", { room: c.r }) : undefined, kind: "class", remind: false,
}));

const isCls = (i: Item) => i.kind === "class";
const endOf = (i: Item) => i.min + (i.dur ?? 0);

// Contiguous class rows (gap <= 30 min) for the grouped Today row.
export function classRuns(items: Item[]): { start: number; end: number; items: Item[] }[] {
  const out: { start: number; end: number; items: Item[] }[] = [];
  for (const i of items.filter(isCls).sort((a, b) => a.min - b.min)) {
    const last = out.at(-1);
    if (last && i.min - last.end <= 30) { last.items.push(i); last.end = Math.max(last.end, endOf(i)); }
    else out.push({ start: i.min, end: endOf(i), items: [i] });
  }
  return out;
}
export function classNow(items: Item[], nowMin: number): { item: Item; end: number } | null {
  const i = items.find((x) => isCls(x) && x.min <= nowMin && nowMin < endOf(x));
  return i ? { item: i, end: endOf(i) } : null;
}
export const inClass = (items: Item[], min: number) => items.some((x) => isCls(x) && x.min <= min && min < endOf(x));
// A minute inside a class moves to that class's end, chained across back-to-back classes.
export function quietAt(items: Item[], min: number): number {
  let m = min;
  for (let k = 0; k < CLS_CAP; k++) {
    const c = classNow(items, m);
    if (!c) break;
    m = c.end;
  }
  return m;
}
export const clsSpan = (c: Pick<Cls, "s" | "e">) => `${hm(c.s)}-${hm(c.e)}`;
// base36 of now, last 8 chars, bumped until unique in the term.
export function newClsId(t: Term | null | undefined, now = Date.now()): string {
  let n = now, id = n.toString(36).slice(-8);
  while (t?.cls.some((c) => c.id === id)) id = (++n).toString(36).slice(-8);
  return id;
}

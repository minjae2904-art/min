// Self-care module types, defaults, sanitizers and merge (pure). No runtime import of model (model imports this file).
import { CAD_RE } from "./cadence";

export const TAGS = ["face", "body", "oral", "hair", "eye", "voice", "move", "mind", "water"] as const; export type Tag = (typeof TAGS)[number];
export const IRRITANTS = ["ret", "bha", "aha", "bp", "vitc"] as const; export type Irritant = (typeof IRRITANTS)[number];
export type Level = "lite" | "std" | "full";
export type Step = { id: string; title: string; tag: Tag; cad?: string; opt?: boolean; on?: boolean; min?: number; hint?: string;
  irr?: Irritant; act?: "journal"; product?: string; pack?: string; ed?: true /* user-edited: level switches keep title/cad/opt */ };
export type Anchor = { host: "night" | "stream-prep" } | { item: string[]; off: number; end?: boolean } | { at: number };
export type Routine = { id: string /* am|gym|prep|pm|u-xxxx */; name: string; anchor: Anchor; remind: boolean; on: boolean; steps: Step[]; from?: string };
export type CareTask = { id: string; title: string; tag: Tag; every: number; hint?: string; on: boolean; pack?: string };
export type Product = { id: string; name: string; cat: Tag; opened?: string; pao?: 3 | 6 | 12 | 24; exp?: string; irr?: Irritant; low?: boolean; done?: string; patch?: { start: string; res?: "ok" | "red" } };
export type Check = { id: string; name: string; everyM: number; last?: string; bp?: [number, number, string][]; flag?: boolean; note?: string };
export type Care = {
  level: Level | null; asked: boolean; packs: string[]; tasks: CareTask[]; last: Record<string, string>;
  track: { veg: boolean; urine: boolean; caf: boolean; walk: boolean; bowel: boolean; sym: boolean };
  water: { plan: boolean; live: boolean; chips: number[] };
  cafMg: { c: number; t: number; e: number; p: number };
  shelf: Product[]; checks: Check[]; snooze: Record<string, string>; ms: Record<string, 1 | 2 | 3>;
};
export const DEFAULT_CARE: Care = { level: null, asked: false, packs: [], tasks: [], last: {},
  track: { veg: false, urine: false, caf: false, walk: false, bowel: false, sym: false },
  water: { plan: false, live: true, chips: [250, 350, 500, 1000] }, cafMg: { c: 100, t: 40, e: 80, p: 200 },
  shelf: [], checks: [], snooze: {}, ms: {} };

// A routine shows on Today only with at least one on + required + daily step (rows never depend on the date).
export const hasRequiredDaily = (r: Pick<Routine, "steps">) => r.steps.some((s) => s.on !== false && !s.opt && (s.cad ?? "d") === "d");

export const PRESET_IDS = ["am", "gym", "prep", "pm"] as const;
export const LEVELS: readonly Level[] = ["lite", "std", "full"];
const LAST = 1919; // 07:59 logical (schedule.LAST; not imported to keep this module free of runtime model/schedule deps)
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UID = /^u-[a-z0-9]{1,8}$/, ITEM = /^[a-z0-9-]{1,24}$/, SID = /^[a-z0-9]{1,6}$/, TID = /^[a-z0-9]{1,8}$/, PACK = /^[a-z0-9-]{1,12}$/;

type R = Record<string, unknown>;
const isObj = (v: unknown): v is R => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const txt = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v: unknown): v is string => typeof v === "string" && ISO.test(v);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

function stepOf(v: unknown): Step | null {
  if (!isObj(v) || typeof v.id !== "string" || !SID.test(v.id) || !inList(TAGS, v.tag)) return null;
  const title = txt(v.title, 64); if (!title) return null;
  const s: Step = { id: v.id, title, tag: v.tag };
  if (v.cad !== undefined) s.cad = typeof v.cad === "string" && CAD_RE.test(v.cad) ? v.cad : "d";
  if (v.opt === true) s.opt = true;
  if (v.on === false) s.on = false;
  if (int(v.min, 0, 60)) s.min = v.min;
  const hint = txt(v.hint, 64); if (hint) s.hint = hint;
  if (inList(IRRITANTS, v.irr)) s.irr = v.irr;
  if (v.act === "journal") s.act = "journal";
  const product = txt(v.product, 8); if (product) s.product = product;
  const pack = txt(v.pack, 12); if (pack) s.pack = pack;
  if (v.ed === true) s.ed = true;
  return s;
}

function anchorOf(id: string, v: unknown): Anchor | null {
  if (!isObj(v)) return null;
  if ("host" in v) return (id === "prep" && v.host === "stream-prep") || (id === "pm" && v.host === "night") ? { host: v.host } : null;
  if ("item" in v) {
    const ids = arr(v.item).filter((x): x is string => typeof x === "string" && ITEM.test(x));
    if (ids.length < 1 || ids.length > 3 || ids.length !== arr(v.item).length || !int(v.off, -120, 240) || v.off % 5 !== 0) return null;
    return { item: [...ids], off: v.off, ...(v.end === true ? { end: true } : {}) };
  }
  if ("at" in v) return int(v.at, 480, LAST) ? { at: v.at } : null;
  return null;
}

// Preset ids plus up to 3 custom ids, unique; up to 20 steps per routine and 60 across all routines.
export function sanitizeRoutines(v: unknown): Routine[] {
  const out: Routine[] = [];
  let custom = 0, total = 0;
  for (const r of arr(v)) {
    if (!isObj(r) || typeof r.id !== "string" || out.some((x) => x.id === r.id)) continue;
    const preset = inList(PRESET_IDS, r.id);
    if (!preset && (!UID.test(r.id) || custom >= 3)) continue;
    const name = txt(r.name, 24); const anchor = anchorOf(r.id, r.anchor);
    if (!name || !anchor) continue;
    const steps: Step[] = [];
    for (const x of arr(r.steps)) {
      if (steps.length >= 20 || total >= 60) break;
      const s = stepOf(x);
      if (s && !steps.some((y) => y.id === s.id)) { steps.push(s); total++; }
    }
    if (!preset) custom++;
    const from = txt(r.from, 12);
    out.push({ id: r.id, name, anchor, remind: r.remind === true, on: r.on !== false, steps, ...(from ? { from } : {}) });
  }
  return out;
}

function taskOf(v: unknown): CareTask | null {
  if (!isObj(v) || typeof v.id !== "string" || !TID.test(v.id) || !int(v.every, 1, 365)) return null;
  const title = txt(v.title, 64); if (!title) return null;
  const t: CareTask = { id: v.id, title, tag: inList(TAGS, v.tag) ? v.tag : "body", every: v.every, on: v.on !== false };
  const hint = txt(v.hint, 64); if (hint) t.hint = hint;
  const pack = txt(v.pack, 12); if (pack) t.pack = pack;
  return t;
}

function productOf(v: unknown): Product | null {
  if (!isObj(v) || typeof v.id !== "string" || !TID.test(v.id)) return null;
  const name = txt(v.name, 40); if (!name) return null;
  const p: Product = { id: v.id, name, cat: inList(TAGS, v.cat) ? v.cat : "body" };
  if (iso(v.opened)) p.opened = v.opened;
  if (v.pao === 3 || v.pao === 6 || v.pao === 12 || v.pao === 24) p.pao = v.pao;
  if (iso(v.exp)) p.exp = v.exp;
  if (inList(IRRITANTS, v.irr)) p.irr = v.irr;
  if (v.low === true) p.low = true;
  if (iso(v.done)) p.done = v.done;
  if (isObj(v.patch) && iso(v.patch.start)) p.patch = { start: v.patch.start, ...(v.patch.res === "ok" || v.patch.res === "red" ? { res: v.patch.res } : {}) };
  return p;
}

const bpOf = (v: unknown): [number, number, string][] => arr(v)
  .filter((x): x is [number, number, string] => Array.isArray(x) && int(x[0], 70, 250) && int(x[1], 40, 150) && iso(x[2]))
  .map((x) => [x[0], x[1], x[2]] as [number, number, string])
  .sort((a, b) => a[2].localeCompare(b[2])).slice(-10);

function checkOf(v: unknown): Check | null {
  if (!isObj(v) || typeof v.id !== "string" || !TID.test(v.id) || !int(v.everyM, 0, 60)) return null;
  const name = txt(v.name, 40); if (!name) return null;
  const c: Check = { id: v.id, name, everyM: v.everyM };
  if (iso(v.last)) c.last = v.last;
  const bp = bpOf(v.bp); if (bp.length) c.bp = bp;
  if (v.flag === true) c.flag = true;
  const note = txt(v.note, 80); if (note) c.note = note;
  return c;
}

const uniqBy = <T extends { id: string }>(a: T[]) => a.filter((x, i) => a.findIndex((y) => y.id === x.id) === i);
const dateMap = (v: unknown, max: number): Record<string, string> => Object.fromEntries(
  Object.entries(isObj(v) ? v : {}).filter((e): e is [string, string] => e[0].length <= 32 && iso(e[1])).slice(0, max));

// Caps per the v1.7 spec 1.5; any invalid field falls back to its default. Always returns fresh objects.
export function sanitizeCare(v: unknown): Care {
  const r = isObj(v) ? v : {};
  const D = DEFAULT_CARE;
  const tr = isObj(r.track) ? r.track : {}, w = isObj(r.water) ? r.water : {}, cm = isObj(r.cafMg) ? r.cafMg : {};
  const chips = [...new Set(arr(w.chips).filter((x): x is number => int(x, 50, 2000) && x % 10 === 0))].sort((a, b) => a - b);
  let shelf = uniqBy(arr(r.shelf).map(productOf).filter((x): x is Product => !!x));
  while (shelf.length > 40) { const i = shelf.findIndex((p) => p.done); if (i < 0) break; shelf.splice(i, 1); }
  shelf = shelf.slice(-40);
  const ms = Object.fromEntries(Object.entries(isObj(r.ms) ? r.ms : {}).filter(([k, x]) => k.length <= 32 && (x === 1 || x === 2 || x === 3)).slice(0, 40)) as Record<string, 1 | 2 | 3>;
  const caf = (k: "c" | "t" | "e" | "p") => (int(cm[k], 0, 600) ? cm[k] as number : D.cafMg[k]);
  return {
    level: inList(LEVELS, r.level) ? r.level : null,
    asked: r.asked === true,
    packs: [...new Set(arr(r.packs).filter((x): x is string => typeof x === "string" && PACK.test(x)))].slice(0, 16),
    tasks: uniqBy(arr(r.tasks).map(taskOf).filter((x): x is CareTask => !!x)).slice(0, 30),
    last: dateMap(r.last, 60),
    track: { veg: tr.veg === true, urine: tr.urine === true, caf: tr.caf === true, walk: tr.walk === true, bowel: tr.bowel === true, sym: tr.sym === true },
    water: { plan: w.plan === true, live: w.live !== false, chips: chips.length >= 1 && chips.length <= 6 ? chips : [...D.water.chips] },
    cafMg: { c: caf("c"), t: caf("t"), e: caf("e"), p: caf("p") },
    shelf,
    checks: uniqBy(arr(r.checks).map(checkOf).filter((x): x is Check => !!x)).slice(0, 15),
    snooze: dateMap(r.snooze, 60),
    ms,
  };
}

// Later date per key, capped at `max` keys (latest dates kept).
function laterDates(a: Record<string, string>, b: Record<string, string>, max: number): Record<string, string> {
  const m: Record<string, string> = { ...b };
  for (const [k, d] of Object.entries(a)) if (!m[k] || d > m[k]) m[k] = d;
  const e = Object.entries(m);
  return Object.fromEntries(e.length > max ? e.sort((x, y) => y[1].localeCompare(x[1])).slice(0, max) : e);
}

// Newer config wins; last/snooze keep the later date per key; ms newer over older; bp readings unioned by date per check id.
export function mergeCare(newer: Care, older: Care): Care {
  return {
    ...newer,
    last: laterDates(newer.last ?? {}, older.last ?? {}, 60),
    snooze: laterDates(newer.snooze ?? {}, older.snooze ?? {}, 60),
    ms: Object.fromEntries(Object.entries({ ...older.ms, ...newer.ms }).slice(-40)),
    checks: (newer.checks ?? []).map((c) => {
      const o = older.checks?.find((x) => x.id === c.id);
      if (!o?.bp?.length) return c;
      const m = new Map(o.bp.map((x) => [x[2], x]));
      for (const x of c.bp ?? []) m.set(x[2], x);
      return { ...c, bp: [...m.values()].sort((a, b) => a[2].localeCompare(b[2])).slice(-10) };
    }),
  };
}

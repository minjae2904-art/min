import { ROLLOVER_HOUR, addDays, at, hm, sessionDelta } from "./date";
import { hasRequiredDaily, type Routine } from "./care/types";
import type { DayLog, ScheduleCfg, Taper } from "./model";
import { TEMPLATE_BY_ID, TERM_IDS } from "./templates";
import { classItems } from "./term";

export type Kind = "weigh" | "meal" | "supp" | "gym" | "habit" | "personality" | "trade" | "sleep" | "work" | "sing" | "mc" | "game" | "stream" | "care" | "class";
export type Ring = "food" | "body" | "habit";
export type Meal2 = "A" | "B" | "C";
export type DayType = string; // template id; "work" | "off" are the legacy built-in ids
export type Session = "ny";

export type Item = {
  id: string;
  min: number; // logical minutes (see date.ts)
  title: string;
  sub?: string;
  kind: Kind;
  ring?: Ring; // items without a ring are info-only (work start/end)
  remind?: boolean; // false = never notify for this item
  cue?: string; // habit stacking: the event this item follows
  custom?: boolean;
  dur?: number; // planned length in minutes; display + budget only
  endAt?: string; // block ends when the item with this id starts ("game" -> "game-stop", "stream" -> "stream-end")
  moves?: boolean; // non-ring item that still follows shiftMin + dayShift (game blocks, caffeine marker)
  defaultOff?: boolean; // part of the template but disabled until an override sets enabled: true
  session?: Session; // min is Bangkok time while New York is on EDT; +sessionDelta(date) when NY is on EST
  planMin?: number; // set only on an item moved for today (DayLog.moved): its planned minute, for display and undo
  routine?: string; // v1.7: self-care routine id this row hosts (r-* rows, or a hosted night / stream-prep row)
  carried?: true; // v1.7: moved here from yesterday by the evening "ปิดวัน" sheet (DayLog.carry)
};

export type PhaseDef = { key: string; at: string | [string, number]; label: string; tip: string; color: string }; // at = item id (+ offset minutes)
export type TemplateDef = {
  id: string; // /^[a-z0-9-]{1,24}$/, never ':' (override keys are `${id}:${itemId}`)
  name: string; // Thai name shown in the picker/briefing
  short: string; // one-line Thai tagline
  color: string; // css var for dot/timeline
  base: "work" | "off"; // which baseDay() body supplies the core
  work: boolean; // contains the 16:00-02:00 shift -> meal2 A/B/C sheet, work copy
  legacy?: boolean; // only "work" and "off": hard-coded phases + v1.0 briefing text
  patch?: Record<string, Partial<Pick<Item, "min" | "title" | "sub" | "kind" | "dur" | "session" | "defaultOff">>>;
  drop?: string[]; // only "cardio" / "gym"; health-core ids are never dropped
  add?: Item[];
  cues?: Record<string, string>; // per-template cue overrides on top of CUES
  phases?: PhaseDef[]; // absent -> hard-coded branch in phase.ts chosen by `base`
  season?: "stream"; // v1.4: sleep taper applies, wake never shifts the day, brain rest -> stream-rest
};

export const MEAL2_LABEL: Record<Meal2, string> = {
  A: "กินข้าวตอนพัก 21:00",
  B: "กิน whey แทน",
  C: "รอกินก่อนเข้ายิม",
};

// Habit stacking / implementation intentions: each habit hangs on an event that already happens.
// Research: event-based cues build automaticity better than clock-time reminders.
export const CUES: Record<string, string> = {
  weigh: "ทันทีที่ตื่น หลังเข้าห้องน้ำ",
  posture: "หลังชั่งน้ำหนัก",
  supp1: "พร้อมมื้อหลัก 1",
  persona: "หลังมื้อแรก ก่อนหยิบมือถือ",
  supp2: "ก่อนเลิกงาน 30 นาที",
  trade: "หลังฝึกบุคลิกภาพ เปิดกราฟดูแผนก่อน",
  supp3: "ทันทีที่จบเซ็ตสุดท้าย",
  night: "หลังกินมื้อ 3",
  sleep: "หลังเขียน journal",
  sing: "หลังมื้อแรกราว 1 ชม.",
  "mc-check": "หลังกินมื้อแรก",
  mc: "หลังร้องเพลง",
  mc2: "หลัง whey",
  presleep: "หลังหยุดเกมแข่ง",
  review: "หลังเช็กเซิฟ",
};

export const LAST = (ROLLOVER_HOUR + 24) * 60 - 1; // 07:59, the last minute of a logical day

// v1.4 sleep advance: extra shift for season templates; 0 before start, on/after stop, after it reaches 0, or with no date.
// Noon UTC on both dates gives the same day count on the UTC server and the phone.
export function taperShift(t: Taper | null | undefined, date: string | undefined): number {
  if (!t || !date || date < t.start || (t.stop !== undefined && date >= t.stop)) return 0;
  const k = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(t.start + "T12:00:00Z")) / 86_400_000);
  return Math.max(0, t.fromMin - t.stepMin * k);
}
export const taperDone = (t: Taper) => addDays(t.start, Math.ceil(t.fromMin / t.stepMin)); // first date back on plan

// v1.4: "{id}" or "{id+N}" in a sub or phase tip becomes that item's built time (shift and taper included), so
// pushes and the list never show a stale clock time. Anchors include disabled items; unknown ids stay as written.
const TOKEN = /\{([a-z0-9-]+)(?:\+(\d+))?\}/g;
export function fillTimes(text: string, anchors: ReadonlyMap<string, number>): string {
  if (!text.includes("{")) return text;
  return text.replace(TOKEN, (m, id: string, off?: string) => {
    const v = anchors.get(id);
    return v === undefined ? m : hm(v + Number(off ?? 0));
  });
}

// Template id -> its definition. A user copy takes its built-in's definition under its own key;
// an unknown or deleted id falls back to the legacy off day. Pure, never throws.
export function resolveTemplate(cfg: ScheduleCfg | undefined, id: string): { key: string; def: TemplateDef } {
  const b = TEMPLATE_BY_ID.get(id); if (b) return { key: id, def: b };
  const u = cfg?.templates?.find((t) => t.id === id); const from = u && TEMPLATE_BY_ID.get(u.from);
  if (u && from) return { key: u.id, def: { ...from, id: u.id, name: u.name } };
  return { key: "off", def: TEMPLATE_BY_ID.get("off")! };
}
export const templateExists = (cfg: ScheduleCfg | undefined, id: string) =>
  TEMPLATE_BY_ID.has(id) || !!cfg?.templates?.some((t) => t.id === id && TEMPLATE_BY_ID.has(t.from));

// baseDay body of the template's base with its drop/patch/add applied; NY-session items move with US DST.
// Legacy work/off have no patch, so their output equals baseDay().
function templateItems(def: TemplateDef, meal2: Meal2 | undefined, date: string | undefined): Item[] {
  return baseDay(def.base, def.work ? meal2 : undefined)
    .filter((i) => !def.drop?.includes(i.id))
    .map((i) => (def.patch?.[i.id] ? { ...i, ...def.patch[i.id] } : i))
    .concat(def.add ?? [])
    .map((i) => (i.session ? { ...i, min: i.min + sessionDelta(date, i.session) } : i))
    .sort((a, b) => a.min - b.min);
}

export type BuildOpt = { date?: string; all?: boolean }; // all = include defaultOff items (editor)

// Every ring item at its configured time plus the shift it asks for: base and custom items take the global
// shift + dayShift; overrides are absolute (the global shift is already in them), so only dayShift moves them.
// Non-ring `moves` items (game blocks, caffeine marker) shift like ring items; work start/end never move.
// latest = the latest ring item that fits before 07:59 without its shift (others get pinned, see buildDay).
function requested(type: DayType, meal2: Meal2 | undefined, cfg: ScheduleCfg, dayShift: number, opt: BuildOpt = {}) {
  const { key, def } = resolveTemplate(cfg, type);
  const ds = dayShift + (def.season === "stream" ? taperShift(cfg.taper, opt.date) : 0); // taper acts as an extra today-only shift
  const req = cfg.shiftMin + ds;
  const out: Item[] = [];
  const own = new Map<Item, number>(); // moving item -> the shift it asked for
  const anchors = new Map<string, number>(); // every template item's time, disabled ones too (fillTimes)
  const moving = new Map<string, number>(); // moving template id -> the shift its anchor asked for
  for (const i of templateItems(def, meal2, opt.date)) {
    const o = cfg.overrides[`${key}:${i.id}`] ?? {};
    const moves = !!(i.ring || i.moves);
    const a = o.min !== undefined ? ds : moves ? req : 0;
    anchors.set(i.id, (o.min ?? i.min) + a);
    if (moves) moving.set(i.id, a);
    if (o.enabled === false || (o.enabled === undefined && i.defaultOff && !opt.all)) continue;
    const item = { ...i, min: (o.min ?? i.min) + a, title: o.title || i.title, remind: o.remind ?? true, cue: def.cues?.[i.id] ?? CUES[i.id] };
    out.push(item);
    if (moves) own.set(item, a);
  }
  for (const c of cfg.custom) {
    if (c.days !== "both" && c.days !== key && (def.season || c.days !== def.base)) continue; // legacy "work"/"off" = every template of that base (never season days)
    const o = cfg.overrides[`${key}:${c.id}`] ?? {};
    const item: Item = { id: c.id, title: c.title, sub: c.sub, min: c.min + req, kind: c.ring === "food" ? "meal" : "habit", ring: c.ring, remind: o.remind ?? true, custom: true };
    out.push(item);
    own.set(item, req);
  }
  const latest = Math.max(0, ...[...own].filter(([i, a]) => i.min - a <= LAST).map(([i]) => i.min));
  return { out, own, req, latest, anchors, moving };
}

// Items plus the time anchors of the same build (trim applied to both).
function built(type: DayType, meal2: Meal2 | undefined, cfg: ScheduleCfg | undefined, dayShift: number, opt: BuildOpt) {
  if (!cfg) {
    const all = templateItems(resolveTemplate(undefined, type).def, meal2, opt.date);
    return { out: all.filter((i) => opt.all || !i.defaultOff), anchors: new Map(all.map((i) => [i.id, i.min])) };
  }
  const { out, own, req, latest, anchors, moving } = requested(type, meal2, cfg, dayShift, opt);
  const cut = Math.min(Math.max(0, latest - LAST), Math.max(0, req));
  for (const i of own.keys()) i.min = Math.min(i.min - cut, LAST);
  for (const id of moving.keys()) anchors.set(id, Math.min(anchors.get(id)! - cut, LAST));
  const key = resolveTemplate(cfg, type).key;
  const base = cfg.templates?.find((t) => t.id === key)?.from ?? key;
  // v1.8 08:00 floor (term templates only; earlier templates keep their pre-08:00 behaviour): a negative shift that would put
  // the earliest ring item before the logical day start is reduced so the whole day lands at 08:00. Never pins single items.
  let lift = 0;
  if (TERM_IDS.has(base)) {
    const ring = [...own.keys()].filter((i) => i.ring);
    const low = ring.length ? Math.min(...ring.map((i) => i.min)) : ROLLOVER_HOUR * 60;
    if (low < ROLLOVER_HOUR * 60) lift = Math.min(ROLLOVER_HOUR * 60 - low, Math.max(0, -Math.min(0, ...own.values())));
    // Each item is lifted by no more than the negative shift it asked for, so an absolute override keeps its set minute.
    const up = (a: number) => Math.min(lift, Math.max(0, -a));
    if (lift) {
      for (const [i, a] of own) i.min = Math.min(i.min + up(a), LAST);
      for (const [id, a] of moving) anchors.set(id, Math.min(anchors.get(id)! + up(a), LAST));
    }
  }
  if (cfg.care?.length) placeRoutines(out, cfg.care, req - cut + Math.min(lift, Math.max(0, -req)), !!opt.all, base === "rest" || base === "stream-rest" || base === "term-rest");
  return { out, anchors };
}

// v1.7 self-care rows. Placed after the trim, so anchors, latest and phases never see them. A host routine (prep/pm) renames
// its host row and keeps its id, time, ring, kind, reminder, cue and length; other routines push an "r-" row after their anchor,
// clamped to [first non-care row + 5, 07:59] so a care row is never items[0] (wake lookups). Rows depend only on the plan,
// never on the date or step cadence. On a rest template the cardio item is a light optional walk, so it anchors nothing.
const CARE_CUE: Record<string, string> = { weigh: "หลังชั่งน้ำหนัก", gym: "หลังยิม", cardio: "หลังคาร์ดิโอ", meal1: "หลังมื้อ 1", meal2: "หลังมื้อ 2", meal3: "หลังมื้อเย็น", night: "ก่อนอาบน้ำ", "stream-prep": "ก่อนเตรียมไลฟ์" };
function placeRoutines(out: Item[], list: Routine[], shift: number, all: boolean, restDay: boolean) {
  for (const r of list) {
    if (!r.on && !all) continue;
    if (!all && !hasRequiredDaily(r)) continue;
    const an = r.anchor;
    if ("host" in an) {
      const h = out.find((i) => i.id === an.host);
      if (!h || !r.on) continue;
      h.routine = r.id; h.title = r.name; delete h.sub;
      const sl = out.find((i) => i.kind === "sleep");
      if (an.host === "night" && sl && sl.cue === CUES.sleep) sl.cue = "หลังกิจวัตรก่อนนอน";
      continue;
    }
    const rows = out.filter((i) => i.kind !== "care");
    if (!rows.length) continue;
    const first = Math.min(...rows.map((i) => i.min));
    let base: number, cue: string | undefined, off = 0;
    if ("item" in an) {
      const a = an.item.map((id) => (restDay && id === "cardio" ? undefined : out.find((i) => i.id === id))).find((i) => !!i);
      if (!a) continue;
      off = an.off;
      base = an.end ? blockEnd(out, a) ?? a.min : a.min;
      cue = CARE_CUE[a.id] ?? `${off < 0 ? "ก่อน" : "หลัง"}${a.title}`;
    } else base = an.at + shift;
    const min = Math.max(first + 5, Math.min(LAST, base + off));
    const dur = r.steps.filter((s) => s.on !== false).reduce((n, s) => n + (s.min ?? 0), 0) || 10;
    out.push({ id: "r-" + r.id, min, title: r.name, kind: "care", ring: "habit", remind: r.remind, routine: r.id, ...(cue ? { cue } : {}), dur, ...(r.on ? {} : { defaultOff: true }) });
  }
}

// The day as the user configured it: base template + shift offset + per-item overrides + custom items.
// dayShift = today-only offset on top of the global shift (set from the wake-up button).
// Shift rule: all ring items move by the same amount, so their order never changes. A positive total shift
// is trimmed as one block, never below 0, so the latest ring item stays at or before 07:59; a zero or negative
// shift is never changed. A ring item past 07:59 even without the shift is pinned at 07:59 and trims nothing.
export function buildDay(type: DayType, meal2?: Meal2, cfg?: ScheduleCfg, dayShift = 0, opt: BuildOpt = {}): Item[] {
  const { out, anchors } = built(type, meal2, cfg, dayShift, opt);
  return out.map((i) => (i.sub?.includes("{") ? { ...i, sub: fillTimes(i.sub, anchors) } : i)).sort((a, b) => a.min - b.min);
}
// Time anchors of the day itemsFor builds (phase tips fill their "{id}" tokens from these).
export function anchorsFor(cfg: ScheduleCfg, d: Pick<DayLog, "type" | "meal2" | "shiftMin">, date?: string): ReadonlyMap<string, number> {
  return built(d.type, d.meal2, cfg, d.shiftMin ?? 0, { date }).anchors;
}

// Largest today-only shift buildDay applies untrimmed (minutes before the latest ring item reaches 07:59).
export function maxDayShift(type: DayType, meal2: Meal2 | undefined, cfg: ScheduleCfg): number {
  return Math.max(0, LAST - requested(type, meal2, cfg, 0).latest);
}

// Items that can be snoozed, moved or skipped for today. weigh anchors the phases, sleep has its own button, and an endAt
// item starts a block (stream -> stream-end) whose end, phases and reminders would be left behind.
export const canReschedule = (i: Item) => !!i.ring && !i.endAt && i.kind !== "weigh" && i.kind !== "sleep";

// The day's list as shown and scored: a voice-rest day hides the singing items; items carried from yesterday are appended;
// today-only skips are dropped and moved items take their new minute (planMin keeps the plan). Invalid stored values are ignored.
export function itemsFor(cfg: ScheduleCfg, d: Pick<DayLog, "type" | "meal2" | "shiftMin" | "voiceRest" | "moved" | "skip" | "carry">, date?: string): Item[] {
  let list = buildDay(d.type, d.meal2, cfg, d.shiftMin ?? 0, { date }).filter((i) => !(d.voiceRest && i.kind === "sing"));
  // v1.8 class rows of a term day (info only, no ring); the sort is stable, so template rows stay first at equal minutes.
  if (date && cfg.term) {
    const cls = classItems(cfg.term, date);
    if (cls.length) list = [...list, ...cls].sort((a, b) => a.min - b.min);
  }
  if (d.carry && typeof d.carry === "object") {
    let added = false;
    // Like care rows, a carried row sits at least 5 min after the day's first row, so it is never items[0] (wake lookups).
    const low = Math.max(ROLLOVER_HOUR * 60, (list.find((i) => i.kind !== "care" && i.kind !== "class")?.min ?? 0) + 5);
    for (const [id, v] of Object.entries(d.carry).slice(0, 3)) {
      if (!Array.isArray(v) || typeof v[0] !== "string" || !Number.isFinite(v[1]) || list.some((i) => i.id === id)) continue;
      if (!templateExists(cfg, v[0])) continue;
      const it = buildDay(v[0], undefined, cfg, 0, { date }).find((i) => i.id === id);
      if (!it?.ring || !canReschedule(it) || it.kind === "care" || (d.voiceRest && it.kind === "sing")) continue;
      const c: Item = { ...it, min: Math.max(low, Math.min(LAST, Math.round(v[1]))), carried: true };
      delete c.planMin;
      list.push(c); added = true;
    }
    if (added) list.sort((a, b) => a.min - b.min);
  }
  if (d.skip) list = list.filter((i) => !(d.skip![i.id] && canReschedule(i)));
  if (!d.moved) return list;
  let any = false;
  list = list.map((i) => {
    const v = d.moved![i.id];
    if (!Number.isInteger(v) || v < ROLLOVER_HOUR * 60 || v > LAST || !canReschedule(i)) return i;
    any = true;
    return { ...i, min: v, planMin: i.min };
  });
  return any ? list.sort((a, b) => a.min - b.min) : list;
}
// Minute a block ends: its endAt item (fallback 2 h before sleep), else min + dur, else 75 min for gym.
export function blockEnd(items: Item[], i: Item): number | undefined {
  if (i.endAt) return items.find((x) => x.id === i.endAt)?.min ?? (items.find((x) => x.kind === "sleep")?.min ?? LAST) - 120;
  if (i.dur !== undefined) return i.min + i.dur;
  return i.kind === "gym" ? i.min + 75 : undefined;
}
export const gymItemOf = (items: Item[]) => items.find((i) => i.id === "gym") ?? items.find((i) => i.kind === "gym");

// Night shift 16:00-02:00, gym right after work. See research/system-design.md section 2.
export function baseDay(type: DayType, meal2?: Meal2): Item[] {
  if (type === "off") {
    return [
      { id: "weigh", min: at(13), title: "ตื่น + ชั่งน้ำหนัก", sub: "ก่อนกิน หลังเข้าห้องน้ำ", kind: "weigh", ring: "body" },
      { id: "posture", min: at(13, 10), title: "Chin tuck + Wall angel", sub: "อย่างละ 10 ครั้ง", kind: "habit", ring: "habit" },
      { id: "meal1", min: at(13, 30), title: "มื้อหลัก 1", sub: "มื้อใหญ่สุดของวัน", kind: "meal", ring: "food" },
      { id: "supp1", min: at(13, 30), title: "Whey #1 + Creatine", sub: "creatine 3-5 g", kind: "supp", ring: "food" },
      { id: "persona", min: at(14, 30), title: "ฝึกบุคลิกภาพ", kind: "personality", ring: "habit" },
      { id: "trade", min: at(15, 15), title: "เทรด 1 ไม้ตามแผน", sub: "ไม่มีจังหวะ = ไม่เข้า ก็นับว่าทำแล้ว", kind: "trade", ring: "habit" },
      { id: "cardio", min: at(16), title: "เทนนิส / คาร์ดิโอ / พัก", sub: "ทากันแดด + น้ำเพิ่ม", kind: "gym", ring: "body" },
      { id: "meal2", min: at(18, 30), title: "มื้อหลัก 2", kind: "meal", ring: "food" },
      { id: "snack", min: at(22), title: "ของว่าง / Whey", kind: "supp", ring: "food" },
      { id: "meal3", min: at(1), title: "มื้อหลัก 3", kind: "meal", ring: "food" },
      { id: "night", min: at(4, 30), title: "Skincare + Journal", sub: "ดีวันนี้ 1 / แก้ 1 / ขอบคุณ 1", kind: "habit", ring: "habit" },
      { id: "sleep", min: at(5), title: "นอน", sub: "ห้องมืด ปิดเสียง", kind: "sleep", ring: "habit" },
    ];
  }

  const c = meal2 === "C";
  const items: Item[] = [
    { id: "weigh", min: at(13), title: "ตื่น + ชั่งน้ำหนัก", sub: "ก่อนกิน หลังเข้าห้องน้ำ", kind: "weigh", ring: "body" },
    { id: "posture", min: at(13, 10), title: "Chin tuck + Wall angel", sub: "อย่างละ 10 ครั้ง", kind: "habit", ring: "habit" },
    { id: "meal1", min: at(13, 30), title: "มื้อหลัก 1", sub: "มื้อใหญ่สุด ~900 kcal", kind: "meal", ring: "food" },
    { id: "supp1", min: at(13, 30), title: "Whey #1 + Creatine", sub: "creatine 3-5 g", kind: "supp", ring: "food" },
    { id: "persona", min: at(14, 15), title: "ฝึกบุคลิกภาพ", sub: "30-45 นาที", kind: "personality", ring: "habit" },
    { id: "trade", min: at(15), title: "เทรด 1 ไม้ตามแผน", sub: "ไม่มีจังหวะ = ไม่เข้า ก็นับว่าทำแล้ว", kind: "trade", ring: "habit" },
    { id: "snack", min: at(15, 30), title: "ของว่างก่อนเข้างาน", sub: "นม / กล้วย / แซนด์วิช", kind: "meal", ring: "food" },
    { id: "work-in", min: at(16), title: "เข้างาน", kind: "work" },
    { id: "meal2", min: at(21), title: "มื้อหลัก 2", sub: meal2 ? MEAL2_LABEL[meal2] : "แตะเพื่อเลือกแบบ", kind: "meal", ring: "food" },
    { id: "work-out", min: at(2), title: "เลิกงาน", kind: "work" },
    { id: "gym", min: c ? at(3) : at(2, 30), title: "เข้ายิม", kind: "gym", ring: "body" },
    { id: "supp3", min: c ? at(4, 15) : at(3, 45), title: "Whey #3 หลังยิม", kind: "supp", ring: "food" },
    { id: "meal3", min: c ? at(4, 30) : at(4), title: "มื้อหลัก 3", sub: c ? "มื้อเบา (กินก่อนยิมแล้ว)" : "ย่อยง่าย ไม่มันจัด", kind: "meal", ring: "food" },
    { id: "night", min: c ? at(5) : at(4, 30), title: "อาบน้ำ + Skincare + Journal", kind: "habit", ring: "habit" },
    { id: "sleep", min: c ? at(5, 30) : at(5), title: "นอน 8 ชม.", sub: "ห้องมืด ปิดเสียง", kind: "sleep", ring: "habit" },
  ];
  if (meal2 === "B") items.push({ id: "snack-b", min: at(23, 45), title: "ของว่างชดเชย ~500 kcal", sub: "นม + ขนมปังเนยถั่ว", kind: "meal", ring: "food" });
  if (meal2 === "C") items.push({ id: "meal2c", min: at(2, 5), title: "กินข้าวก่อนยิม", sub: "ไม่ต้องหนักมาก", kind: "meal", ring: "food" });
  else items.push({ id: "supp2", min: at(1, 30), title: "Whey #2 + กล้วย", sub: "ก่อนยิม 30-60 นาที", kind: "supp", ring: "food" });
  // C moves the meal to 02:05 (meal2c), so the 21:00 slot is dropped rather than left undone.
  return items.filter((i) => !(meal2 === "C" && i.id === "meal2")).sort((a, b) => a.min - b.min);
}

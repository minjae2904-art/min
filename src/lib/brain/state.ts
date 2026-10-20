// Brain sub-state: repair on read (normalize) and union on merge (mergeStates). Type-only imports from model.
import { AREAS, DEFAULT_BRAIN, MICRO_STEP_IDS, TIP_IDS, type AppliedRec, type BrainAction, type BrainOp, type Brain, type Decision, type Deload, type Focus } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AID = /^a-[a-z0-9]{1,16}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 64): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const int = (v: unknown): v is number => Number.isInteger(v);
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

// Shape guard: known `k` with correctly typed fields only. Bounds are checked by compileAction.
export function isBrainAction(a: unknown): a is BrainAction {
  if (!isObj(a)) return false;
  switch (a.k) {
    case "move_item": return str(a.tpl, 24) && str(a.item) && int(a.delta);
    case "reset_time": return str(a.tpl, 24) && str(a.item);
    case "toggle_item": case "set_reminder": return str(a.tpl, 24) && str(a.item) && typeof a.on === "boolean";
    case "set_day_template": return isDate(a.date) && str(a.tpl, 24);
    case "set_week_slot": return int(a.dow) && str(a.tpl, 24);
    case "set_voice_rest": return isDate(a.date);
    case "set_game_break": return a.min === 60 || a.min === 90;
    case "set_water_goal": return a.ml === 0;
    case "set_water_every": return a.min === 60 || a.min === 90 || a.min === 120;
    case "kcal_adjust": return int(a.delta);
    case "plan_deload": return isDate(a.from) && (a.days === 1 || a.days === 7);
    case "set_flag": return a.key === "notifyLastMatch" && a.on === true;
    case "focus_step": return inList(AREAS, a.area) && inList(MICRO_STEP_IDS, a.ref);
    case "tip": return inList(TIP_IDS, a.ref);
    default: return false;
  }
}

const SETTING_KEYS = ["gameBreakMin", "waterGoalMl", "waterEveryMin", "kcalAdjust", "notifyLastMatch"] as const;
const numBool = (v: unknown) => fin(v) || typeof v === "boolean";
export function isOp(o: unknown): o is BrainOp {
  if (!isObj(o)) return false;
  switch (o.t) {
    case "override": return str(o.key, 80) && o.key.includes(":") && (o.field === "min" || o.field === "enabled" || o.field === "remind")
      && (o.before === undefined || numBool(o.before)) && (o.after === undefined || numBool(o.after));
    case "dayType": return isDate(o.date) && (o.before === null || str(o.before, 24)) && (o.after === null || str(o.after, 24)) && typeof o.created === "boolean";
    case "voiceRest": return isDate(o.date) && typeof o.before === "boolean" && typeof o.after === "boolean" && typeof o.created === "boolean";
    case "weekPlan": return int(o.dow) && o.dow >= 0 && o.dow <= 6 && (o.before === null || str(o.before, 24)) && (o.after === null || str(o.after, 24));
    case "setting": return inList(SETTING_KEYS, o.key) && numBool(o.before) && numBool(o.after);
    case "brain": return (o.key === "deload" || o.key === "focus") && "before" in o && "after" in o;
    default: return false;
  }
}

const focusOf = (v: unknown): Focus | null =>
  isObj(v) && inList(AREAS, v.area) && str(v.ref) && isDate(v.from) && isDate(v.to) ? { area: v.area, ref: v.ref, from: v.from, to: v.to } : null;
const deloadOf = (v: unknown): Deload | null => (isObj(v) && isDate(v.from) && isDate(v.to) && v.from <= v.to ? { from: v.from, to: v.to } : null);
const VERDICTS = ["better", "same", "worse", "nodata"] as const;

function appliedOf(v: unknown): AppliedRec | null {
  if (!isObj(v) || !str(v.id) || !AID.test(v.id) || !fin(v.at) || !isDate(v.date) || !str(v.cid, 80) || !str(v.rule, 8) || !inList(AREAS, v.area)) return null;
  const actions = (Array.isArray(v.actions) ? v.actions : []).filter(isBrainAction).slice(0, 4);
  const ops = (Array.isArray(v.ops) ? v.ops : []).filter(isOp).slice(0, 6);
  if (!actions.length) return null;
  if (!ops.length && !actions.every((a) => a.k === "tip" || a.k === "focus_step")) return null;
  const e = v.eval;
  const ev = isObj(e) && str(e.metric) && fin(e.windowDays) && (e.dir === 1 || e.dir === -1) && fin(e.min) && (e.base === null || fin(e.base))
    ? { metric: e.metric, windowDays: e.windowDays, dir: e.dir as 1 | -1, min: e.min, base: e.base as number | null } : null;
  const r: AppliedRec = { id: v.id, cid: v.cid, rule: v.rule, area: v.area, at: v.at, date: v.date, actions, ops, eval: ev };
  if (fin(v.undoneAt)) r.undoneAt = v.undoneAt;
  if (typeof v.kept === "boolean") r.kept = v.kept;
  if (inList(VERDICTS, v.outcome)) r.outcome = v.outcome;
  return r;
}
function decisionOf(v: unknown): Decision | null {
  if (!isObj(v) || !str(v.sig, 80) || !str(v.rule, 8) || !fin(v.at) || !(v.d === "a" || v.d === "r" || v.d === "s" || v.d === "m" || v.d === "u")) return null;
  const d: Decision = { sig: v.sig, rule: v.rule, d: v.d, at: v.at };
  if (str(v.cid, 80)) d.cid = v.cid;
  if (v.reason === 1 || v.reason === 2 || v.reason === 3) d.reason = v.reason;
  return d;
}
const weekOf = (v: unknown): (string | number)[] | null =>
  Array.isArray(v) && v.length === 11 && isDate(v[0]) && v.slice(1).every(fin) ? [...v] : null;

const capApplied = (a: AppliedRec[]) => a.sort((x, y) => y.at - x.at).slice(0, 20);
const capDecisions = (a: Decision[]) => a.sort((x, y) => y.at - x.at).slice(0, 40);
const capWeeks = (a: (string | number)[][]) => a.sort((x, y) => String(x[0]).localeCompare(String(y[0]))).slice(-12);
// Mutes first, then the latest dates, so expired snoozes are the ones dropped.
const capSnooze = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).sort(([, a], [, b]) => (b === "mute" ? "9" : b).localeCompare(a === "mute" ? "9" : a)).slice(0, 60));

export function sanitizeBrain(raw: unknown): Brain {
  if (!isObj(raw)) return { ...DEFAULT_BRAIN, applied: [], decisions: [], snooze: {}, weeks: [] };
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const applied = arr(raw.applied).map(appliedOf).filter((x): x is AppliedRec => !!x).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  const snooze: Record<string, string> = {};
  if (isObj(raw.snooze)) for (const [k, v] of Object.entries(raw.snooze)) if (k.length <= 80 && (v === "mute" || isDate(v))) snooze[k] = v as string;
  return {
    v: 1,
    applied: capApplied(applied),
    decisions: capDecisions(arr(raw.decisions).map(decisionOf).filter((x): x is Decision => !!x)),
    snooze: capSnooze(snooze),
    focus: focusOf(raw.focus),
    deload: deloadOf(raw.deload),
    weeks: capWeeks(arr(raw.weeks).map(weekOf).filter((x): x is (string | number)[] => !!x)),
    reviewDone: typeof raw.reviewDone === "string" ? raw.reviewDone.slice(0, 10) : "",
    reviewFocus: inList(AREAS, raw.reviewFocus) ? raw.reviewFocus : null,
  };
}

// Both devices changed: logs of decisions are unioned; focus/deload/reviewFocus are levers and follow `newer` (like settings).
export function mergeBrain(newer: Brain, older: Brain): Brain {
  const rank = (r: AppliedRec) => (r.undoneAt ? 4 : 0) + (r.outcome ? 2 : 0) + (r.kept !== undefined ? 1 : 0);
  const applied = new Map<string, AppliedRec>();
  for (const r of [...older.applied, ...newer.applied]) {
    const o = applied.get(r.id);
    if (!o || rank(r) >= rank(o)) applied.set(r.id, r);
  }
  const decisions = new Map<string, Decision>();
  for (const d of [...older.decisions, ...newer.decisions]) decisions.set(`${d.at}|${d.sig}|${d.d}`, d);
  const snooze: Record<string, string> = { ...older.snooze };
  for (const [k, v] of Object.entries(newer.snooze)) {
    const o = snooze[k];
    snooze[k] = o === "mute" || v === "mute" ? "mute" : !o || v > o ? v : o;
  }
  const weeks = new Map<string, (string | number)[]>();
  for (const w of [...older.weeks, ...newer.weeks]) weeks.set(String(w[0]), w);
  return {
    v: 1,
    applied: capApplied([...applied.values()]),
    decisions: capDecisions([...decisions.values()]),
    snooze: capSnooze(snooze),
    focus: newer.focus,
    deload: newer.deload,
    weeks: capWeeks([...weeks.values()]),
    reviewDone: newer.reviewDone > older.reviewDone ? newer.reviewDone : older.reviewDone,
    reviewFocus: newer.reviewFocus ?? null,
  };
}

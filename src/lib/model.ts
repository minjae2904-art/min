// Data model shared by the client store and server routes (no React, no "use client").
import { DEFAULT_PROFILE, type Profile } from "./health";
import type { LogEntry } from "./rotation";
import { templateExists, type DayType, type Meal2, type Ring } from "./schedule";
import { BUILTIN_IDS } from "./templates";
import { mergeBrain, sanitizeBrain } from "./brain/state";
import { AREAS, DEFAULT_BRAIN, type AreaKey, type Brain } from "./brain/types";
import { DEFAULT_CARE, mergeCare, sanitizeCare, sanitizeRoutines, type Care, type Routine } from "./care/types";
import { sanitizeTerm } from "./term";
import { isLang, isLangPref, type Lang, type LangPref } from "../i18n/core";
export { GO_DEFAULT } from "./term"; // defined in term.ts so term.ts never imports model.ts at runtime

export type DayLog = {
  type: DayType;
  done: Record<string, number>; // item id -> timestamp
  doneSrc?: Record<string, { src: TickSrc; ts: number }>; // ticks > 60 min late only (ticks.ts); valid while ts === done[id]
  meal2?: Meal2;
  waterMl: number;
  checkin?: { mood: number; energy: number; sleep: number; at?: number }; // 1-5, after waking; at = saved (epoch ms, never sent to AI)
  journal?: { good: string; fix: string; thanks: string }; // evening reflection
  trade?: TradeLog;
  wakeAt?: number; // epoch ms when "ตื่นแล้ว" was pressed
  sleepAt?: number; // epoch ms when "เข้านอน" was pressed
  shiftMin?: number; // today-only schedule shift (e.g. woke up 45 min late)
  dndBefore?: number; // settings.dndUntil before "เข้านอน" paused reminders, restored by "ยังไม่นอน"
  voiceRest?: boolean; // true = hide kind "sing" items today (and do not score them)
  gameOver?: 0 | 30 | 60; // optional chip after a late game night: played past the plan by ~N min
  sing?: { min?: 10 | 20 | 30 | 45; strain?: boolean }; // optional singing chips (minutes sung, hoarse/strained)
  moved?: Record<string, number>; // item id -> logical minute today (snooze / move); the template keeps the planned time
  skip?: Record<string, number>; // item id -> epoch ms of "ข้ามวันนี้": hidden, not scored, no reminders
  reschedAt?: number; // epoch ms of the last moved/skip change: the merge clock for those two maps
  // ---- v1.7 Round C (readers guard every type; DayLog internals are not sanitised) ----
  care?: Record<string, string>; // routine id -> "cl,spf,br,-ret" (ticked step ids; "-id" = optional/cadence step skipped tonight)
  skipWhy?: Record<string, SkipWhy>; // reason for a DayLog.skip entry (same reschedAt clock)
  carry?: Record<string, [string, number]>; // on TOMORROW's log: item id -> [source template key, logical minute]
  hot?: number; // epoch of the "hot/outdoor today" tap
  irr?: true; // skin irritated today: strong actives rest 2 nights
  veg?: number; // fruit/veg servings 0-5
  urine?: 1 | 2 | 3;
  caf?: { c?: number; t?: number; e?: number; p?: number; late?: number; pl?: number }; // drink counts; late = coffee/tea/energy past the cutoff; pl = pre-workout past its cutoff
  walk?: 1 | 2 | 3;
  bowel?: 1 | 2 | 3;
  sym?: Sym[];
  breaks?: number; // live breaks taken
  live?: LiveLog;
  planAt?: number; // morning "วางแผนวันนี้" done
  shutAt?: number; // evening "ปิดวัน" done
  sore?: 0 | 1 | 2; // v1.8 morning muscle soreness chip (Ready); readers guard the type
};

export type SkipWhy = "rest" | "sick" | "travel" | "na";
export const SYMS = ["voice", "head", "eye", "ear", "skin", "sick"] as const; export type Sym = (typeof SYMS)[number];
// Real live minutes of the day (session engine): n sessions, first start, latest end, cues ok/seen, breaks, clip marks (elapsed min).
export type LiveLog = { min: number; n: number; at: number; end: number; ok: number; seen: number; br: number; mk?: number[]; mood?: 1 | 2 | 3; v?: 0 | 1 | 2 };

// How a late tick's time was set: late = not confirmed (defaulted to now), plan = "ทำตรงเวลา", now = "เพิ่งทำ", pick = time picker.
export type TickSrc = "late" | "plan" | "now" | "pick";

// count 0 + "skip" = looked at the chart, no setup, stayed out (discipline counts as done).
export type TradeResult = "win" | "loss" | "be" | "open" | "skip";
export type TradeLog = { count: number; result: TradeResult; note?: string; gate?: number }; // gate bits: 1 plan, 2 stop, 4 size

// days = a template key, "both", or legacy "work"/"off" (= every template whose base is that value)
export type CustomItem = { id: string; title: string; sub?: string; min: number; ring: Ring; days: string };
export type ItemOverride = { enabled?: boolean; min?: number; remind?: boolean; title?: string };
export type ScheduleCfg = {
  shiftMin: number; // move every personal item (not work start/end) by N minutes
  overrides: Record<string, ItemOverride>; // key: `${dayType}:${itemId}`
  custom: CustomItem[];
  templates?: UserTemplate[]; // optional in the type (test literals omit it); normalize() always fills it
  taper?: Taper | null; // v1.4 sleep advance on season templates (schedule.ts taperShift); never written into DayLog
  care?: Routine[]; // v1.7 self-care routines; optional in the type (test literals omit it); normalize() fills []
  term?: Term | null; // v1.8 class timetable; optional in the type (test literals omit it); normalize() always sets it (null = none)
};

// v1.8 term mode. Class times are logical minutes 480..1439 (08:00..23:59); the logical day starts 08:00, earlier classes are unsupported.
export type Cls = { id: string /* [a-z0-9]{1,8} */; d: number /* weekday, 0 = Sunday */; s: number; e: number; t: string /* 1-40 */; r?: string /* 1-20 */ };
export type Term = { start: string; end: string; cls: Cls[]; off?: string[] /* no-class dates, sorted, max 40 */; go?: number /* minutes to leave home before class, 0-120 step 5 */ };
export const TERM_START_DEFAULT = "2026-11-02"; // Monday; the user's term starts November 2026, exact day editable
export const termDefault = (): Term => ({ start: TERM_START_DEFAULT, end: "2027-03-05", cls: [] });
export type ShareOpts = { fmt: "story" | "square"; band: boolean; live: boolean; gym: boolean; weight: boolean; kg: boolean; sleep: boolean };
export const SHARE_DEFAULT: ShareOpts = { fmt: "story", band: true, live: true, gym: true, weight: false, kg: false, sleep: true };
export type Taper = { start: string; fromMin: number; stepMin: number; stop?: string };
// A user copy of a built-in: its own name and override/custom key, the built-in's items and phases.
export type UserTemplate = { id: string /* "u-" + base36 */; name: string; from: string /* built-in id only */ };

export const ACCENT_IDS = ["blue", "green", "orange", "pink", "purple", "teal", "indigo", "mint"] as const;
export type Accent = (typeof ACCENT_IDS)[number];
export const TEXT_SIZES = ["sm", "md", "lg", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export type Settings = {
  pinHash: string | null;
  pinLen: number;
  lockAfterMin: number;
  pinOnOpen: boolean; // server mode: ask the PIN every time the app opens (false = once per device)
  sound: boolean;
  soundVol: number; // 0.5 | 1 | 1.6
  haptics: boolean;
  privateNotifications: boolean; // lock screen shows "Krob" only
  notifyWater: boolean;
  notifySummary: boolean;
  notifyPhase: boolean; // "ตอนนี้ 21:00 · พักกะ" when a new block of the day starts
  notifyBriefing: boolean; // plan of the day at wake-up
  notifShowTime: boolean; // prefix titles with the scheduled time
  notifyKinds: Record<string, boolean>; // per item kind: meal, supp, gym, habit, personality, trade, weigh, sleep
  followUpMin: number; // 0 = no follow-up
  waterEveryMin: number;
  dndUntil: number; // epoch ms; reminders paused until then
  goodDay: number; // completion ratio that counts as a good day
  waterGoalMl: number; // 0 = auto from weight + activity
  theme: "auto" | "light" | "dark";
  accent: Accent;
  textSize: TextSize; // in-app text size (html[data-fs]); Home Screen apps do not always follow iOS Dynamic Type
  reduceMotion: boolean;
  sleepDnd: boolean; // pressing "เข้านอน" pauses notifications until planned wake-up
  askShiftOnWake: boolean; // offer to move today's schedule when waking early/late
  offWeekdays: number[]; // weekdays (0 = Sunday) that default to an off day; the Today toggle still overrides per day
  weekPlan: (string | null)[]; // length 7, index = getDay() (0 = Sunday); template for unlogged days, null = offWeekdays rule
  gameBreakMin: number; // 0 = off; break reminder interval inside game blocks
  planAsked: boolean; // the one-time Today "still on the night shift?" card was answered/dismissed
  brainCard: boolean; // Krob Brain card on Today
  brainAi: boolean; // allow AI ranking/explanations of the rule suggestions
  brainAutoAi: boolean; // one automatic AI brief per day after wake
  brainReviewDow: number; // -1 = first rest slot of the week plan, else 0-6
  notifyReview: boolean; // weekly review push
  notifyLastMatch: boolean; // "15 min to game-stop" push (default off)
  areaPriority: Record<AreaKey, 0 | 1 | 2>; // 0 = paused, 1 = normal, 2 = focus
  kcalAdjust: number; // -300..500 step 50, added to the kcal target
  job: "yes" | "no" | null; // still on the night shift (null = not answered)
  aiSendIdentity: boolean; // send the identity sentence to the AI coach
  streamAsked: boolean; // the one-time Today "stream season" card was answered/dismissed
  notifyStreamWrap: boolean; // "15 min to stream end" push (default on)
  night: boolean; // v1.7 automatic Night theme during wind-down/sleep/live (default on)
  badge: boolean; // v1.8 app icon badge (default on)
  ready: boolean; // v1.8 morning readiness score (default on)
  share: ShareOpts; // v1.8 weekly share card toggles
  lang: LangPref; // v1.9 UI language: "auto" follows the device, else fixed
  langDev: Lang | null; // device language last recorded by the installed app; the server push uses it when lang is "auto"
};

// ---- v1.7 session engine and gym logging ----
export type RunKind = "live" | "sing";
export type Run = { k: RunKind; date: string; at: number; b: number /* break interval snapshot, 0 = off */; slot: number; ok: number; seen: number; br: number; lb?: number /* last break epoch */; mk?: number[]; eyes?: boolean };
export type GymEx = { id: string; name: string; sets: number; lo: number; hi: number; rest: number; step: number; c?: 1; bw?: 1 };
export type GymSet = [number, number, 0 | 1]; // kg, reps, done
export type GymRun = { d: string; c: string; at: number; x: { id: string; s: GymSet[] }[]; rest?: { end: number; ex: string; dur: number }; lt?: number /* last set tick epoch */ };
export type GymLog = { d: string; c: string; at: number; min: number; x: [string, string][] }; // [exId, "60x8,60x8,57.5x7"]
export type Gym = { plan: Partial<Record<"D1" | "D2" | "D3" | "D4", GymEx[]>>; log: GymLog[]; run: GymRun | null; beep: boolean; end?: number /* `at` of the last ended or discarded run (merge tombstone) */ };
export const DEFAULT_GYM: Gym = { plan: {}, log: [], run: null, beep: false };

export type State = {
  profile: Profile;
  days: Record<string, DayLog>;
  weights: { date: string; kg: number }[];
  workouts: LogEntry[];
  personality: LogEntry[];
  schedule: ScheduleCfg;
  achievements: Record<string, number>; // badge id -> earned at (epoch ms)
  ai: { at: number; q: string; a: string }[]; // last AI answers, newest first
  settings: Settings;
  brain: Brain;
  care: Care;
  run: Run | null;
  runEnd?: number; // `at` of the last ended or cancelled session run (merge tombstone)
  gym: Gym;
  updatedAt: number;
};

export const DEFAULT_STATE: State = {
  profile: DEFAULT_PROFILE,
  days: {},
  weights: [],
  workouts: [],
  personality: [],
  schedule: { shiftMin: 0, overrides: {}, custom: [], templates: [], taper: null, care: [], term: null },
  achievements: {},
  ai: [],
  settings: {
    pinHash: null, pinLen: 6, lockAfterMin: 1, pinOnOpen: true,
    sound: true, soundVol: 1, haptics: true,
    privateNotifications: false, notifyWater: true, notifySummary: true, followUpMin: 30, waterEveryMin: 120, dndUntil: 0,
    notifyPhase: true, notifyBriefing: true, notifShowTime: true,
    notifyKinds: { meal: true, supp: true, gym: true, habit: true, personality: true, trade: true, weigh: true, sleep: true, sing: true, mc: true, game: true, stream: true, care: true },
    goodDay: 0.7, waterGoalMl: 0,
    theme: "auto", accent: "blue", textSize: "md", reduceMotion: false,
    sleepDnd: true, askShiftOnWake: true, offWeekdays: [],
    weekPlan: [null, null, null, null, null, null, null], gameBreakMin: 60, planAsked: false,
    brainCard: true, brainAi: true, brainAutoAi: true, brainReviewDow: -1, notifyReview: true, notifyLastMatch: false,
    areaPriority: Object.fromEntries(AREAS.map((a) => [a, 1])) as Record<AreaKey, 0 | 1 | 2>,
    kcalAdjust: 0, job: null, aiSendIdentity: true, streamAsked: false, notifyStreamWrap: true, night: true,
    badge: true, ready: true, share: SHARE_DEFAULT, lang: "auto", langDev: null,
  },
  brain: DEFAULT_BRAIN,
  care: DEFAULT_CARE,
  run: null,
  gym: DEFAULT_GYM,
  updatedAt: 0,
};

// Each share toggle is kept only when it is a boolean; fmt is one of the two formats.
function shareOf(v: unknown): ShareOpts {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const b = (k: Exclude<keyof ShareOpts, "fmt">) => (typeof o[k] === "boolean" ? (o[k] as boolean) : SHARE_DEFAULT[k]);
  return { fmt: o.fmt === "square" ? "square" : "story", band: b("band"), live: b("live"), gym: b("gym"), weight: b("weight"), kg: b("kg"), sleep: b("sleep") };
}

// A stored taper is used only when every field is valid; anything else is dropped (no clamping).
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function taperOf(v: unknown): Taper | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const t = v as Record<string, unknown>;
  const { start, fromMin, stepMin, stop } = t;
  if (typeof start !== "string" || !ISO.test(start)) return null;
  if (typeof fromMin !== "number" || !Number.isInteger(fromMin) || fromMin < 15 || fromMin > 300 || fromMin % 15 !== 0) return null;
  if (typeof stepMin !== "number" || ![15, 30, 45, 60].includes(stepMin)) return null;
  if (stop !== undefined && (typeof stop !== "string" || !ISO.test(stop))) return null;
  return { start, fromMin, stepMin, ...(stop !== undefined ? { stop: stop as string } : {}) };
}

// Fill fields added in later versions; profiles saved before first-run setup existed count as set up.
// Collections keep their shape even when the stored JSON was hand-edited or half-written.
export function normalize(raw: Partial<State> | null | undefined): State {
  const r = raw ?? {};
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = <T extends object>(v: unknown): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));
  const settings = obj<Partial<Settings>>(r.settings);
  const UID = /^u-[a-z0-9]{1,16}$/, TID = /^[a-z0-9-]{1,24}$/;
  // Template ids in weekPlan / DayLog.type are not checked against existing templates here: resolved at read time.
  const tpls = arr<UserTemplate>(r.schedule?.templates)
    .filter((t) => t && typeof t === "object" && typeof t.id === "string" && UID.test(t.id)
      && typeof t.name === "string" && t.name.trim() !== "" && typeof t.from === "string" && BUILTIN_IDS.has(t.from))
    .map((t) => ({ id: t.id, name: t.name.trim().slice(0, 40), from: t.from }))
    .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
  const wp = arr<unknown>(settings.weekPlan);
  const gb = settings.gameBreakMin;
  const ap = obj<Record<string, unknown>>(settings.areaPriority);
  const ka = settings.kcalAdjust, rd = settings.brainReviewDow;
  return {
    ...DEFAULT_STATE,
    ...r,
    profile: { ...DEFAULT_STATE.profile, ...(r.profile ? { setup: true } : {}), ...obj(r.profile) },
    days: obj(r.days),
    weights: arr(r.weights),
    workouts: arr(r.workouts),
    personality: arr(r.personality),
    ai: arr(r.ai),
    achievements: obj(r.achievements),
    schedule: { ...DEFAULT_STATE.schedule, ...obj(r.schedule), custom: arr(r.schedule?.custom), overrides: obj(r.schedule?.overrides), templates: tpls, taper: taperOf(r.schedule?.taper), care: sanitizeRoutines(r.schedule?.care), term: sanitizeTerm(r.schedule?.term) },
    settings: {
      ...DEFAULT_STATE.settings, ...settings,
      notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, ...obj(settings.notifyKinds) },
      offWeekdays: arr<number>(settings.offWeekdays),
      weekPlan: Array.from({ length: 7 }, (_, i) => (typeof wp[i] === "string" && TID.test(wp[i] as string) ? (wp[i] as string) : null)),
      gameBreakMin: typeof gb === "number" && Number.isFinite(gb) && gb >= 0 && gb <= 240 ? gb : 60,
      planAsked: settings.planAsked === true,
      brainCard: settings.brainCard !== false,
      brainAi: settings.brainAi !== false,
      brainAutoAi: settings.brainAutoAi !== false,
      brainReviewDow: Number.isInteger(rd) && (rd as number) >= -1 && (rd as number) <= 6 ? (rd as number) : -1,
      notifyReview: settings.notifyReview !== false,
      notifyLastMatch: settings.notifyLastMatch === true,
      areaPriority: Object.fromEntries(AREAS.map((a) => [a, ap[a] === 0 || ap[a] === 2 ? ap[a] : 1])) as Record<AreaKey, 0 | 1 | 2>,
      kcalAdjust: typeof ka === "number" && Number.isFinite(ka) ? Math.round(Math.max(-300, Math.min(500, ka)) / 50) * 50 : 0,
      job: settings.job === "yes" || settings.job === "no" ? settings.job : null,
      aiSendIdentity: settings.aiSendIdentity !== false,
      streamAsked: settings.streamAsked === true,
      accent: (ACCENT_IDS as readonly unknown[]).includes(settings.accent) ? (settings.accent as Accent) : "blue",
      textSize: (TEXT_SIZES as readonly unknown[]).includes(settings.textSize) ? (settings.textSize as TextSize) : "md",
      notifyStreamWrap: settings.notifyStreamWrap !== false,
      night: settings.night !== false,
      badge: settings.badge !== false,
      ready: settings.ready !== false,
      share: shareOf(settings.share),
      // A pre-v1.9 state always has a profile: it stays Thai so the update never switches its language.
      lang: isLangPref(settings.lang) ? settings.lang : r.profile && typeof r.profile === "object" && !Array.isArray(r.profile) ? "th" : "auto",
      langDev: isLang(settings.langDev) ? settings.langDev : null,
    },
    brain: sanitizeBrain(r.brain),
    care: sanitizeCare(r.care),
    run: sanitizeRun(r.run),
    ...(typeof r.runEnd === "number" && r.runEnd > 1e12 ? { runEnd: r.runEnd } : {}),
    gym: sanitizeGym(r.gym),
  };
}

// ---- v1.7 sanitizers (session run and gym) ----
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const clampN = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

export function sanitizeRun(v: unknown): Run | null {
  if (!isObj(v) || (v.k !== "live" && v.k !== "sing") || typeof v.date !== "string" || !ISO.test(v.date) || typeof v.at !== "number" || !(v.at > 1e12)) return null;
  const cnt = (x: unknown) => (isInt(x, 0, 1e6) ? x : 0);
  const run: Run = { k: v.k, date: v.date, at: v.at, b: isInt(v.b, 0, 240) ? v.b : 0, slot: cnt(v.slot), ok: cnt(v.ok), seen: cnt(v.seen), br: cnt(v.br) };
  if (typeof v.lb === "number" && v.lb > 1e12) run.lb = v.lb;
  const mk = Array.isArray(v.mk) ? v.mk.filter((x) => isInt(x, 0, 1440)).slice(0, 20) : [];
  if (mk.length) run.mk = mk;
  if (typeof v.eyes === "boolean") run.eyes = v.eyes;
  return run;
}

const GYM_CODES = ["D1", "D2", "D3", "D4"] as const;
const EXID = /^[a-z0-9]{1,8}$/, GCODE = /^D[1-4]$/;
const SETSTR = /^\d{1,3}(\.\d{1,2})?x\d{1,2}(,\d{1,3}(\.\d{1,2})?x\d{1,2}){0,5}$/;
const KG_STEPS = [0.5, 1, 1.25, 2, 2.5, 5];
function gymExOf(v: unknown): GymEx | null {
  if (!isObj(v) || typeof v.id !== "string" || !EXID.test(v.id) || typeof v.name !== "string" || !v.name.trim()) return null;
  if (!isInt(v.sets, 1, 6) || !isInt(v.lo, 1, 30) || !isInt(v.hi, v.lo as number, 50) || !isInt(v.rest, 15, 600) || !KG_STEPS.includes(v.step as number)) return null;
  return { id: v.id, name: v.name.trim().slice(0, 40), sets: v.sets, lo: v.lo, hi: v.hi, rest: v.rest, step: v.step as number,
    ...(v.c === 1 ? { c: 1 as const } : {}), ...(v.bw === 1 ? { bw: 1 as const } : {}) };
}
function gymLogOf(v: unknown): GymLog | null {
  if (!isObj(v) || typeof v.d !== "string" || !ISO.test(v.d) || typeof v.c !== "string" || !GCODE.test(v.c) || !isInt(v.min, 0, 300)) return null;
  const x = (Array.isArray(v.x) ? v.x : [])
    .filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === "string" && EXID.test(e[0]) && typeof e[1] === "string" && SETSTR.test(e[1]))
    .map((e) => [e[0], e[1]] as [string, string]).slice(0, 10);
  return { d: v.d, c: v.c, at: typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0, min: v.min, x };
}
function gymRunOf(v: unknown): GymRun | null {
  if (!isObj(v) || typeof v.d !== "string" || !ISO.test(v.d) || typeof v.c !== "string" || !GCODE.test(v.c) || typeof v.at !== "number" || !(v.at > 1e12)) return null;
  const x = (Array.isArray(v.x) ? v.x : []).filter((e): e is Obj => isObj(e) && typeof e.id === "string" && EXID.test(e.id)).slice(0, 10)
    .map((e) => ({ id: e.id as string, s: (Array.isArray(e.s) ? e.s : []).filter((t): t is unknown[] => Array.isArray(t)).slice(0, 6)
      .map((t) => [clampN(t[0], 0, 500), Math.round(clampN(t[1], 0, 50)), t[2] === 1 ? 1 : 0] as GymSet) }));
  const run: GymRun = { d: v.d, c: v.c, at: v.at, x };
  const r = v.rest;
  if (isObj(r) && typeof r.end === "number" && Number.isFinite(r.end) && typeof r.ex === "string" && EXID.test(r.ex) && isInt(r.dur, 15, 900)) run.rest = { end: r.end, ex: r.ex, dur: r.dur };
  if (typeof v.lt === "number" && Number.isFinite(v.lt) && v.lt >= v.at) run.lt = v.lt;
  return run;
}
// Union by "d|c" (a later entry wins), sorted by date, newest 24.
function capLogs(logs: GymLog[]): GymLog[] {
  const m = new Map<string, GymLog>();
  for (const l of logs) m.set(`${l.d}|${l.c}`, l);
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d) || a.c.localeCompare(b.c)).slice(-24);
}
export function sanitizeGym(v: unknown): Gym {
  const r = isObj(v) ? v : {};
  const p = isObj(r.plan) ? r.plan : {};
  const plan: Gym["plan"] = {};
  for (const c of GYM_CODES) {
    if (!Array.isArray(p[c])) continue;
    plan[c] = (p[c] as unknown[]).map(gymExOf).filter((x): x is GymEx => !!x).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 8);
  }
  const g: Gym = { plan, log: capLogs((Array.isArray(r.log) ? r.log : []).map(gymLogOf).filter((x): x is GymLog => !!x)), run: gymRunOf(r.run), beep: r.beep === true };
  if (typeof r.end === "number" && r.end > 1e12) g.end = r.end;
  return g;
}

// A plain object is the only thing normalize() can repair; anything else (string, array, null) is a corrupt save.
export const isStateLike = (x: unknown): x is Partial<State> => !!x && typeof x === "object" && !Array.isArray(x);

export const emptyDay = (): DayLog => ({ type: "work", done: {}, waterMl: 0 });

// Template of an unlogged day: the week plan slot if it still exists, else the v1.0 off-weekday rule.
export function plannedType(s: State, date: string): DayType {
  const dow = new Date(date + "T12:00:00").getDay(); // noon: correct weekday on the UTC server too
  const p = s.settings.weekPlan?.[dow];
  if (p && templateExists(s.schedule, p)) return p;
  return s.settings.offWeekdays.includes(dow) ? "off" : "work";
}

// The day as stored, or an unlogged day whose type follows the week plan.
export const dayFor = (s: State, date: string): DayLog => s.days[date] ?? { type: plannedType(s, date), done: {}, waterMl: 0 };

export const hasCheckin = (d: DayLog): d is DayLog & { checkin: NonNullable<DayLog["checkin"]> } => !!d.checkin && d.checkin.mood > 0;

// Both devices changed since the last sync (e.g. the phone logged offline while the desktop wrote): keep the
// newer copy for profile/schedule/settings (v1.8: schedule.term and settings.badge/ready/share included; v1.9:
// settings.lang/langDev included; DayLog.sore
// takes the newer copy through the day spread) and union the logs so no tick, weigh-in or session is lost.
// Same day on both: ticks are combined, water takes the larger value, other fields prefer the newer copy.
// Trade-off: something deleted on one side during the conflict can come back; losing a log is worse.
export function mergeStates(newer: State, older: State): State {
  const byDate = <T extends { date: string }>(a: T[], b: T[]) => {
    const m = new Map(b.map((x) => [x.date, x]));
    for (const x of a) m.set(x.date, x);
    return [...m.values()].sort((x, y) => x.date.localeCompare(y.date));
  };
  const days: Record<string, DayLog> = { ...older.days };
  for (const [k, d] of Object.entries(newer.days)) {
    const o = older.days[k];
    if (!o) { days[k] = d; continue; }
    const m: DayLog = { ...o, ...d, done: { ...o.done, ...d.done }, waterMl: Math.max(d.waterMl || 0, o.waterMl || 0) };
    const src = { ...o.doneSrc, ...d.doneSrc };
    if (Object.keys(src).length) m.doneSrc = src; else delete m.doneSrc;
    // Today-only reschedule maps have their own clock: the side that changed them last wins both maps, absence included,
    // so an undone snooze or skip never comes back and an unsynced local snooze survives a 409 merge. Tie -> newer.
    const r = (o.reschedAt ?? 0) > (d.reschedAt ?? 0) ? o : d;
    if (r.moved) m.moved = r.moved; else delete m.moved;
    if (r.skip) m.skip = r.skip; else delete m.skip;
    if (r.skipWhy) m.skipWhy = r.skipWhy; else delete m.skipWhy;
    if (r.carry) m.carry = r.carry; else delete m.carry;
    const at = Math.max(d.reschedAt ?? 0, o.reschedAt ?? 0);
    if (at) m.reschedAt = at; else delete m.reschedAt;
    mergeDayC(m, d, o);
    days[k] = m;
  }
  const ai = [...newer.ai, ...older.ai.filter((x) => !newer.ai.some((y) => y.at === x.at))].sort((x, y) => y.at - x.at).slice(0, 5);
  return {
    ...newer,
    days,
    weights: byDate(newer.weights, older.weights),
    workouts: byDate(newer.workouts, older.workouts),
    personality: byDate(newer.personality, older.personality),
    achievements: { ...older.achievements, ...newer.achievements },
    ai,
    brain: mergeBrain(newer.brain ?? DEFAULT_BRAIN, older.brain ?? DEFAULT_BRAIN),
    care: mergeCare(newer.care ?? DEFAULT_CARE, older.care ?? DEFAULT_CARE),
    ...mergeRuns(newer, older),
    updatedAt: Math.max(newer.updatedAt, older.updatedAt) + 1,
  };
}

// Active sessions survive a merge from either side: a run is dropped only when a tombstone (runEnd / gym.end, the `at` of
// the last ended run) or a gym log written by finishing it shows it ended. Both alive -> the later start wins.
function mergeRuns(newer: State, older: State): Pick<State, "run" | "runEnd" | "gym"> {
  const mx = (a?: number, b?: number) => Math.max(a ?? 0, b ?? 0) || undefined;
  const pick = <T extends { at: number }>(a: T | null, b: T | null) => (a && b ? (b.at > a.at ? b : a) : a ?? b);
  const runEnd = mx(newer.runEnd, older.runEnd);
  const alive = (r: Run | null | undefined) => (r && !(runEnd && r.at <= runEnd) ? r : null);
  const ng = newer.gym ?? DEFAULT_GYM, og = older.gym ?? DEFAULT_GYM;
  const log = capLogs([...og.log, ...ng.log]), end = mx(ng.end, og.end);
  const gAlive = (r: GymRun | null | undefined) => (r && !(end && r.at <= end) && !log.some((l) => l.d === r.d && l.c === r.c && l.at >= r.at) ? r : null);
  const gym: Gym = { ...ng, log, run: pick(gAlive(ng.run), gAlive(og.run)) };
  if (end) gym.end = end; else delete gym.end;
  const out: Pick<State, "run" | "runEnd" | "gym"> = { run: pick(alive(newer.run), alive(older.run)), gym };
  if (runEnd) out.runEnd = runEnd;
  return out;
}

// v1.7 fields of a day present on both sides (d = newer, o = older): care step ticks are unioned per routine (a tick beats
// its "-id"), veg/breaks take the max, symptoms are unioned and the live log with more minutes wins (tie -> newer).
function mergeDayC(m: DayLog, d: DayLog, o: DayLog) {
  if (d.care || o.care) {
    const care: Record<string, string> = {};
    for (const rid of new Set([...Object.keys(o.care ?? {}), ...Object.keys(d.care ?? {})])) {
      const ids = new Set([o.care?.[rid], d.care?.[rid]].flatMap((v) => (typeof v === "string" && v ? v.split(",") : [])));
      const keep = [...ids].filter((id) => !(id.startsWith("-") && ids.has(id.slice(1))));
      if (keep.length) care[rid] = keep.slice(0, 20).join(",");
    }
    if (Object.keys(care).length) m.care = care; else delete m.care;
  }
  const max = (a: unknown, b: unknown) => { const v = [a, b].filter((x): x is number => typeof x === "number" && Number.isFinite(x)); return v.length ? Math.max(...v) : undefined; };
  const veg = max(d.veg, o.veg); if (veg !== undefined) m.veg = veg;
  const br = max(d.breaks, o.breaks); if (br !== undefined) m.breaks = br;
  if (Array.isArray(d.sym) || Array.isArray(o.sym)) m.sym = [...new Set([...(Array.isArray(o.sym) ? o.sym : []), ...(Array.isArray(d.sym) ? d.sym : [])])].filter((v) => (SYMS as readonly unknown[]).includes(v));
  const lm = (l: LiveLog | undefined) => (l && typeof l.min === "number" ? l.min : -1);
  if (d.live || o.live) m.live = lm(o.live) > lm(d.live) ? o.live : d.live;
}

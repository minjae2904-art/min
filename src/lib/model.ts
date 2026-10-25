// Data model shared by the client store and server routes (no React, no "use client").
import { DEFAULT_PROFILE, type Profile } from "./health";
import type { LogEntry } from "./rotation";
import { templateExists, type DayType, type Meal2, type Ring } from "./schedule";
import { BUILTIN_IDS } from "./templates";
import { mergeBrain, sanitizeBrain } from "./brain/state";
import { AREAS, DEFAULT_BRAIN, type AreaKey, type Brain } from "./brain/types";

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
};

// How a late tick's time was set: late = not confirmed (defaulted to now), plan = "ทำตรงเวลา", now = "เพิ่งทำ", pick = time picker.
export type TickSrc = "late" | "plan" | "now" | "pick";

// count 0 + "skip" = looked at the chart, no setup, stayed out (discipline counts as done).
export type TradeResult = "win" | "loss" | "be" | "open" | "skip";
export type TradeLog = { count: number; result: TradeResult; note?: string };

// days = a template key, "both", or legacy "work"/"off" (= every template whose base is that value)
export type CustomItem = { id: string; title: string; sub?: string; min: number; ring: Ring; days: string };
export type ItemOverride = { enabled?: boolean; min?: number; remind?: boolean; title?: string };
export type ScheduleCfg = {
  shiftMin: number; // move every personal item (not work start/end) by N minutes
  overrides: Record<string, ItemOverride>; // key: `${dayType}:${itemId}`
  custom: CustomItem[];
  templates?: UserTemplate[]; // optional in the type (test literals omit it); normalize() always fills it
  taper?: Taper | null; // v1.4 sleep advance on season templates (schedule.ts taperShift); never written into DayLog
};
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
};

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
  updatedAt: number;
};

export const DEFAULT_STATE: State = {
  profile: DEFAULT_PROFILE,
  days: {},
  weights: [],
  workouts: [],
  personality: [],
  schedule: { shiftMin: 0, overrides: {}, custom: [], templates: [], taper: null },
  achievements: {},
  ai: [],
  settings: {
    pinHash: null, pinLen: 6, lockAfterMin: 1, pinOnOpen: true,
    sound: true, soundVol: 1, haptics: true,
    privateNotifications: false, notifyWater: true, notifySummary: true, followUpMin: 30, waterEveryMin: 120, dndUntil: 0,
    notifyPhase: true, notifyBriefing: true, notifShowTime: true,
    notifyKinds: { meal: true, supp: true, gym: true, habit: true, personality: true, trade: true, weigh: true, sleep: true, sing: true, mc: true, game: true, stream: true },
    goodDay: 0.7, waterGoalMl: 0,
    theme: "auto", accent: "blue", textSize: "md", reduceMotion: false,
    sleepDnd: true, askShiftOnWake: true, offWeekdays: [],
    weekPlan: [null, null, null, null, null, null, null], gameBreakMin: 60, planAsked: false,
    brainCard: true, brainAi: true, brainAutoAi: true, brainReviewDow: -1, notifyReview: true, notifyLastMatch: false,
    areaPriority: Object.fromEntries(AREAS.map((a) => [a, 1])) as Record<AreaKey, 0 | 1 | 2>,
    kcalAdjust: 0, job: null, aiSendIdentity: true, streamAsked: false, notifyStreamWrap: true,
  },
  brain: DEFAULT_BRAIN,
  updatedAt: 0,
};

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
    schedule: { ...DEFAULT_STATE.schedule, ...obj(r.schedule), custom: arr(r.schedule?.custom), overrides: obj(r.schedule?.overrides), templates: tpls, taper: taperOf(r.schedule?.taper) },
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
    },
    brain: sanitizeBrain(r.brain),
  };
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
// newer copy for profile/schedule/settings and union the logs so no tick, weigh-in or session is lost.
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
    const at = Math.max(d.reschedAt ?? 0, o.reschedAt ?? 0);
    if (at) m.reschedAt = at; else delete m.reschedAt;
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
    updatedAt: Math.max(newer.updatedAt, older.updatedAt) + 1,
  };
}

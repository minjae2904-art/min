// Data model shared by the client store and server routes (no React, no "use client").
import { DEFAULT_PROFILE, type Profile } from "./health";
import type { LogEntry } from "./rotation";
import type { DayType, Meal2, Ring } from "./schedule";

export type DayLog = {
  type: DayType;
  done: Record<string, number>; // item id -> timestamp
  meal2?: Meal2;
  waterMl: number;
  checkin?: { mood: number; energy: number; sleep: number }; // 1-5, after waking
  journal?: { good: string; fix: string; thanks: string }; // evening reflection
  trade?: TradeLog;
  wakeAt?: number; // epoch ms when "ตื่นแล้ว" was pressed
  sleepAt?: number; // epoch ms when "เข้านอน" was pressed
  shiftMin?: number; // today-only schedule shift (e.g. woke up 45 min late)
  dndBefore?: number; // settings.dndUntil before "เข้านอน" paused reminders, restored by "ยังไม่นอน"
};

// count 0 + "skip" = looked at the chart, no setup, stayed out (discipline counts as done).
export type TradeResult = "win" | "loss" | "be" | "open" | "skip";
export type TradeLog = { count: number; result: TradeResult; note?: string };

export type CustomItem = { id: string; title: string; sub?: string; min: number; ring: Ring; days: DayType | "both" };
export type ItemOverride = { enabled?: boolean; min?: number; remind?: boolean; title?: string };
export type ScheduleCfg = {
  shiftMin: number; // move every personal item (not work start/end) by N minutes
  overrides: Record<string, ItemOverride>; // key: `${dayType}:${itemId}`
  custom: CustomItem[];
};

export type Accent = "blue" | "green" | "orange" | "pink" | "purple" | "teal";

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
  reduceMotion: boolean;
  sleepDnd: boolean; // pressing "เข้านอน" pauses notifications until planned wake-up
  askShiftOnWake: boolean; // offer to move today's schedule when waking early/late
  offWeekdays: number[]; // weekdays (0 = Sunday) that default to an off day; the Today toggle still overrides per day
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
  updatedAt: number;
};

export const DEFAULT_STATE: State = {
  profile: DEFAULT_PROFILE,
  days: {},
  weights: [],
  workouts: [],
  personality: [],
  schedule: { shiftMin: 0, overrides: {}, custom: [] },
  achievements: {},
  ai: [],
  settings: {
    pinHash: null, pinLen: 6, lockAfterMin: 1, pinOnOpen: true,
    sound: true, soundVol: 1, haptics: true,
    privateNotifications: false, notifyWater: true, notifySummary: true, followUpMin: 30, waterEveryMin: 120, dndUntil: 0,
    notifyPhase: true, notifyBriefing: true, notifShowTime: true,
    notifyKinds: { meal: true, supp: true, gym: true, habit: true, personality: true, trade: true, weigh: true, sleep: true },
    goodDay: 0.7, waterGoalMl: 0,
    theme: "auto", accent: "blue", reduceMotion: false,
    sleepDnd: true, askShiftOnWake: true, offWeekdays: [],
  },
  updatedAt: 0,
};

// Fill fields added in later versions; profiles saved before first-run setup existed count as set up.
// Collections keep their shape even when the stored JSON was hand-edited or half-written.
export function normalize(raw: Partial<State> | null | undefined): State {
  const r = raw ?? {};
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = <T extends object>(v: unknown): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));
  const settings = obj<Partial<Settings>>(r.settings);
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
    schedule: { ...DEFAULT_STATE.schedule, ...obj(r.schedule), custom: arr(r.schedule?.custom), overrides: obj(r.schedule?.overrides) },
    settings: { ...DEFAULT_STATE.settings, ...settings, notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, ...obj(settings.notifyKinds) }, offWeekdays: arr<number>(settings.offWeekdays) },
  };
}

// A plain object is the only thing normalize() can repair; anything else (string, array, null) is a corrupt save.
export const isStateLike = (x: unknown): x is Partial<State> => !!x && typeof x === "object" && !Array.isArray(x);

export const emptyDay = (): DayLog => ({ type: "work", done: {}, waterMl: 0 });

// The day as stored, or an unlogged day whose type follows the off-weekday setting.
export const dayFor = (s: State, date: string): DayLog =>
  s.days[date] ?? { type: s.settings.offWeekdays.includes(new Date(date + "T12:00:00").getDay()) ? "off" : "work", done: {}, waterMl: 0 };

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
    days[k] = o ? { ...o, ...d, done: { ...o.done, ...d.done }, waterMl: Math.max(d.waterMl || 0, o.waterMl || 0) } : d;
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
    updatedAt: Math.max(newer.updatedAt, older.updatedAt) + 1,
  };
}

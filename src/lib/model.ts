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
    pinHash: null, pinLen: 6, lockAfterMin: 1,
    sound: true, soundVol: 1, haptics: true,
    privateNotifications: false, notifyWater: true, notifySummary: true, followUpMin: 30, waterEveryMin: 120, dndUntil: 0,
    notifyPhase: true, notifyBriefing: true, notifShowTime: true,
    notifyKinds: { meal: true, supp: true, gym: true, habit: true, personality: true, trade: true, weigh: true, sleep: true },
    goodDay: 0.7, waterGoalMl: 0,
    theme: "auto", accent: "blue", reduceMotion: false,
  },
  updatedAt: 0,
};

// Fill fields added in later versions; profiles saved before first-run setup existed count as set up.
export function normalize(raw: Partial<State> | null | undefined): State {
  const r = raw ?? {};
  return {
    ...DEFAULT_STATE,
    ...r,
    profile: { ...DEFAULT_STATE.profile, ...(r.profile ? { setup: true } : {}), ...r.profile },
    schedule: { ...DEFAULT_STATE.schedule, ...r.schedule },
    settings: { ...DEFAULT_STATE.settings, ...r.settings, notifyKinds: { ...DEFAULT_STATE.settings.notifyKinds, ...r.settings?.notifyKinds } },
  };
}

export const emptyDay = (): DayLog => ({ type: "work", done: {}, waterMl: 0 });

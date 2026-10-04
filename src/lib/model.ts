// Data model shared by the client store and server routes (no React, no "use client").
import { DEFAULT_PROFILE, type Profile } from "./health";
import type { LogEntry } from "./rotation";
import type { DayType, Meal2 } from "./schedule";

export type DayLog = {
  type: DayType;
  done: Record<string, number>; // item id -> timestamp
  meal2?: Meal2;
  waterMl: number;
};

export type Settings = {
  pinHash: string | null;
  pinLen: number;
  lockAfterMin: number;
  sound: boolean;
  soundVol: number; // 0.5 | 1 | 1.6
  privateNotifications: boolean; // lock screen shows "Krob" only
  notifyWater: boolean;
  notifySummary: boolean;
};

export type State = {
  profile: Profile;
  days: Record<string, DayLog>;
  weights: { date: string; kg: number }[];
  workouts: LogEntry[];
  personality: LogEntry[];
  settings: Settings;
  updatedAt: number;
};

export const DEFAULT_STATE: State = {
  profile: DEFAULT_PROFILE,
  days: {},
  weights: [],
  workouts: [],
  personality: [],
  settings: { pinHash: null, pinLen: 6, lockAfterMin: 1, sound: true, soundVol: 1, privateNotifications: false, notifyWater: true, notifySummary: true },
  updatedAt: 0,
};

// Fill fields added in later versions; profiles saved before first-run setup existed count as set up.
export function normalize(raw: Partial<State> | null | undefined): State {
  const r = raw ?? {};
  return {
    ...DEFAULT_STATE,
    ...r,
    profile: { ...DEFAULT_STATE.profile, ...(r.profile ? { setup: true } : {}), ...r.profile },
    settings: { ...DEFAULT_STATE.settings, ...r.settings },
  };
}

export const emptyDay = (): DayLog => ({ type: "work", done: {}, waterMl: 0 });

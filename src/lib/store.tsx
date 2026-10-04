"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PROFILE, type Profile } from "./health";
import type { LogEntry } from "./rotation";
import type { DayType, Meal2 } from "./schedule";
import { supabase } from "./supabase";

export type DayLog = {
  type: DayType;
  done: Record<string, number>; // item id -> timestamp
  meal2?: Meal2;
  waterMl: number;
};

export type State = {
  profile: Profile;
  days: Record<string, DayLog>;
  weights: { date: string; kg: number }[];
  workouts: LogEntry[];
  personality: LogEntry[];
  settings: { pinHash: string | null; pinLen: number; lockAfterMin: number };
  updatedAt: number;
};

const KEY = "krob-v1";
const DEFAULT: State = {
  profile: DEFAULT_PROFILE,
  days: {},
  weights: [],
  workouts: [],
  personality: [],
  settings: { pinHash: null, pinLen: 6, lockAfterMin: 1 },
  updatedAt: 0,
};

export const emptyDay = (): DayLog => ({ type: "work", done: {}, waterMl: 0 });

export type SyncStatus = "local" | "syncing" | "synced" | "error";

type Ctx = {
  s: State;
  update: (fn: (s: State) => void) => void;
  ready: boolean;
  session: Session | null;
  authReady: boolean;
  sync: SyncStatus;
};
const StoreCtx = createContext<Ctx | null>(null);

const saveLocal = (s: State) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
};

// localStorage is the offline cache; Supabase row is the source of truth across devices.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [sync, setSync] = useState<SyncStatus>("local");
  const dirty = useRef(false);
  const pulling = useRef(false);
  const [pulled, setPulled] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is client-only; read after hydration
      if (raw) setS({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, []);

  // First pull after login: keep whichever copy is newer.
  useEffect(() => {
    if (!supabase || !session || !ready || pulling.current) return;
    pulling.current = true;
    setSync("syncing");
    supabase.from("app_state").select("data").eq("user_id", session.user.id).maybeSingle().then(({ data, error }) => {
      if (error) { pulling.current = false; return setSync("error"); }
      const remote = data?.data as State | undefined;
      setS((local) => {
        if (remote && (remote.updatedAt ?? 0) > local.updatedAt) {
          const merged = { ...DEFAULT, ...remote };
          saveLocal(merged);
          setSync("synced");
          return merged;
        }
        dirty.current = true; // local is newer (or no remote yet) -> push it
        return { ...local };
      });
      setPulled(true);
    });
  }, [session, ready]);

  // Debounced push.
  useEffect(() => {
    if (!supabase || !session || !pulled || !dirty.current) return;
    const t = setTimeout(async () => {
      dirty.current = false;
      setSync("syncing");
      const { error } = await supabase!.from("app_state").upsert({
        user_id: session.user.id,
        data: s,
        updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
      });
      setSync(error ? "error" : "synced");
      if (error) dirty.current = true;
    }, 800);
    return () => clearTimeout(t);
  }, [s, session, pulled]);

  const update = useCallback((fn: (s: State) => void) => {
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = Date.now();
      saveLocal(next);
      dirty.current = true;
      return next;
    });
  }, []);

  return <StoreCtx.Provider value={{ s, update, ready, session, authReady, sync }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

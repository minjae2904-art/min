"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_STATE as DEFAULT, normalize, type State } from "./model";
import { hashPin } from "./pin";

export { emptyDay, type DayLog, type State } from "./model";

const KEY = "krob-v1";
const TOKEN = "krob-token";
const PIN_VERIFIER = "krob-pinv"; // local hash of the PIN for instant/offline re-unlock

export type SyncStatus = "local" | "syncing" | "synced" | "error";
// local = no server configured (data only on this device); server = PIN login + sync through /api/state.
export type AuthMode = "loading" | "local" | "server";

type Auth = {
  mode: AuthMode;
  hasPin: boolean;
  pinOff: boolean; // owner turned the PIN off: the app opens without one
  token: string | null;
  login: (pin: string) => Promise<string | null>; // error message or null
  unlockLocal: (pin: string) => Promise<boolean>;
  changePin: (oldPin: string, newPin: string) => Promise<string | null>; // also turns the PIN back on
  disablePin: (pin: string) => Promise<string | null>;
  logout: () => void;
};

type Ctx = { s: State; update: (fn: (s: State) => void) => void; ready: boolean; sync: SyncStatus; auth: Auth };
const StoreCtx = createContext<Ctx | null>(null);

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

// localStorage is the offline cache; the server row (via /api/state) is the source of truth across devices.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode>("loading");
  const [hasPin, setHasPin] = useState(false);
  const [pinOff, setPinOff] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("local");
  const [pulled, setPulled] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    const raw = ls.get(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is client-only; read after hydration
    if (raw) { try { setS(normalize(JSON.parse(raw))); } catch {} }
    setToken(ls.get(TOKEN));
    setReady(true);
    (async () => {
      const j = await fetch("/api/auth/pin").then((r) => (r.ok ? r.json() : { server: false })).catch(() => null) as { server?: boolean; hasPin?: boolean; pinOff?: boolean } | null;
      if (!j) return setMode(ls.get(TOKEN) ? "server" : "local"); // offline: keep using the cached session
      setHasPin(!!j.hasPin);
      setPinOff(!!j.pinOff);
      if (j.server) {
        const post = (body: object, auth?: string | null) => fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const cur = ls.get(TOKEN);
        // Renew a valid session, or open without a PIN when the owner turned it off.
        const res = cur ? await post({ refresh: true }, cur) : j.pinOff ? await post({ open: true }) : null;
        if (res?.token) { ls.set(TOKEN, res.token); setToken(res.token); }
      }
      setMode(j.server ? "server" : "local");
    })();
  }, []);

  const api = useCallback((path: string, init: RequestInit = {}) =>
    fetch(path, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } }), [token]);

  const logout = useCallback(() => { ls.del(TOKEN); setToken(null); setPulled(false); setSync("local"); }, []);

  // First pull after login: keep whichever copy is newer.
  useEffect(() => {
    if (mode !== "server" || !token || !ready || pulled) return;
    let cancelled = false;
    (async () => {
      setSync("syncing");
      const r = await api("/api/state").catch(() => null);
      if (cancelled) return;
      if (r?.status === 401) return logout();
      if (!r?.ok) return setSync("error");
      const { data: remote } = (await r.json()) as { data: State | null };
      setS((local) => {
        if (remote && (remote.updatedAt ?? 0) > local.updatedAt) {
          const merged = normalize(remote);
          ls.set(KEY, JSON.stringify(merged));
          return merged;
        }
        dirty.current = true; // local is newer (or nothing on the server yet) -> push it
        return { ...local };
      });
      setSync("synced");
      setPulled(true);
    })();
    return () => { cancelled = true; };
  }, [mode, token, ready, pulled, api, logout]);

  // Debounced push.
  useEffect(() => {
    if (mode !== "server" || !token || !pulled || !dirty.current) return;
    const t = setTimeout(async () => {
      dirty.current = false;
      setSync("syncing");
      const r = await api("/api/state", { method: "PUT", body: JSON.stringify({ data: s }) }).catch(() => null);
      if (r?.status === 401) return logout();
      setSync(r?.ok ? "synced" : "error");
      if (!r?.ok) dirty.current = true;
    }, 800);
    return () => clearTimeout(t);
  }, [s, mode, token, pulled, api, logout]);

  const update = useCallback((fn: (s: State) => void) => {
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = Date.now();
      ls.set(KEY, JSON.stringify(next));
      dirty.current = true;
      return next;
    });
  }, []);

  const login = useCallback(async (pin: string) => {
    const r = await fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ต";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    ls.set(PIN_VERIFIER, await hashPin(pin));
    setHasPin(true);
    setToken(j.token);
    return null;
  }, []);

  const unlockLocal = useCallback(async (pin: string) => {
    const v = ls.get(PIN_VERIFIER);
    if (v) return (await hashPin(pin)) === v;
    return (await login(pin)) === null;
  }, [login]);

  const disablePin = useCallback(async (pin: string) => {
    const r = await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ disablePin: true, pin }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    setToken(j.token);
    setPinOff(true);
    return null;
  }, [api]);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    const r = await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin: oldPin, newPin }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    ls.set(PIN_VERIFIER, await hashPin(newPin));
    setToken(j.token);
    setPinOff(false);
    setHasPin(true);
    return null;
  }, [api]);

  const auth: Auth = { mode, hasPin, pinOff, token, login, unlockLocal, changePin, disablePin, logout };
  return <StoreCtx.Provider value={{ s, update, ready, sync, auth }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

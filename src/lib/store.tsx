"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_STATE as DEFAULT, isStateLike, mergeStates, normalize, type State } from "./model";
import { clearBrainCache } from "./brain-client";
import { hashPin } from "./pin";

export { emptyDay, type DayLog, type State } from "./model";

const KEY = "krob-v1";
const TOKEN = "krob-token";
const PIN_VERIFIER = "krob-pinv"; // local hash of the PIN for instant/offline re-unlock
const BASE = "krob-base"; // updatedAt of the server copy this device last adopted or pushed (0 = never pulled)
const AUTH_CACHE = "krob-auth"; // last successful GET /api/auth/pin (server mode only), so needPin is right before the network answers
const FETCH_TIMEOUT = 8000;

export type SyncStatus = "local" | "syncing" | "synced" | "error";
export const SYNC_LABEL: Record<SyncStatus, string> = { local: "เฉพาะในเครื่อง", syncing: "กำลังซิงค์...", synced: "ซิงค์แล้ว", error: "ซิงค์ไม่สำเร็จ" };
// local = no server configured (data only on this device); server = PIN login + sync through /api/state.
export type AuthMode = "loading" | "local" | "server";

type Auth = {
  mode: AuthMode;
  hasPin: boolean;
  pinOff: boolean; // owner turned the PIN off: the app opens without one
  pinLen: number | null; // length of the server PIN (null until known)
  token: string | null;
  reason: "unconfigured" | "unreachable" | null; // why the app runs in local mode (null otherwise)
  login: (pin: string) => Promise<string | null>; // error message or null
  unlockLocal: (pin: string) => Promise<boolean>;
  changePin: (oldPin: string, newPin: string) => Promise<string | null>; // also turns the PIN back on
  disablePin: (pin: string) => Promise<string | null>;
  logout: () => Promise<boolean>; // wipes this device's copy; false (nothing wiped) while edits are not on the server yet
  dropSession: () => void; // 401: forget the token, keep the cached data
};

type AuthInfo = { server?: boolean; hasPin?: boolean; pinOff?: boolean; pinLen?: number | null; error?: string };

// pulled = the state is settled: local mode, or the latest pull from the server finished on this device.
// pulledOnce = local mode, or a pull finished since this session started (stays true across foreground re-pulls).
// update(fn, { force: true }) = an explicit replacement (backup import): its PUTs may empty the server's days.
// update(fn, { flush: true }) = push right away instead of after the 800 ms debounce (brain apply/undo).
// flush() = push now; true when everything is on the server. repull() = fetch the server copy again.
// remoteRev counts adopts/merges of a server copy (brain overwrite detection).
type UpdateOpts = { force?: boolean; flush?: boolean };
type Ctx = {
  s: State; update: (fn: (s: State) => void, opts?: UpdateOpts) => void; ready: boolean; pulled: boolean; pulledOnce: boolean; sync: SyncStatus;
  resync: () => void; flush: () => Promise<boolean>; repull: () => void; remoteRev: number; auth: Auth;
};
const StoreCtx = createContext<Ctx | null>(null);

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

const readAuthCache = (): AuthInfo | null => { try { const j = JSON.parse(ls.get(AUTH_CACHE) ?? "null"); return j && typeof j === "object" ? j : null; } catch { return null; } };
const cacheAuth = (patch: AuthInfo) => ls.set(AUTH_CACHE, JSON.stringify({ ...(readAuthCache() ?? {}), ...patch }));
const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, "content-type": "application/json" });

// localStorage is the offline cache; the server row (via /api/state) is the source of truth across devices.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode>("loading");
  const [hasPin, setHasPin] = useState(false);
  const [pinOff, setPinOff] = useState(false);
  const [pinLen, setPinLen] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [reason, setReason] = useState<Auth["reason"]>(null);
  const [sync, setSyncState] = useState<SyncStatus>("local");
  const syncRef = useRef<SyncStatus>("local"); // read by flush() right after a push, before React re-renders
  const setSync = useCallback((v: SyncStatus) => { syncRef.current = v; setSyncState(v); }, []);
  const [remoteRev, setRemoteRev] = useState(0);
  const [pulled, setPulled] = useState(false);
  const [pulledOnce, setPulledOnce] = useState(false);
  const [retry, setRetry] = useState(0); // bumped to re-run a failed pull/push (setPulled(false) is a no-op when already false)
  const dirty = useRef(false);
  const sRef = useRef(s);
  const tokenRef = useRef<string | null>(null);
  const baseRef = useRef(0);
  const forceRemote = useRef(false); // next adopt() takes the server copy whatever the timestamps (409 empty-state)
  const forcePush = useRef(false); // PUT with x-krob-force until the imported copy reaches the server
  const lastPullAt = useRef(0);
  const attempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const flushNext = useRef(false); // next debounced push runs with 0 ms delay
  const mergePending = useRef(false); // a 409 merge is queued but not rendered yet: sRef is still the old copy
  useEffect(() => { sRef.current = s; mergePending.current = false; }, [s]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const kick = useCallback(() => setRetry((n) => n + 1), []);
  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(kick, Math.min(60_000, 2_000 * 2 ** attempt.current++));
  }, [kick]);
  const setBase = useCallback((at: number) => { baseRef.current = at; ls.set(BASE, String(at)); }, []);

  useEffect(() => {
    const raw = ls.get(KEY);
    if (raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is client-only; read after hydration
      try { const parsed = JSON.parse(raw); if (isStateLike(parsed)) setS(normalize(parsed)); else throw new Error("not an object"); }
      catch { ls.set(`${KEY}.bad`, raw); ls.del(KEY); } // corrupt save: keep it aside, start clean
    }
    baseRef.current = Number(ls.get(BASE) || 0);
    const cached = readAuthCache();
    if (cached) { setHasPin(!!cached.hasPin); setPinOff(!!cached.pinOff); setPinLen(typeof cached.pinLen === "number" ? cached.pinLen : null); }
    const cur = ls.get(TOKEN);
    tokenRef.current = cur;
    setToken(cur);
    // Optimistic: a cached session means a server; the pull starts right away. Not when the cache says the PIN is
    // off and the network is up: the server may have turned it back on, so wait for its answer before painting.
    if (cur && !(cached?.pinOff && navigator.onLine)) setMode("server");
    setReady(true);
    (async () => {
      const j = await fetch("/api/auth/pin", { signal: AbortSignal.timeout(FETCH_TIMEOUT) }).then((r) => (r.ok || r.status === 503 ? r.json() : null)).catch(() => null) as AuthInfo | null;
      // Offline: keep the cached session (or the login screen when this device has seen the server before).
      if (!j) { if (!(cur || cached)) setReason("unreachable"); return setMode(cur || cached ? "server" : "local"); }
      // Configured but failing (503): login screen, never local mode, whose data the first pull would replace.
      // Without a cache the owner most likely has a PIN already, so ask for it rather than offering to create one.
      if (j.error) { if (!cached) setHasPin(true); return setMode("server"); }
      setHasPin(!!j.hasPin);
      setPinOff(!!j.pinOff);
      setPinLen(typeof j.pinLen === "number" ? j.pinLen : null);
      if (!j.server) ls.del(AUTH_CACHE); else cacheAuth({ hasPin: !!j.hasPin, pinOff: !!j.pinOff, pinLen: typeof j.pinLen === "number" ? j.pinLen : null });
      if (j.server) {
        const post = (body: object, auth?: string | null) => fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(FETCH_TIMEOUT) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const adoptToken = (res: { token?: string } | null) => { if (res?.token) { ls.set(TOKEN, res.token); tokenRef.current = res.token; setToken(res.token); } };
        // Renew a valid session in the background, or open without a PIN when the owner turned it off.
        // Only while that session is still the current one: a logout or a new login meanwhile wins.
        if (cur) void post({ refresh: true }, cur).then((r) => { if (tokenRef.current === cur) adoptToken(r); });
        else if (j.pinOff) adoptToken(await post({ open: true }));
      }
      setReason(j.server ? null : "unconfigured");
      setMode(j.server ? "server" : "local");
    })();
  }, []);

  const api = useCallback((path: string, init: RequestInit = {}) => fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...headers(token ?? "") } }), [token]);

  // 401: the session is gone (expired/revoked) but the cached data stays for the next login.
  const dropSession = useCallback(() => { ls.del(TOKEN); tokenRef.current = null; setToken(null); setPulled(false); setPulledOnce(false); setSync("local"); }, [setSync]);

  // Keep whichever copy is newer; an empty device (updatedAt 0) or a forced re-pull takes the server copy.
  // When the server is newer but this device also changed since the last sync, merge instead of dropping either.
  // The force flag and base are read here, not inside the updater (Strict Mode runs updaters twice).
  const adopt = useCallback((remote: State | null) => {
    const force = forceRemote.current;
    forceRemote.current = false;
    const base = baseRef.current;
    if (remote && isStateLike(remote)) setRemoteRev((n) => n + 1);
    setS((local) => {
      if (remote && isStateLike(remote) && (force || local.updatedAt === 0 || (remote.updatedAt ?? 0) > local.updatedAt)) {
        const r = normalize(remote);
        const both = !force && local.updatedAt > 0 && local.updatedAt > base;
        const next = both ? mergeStates(r, local) : r;
        ls.set(KEY, JSON.stringify(next));
        setBase(r.updatedAt);
        forcePush.current = false; // an import it replaced no longer needs forcing
        if (both) dirty.current = true; // the merged copy goes back to the server
        return next;
      }
      // Same copy as the server (the usual foreground re-pull): nothing to push.
      if (remote && isStateLike(remote) && (remote.updatedAt ?? 0) === local.updatedAt) { setBase(local.updatedAt); return local; }
      setBase(remote?.updatedAt ?? 0);
      dirty.current = true; // local is newer (or nothing on the server yet) -> push it
      return { ...local };
    });
  }, [setBase]);

  // First pull after login (and re-pull on foreground); retried with backoff on failure.
  useEffect(() => {
    if (mode !== "server" || !token || !ready || pulled) return;
    let cancelled = false;
    (async () => {
      setSync("syncing");
      const r = await api("/api/state", { signal: AbortSignal.timeout(FETCH_TIMEOUT) }).catch(() => null);
      if (cancelled) return;
      if (r?.status === 401) return dropSession();
      if (!r?.ok) { setSync("error"); return scheduleRetry(); }
      const j = (await r.json().catch(() => null)) as { data?: State | null } | null;
      if (cancelled) return;
      if (!j) { setSync("error"); return scheduleRetry(); }
      adopt(j.data ?? null);
      attempt.current = 0;
      lastPullAt.current = Date.now();
      setSync("synced");
      setPulled(true);
      setPulledOnce(true);
    })();
    return () => { cancelled = true; };
  }, [mode, token, ready, pulled, retry, api, dropSession, adopt, scheduleRetry, setSync]);

  // Serialized PUT of the current state (reads sRef when it actually runs). keepalive on hide: bodies above 64 KB
  // are not allowed with keepalive, so those fall back to a normal fetch.
  const push = useCallback((onHide = false) => {
    const run = async () => {
      const tok = tokenRef.current;
      if (!dirty.current || !tok || mergePending.current) return; // the push after the merge renders sends it
      dirty.current = false;
      setSync("syncing");
      const data = sRef.current;
      // keepalive's limit is in bytes (Thai text is 3 bytes per char in UTF-8), so measure the encoded body.
      const body = new TextEncoder().encode(JSON.stringify({ data, base: baseRef.current }));
      const r = await fetch("/api/state", { method: "PUT", headers: { ...headers(tok), ...(forcePush.current ? { "x-krob-force": "1" } : {}) }, body, keepalive: onHide && body.byteLength < 60_000 }).catch(() => null);
      if (r?.status === 401) { dirty.current = true; return dropSession(); } // pushed again after the next login
      if (r?.status === 409) {
        const j = (await r.json().catch(() => null)) as { error?: string; data?: State | null } | null;
        // This device would wipe the server's days: re-pull and take the server copy instead.
        if (j?.error === "empty-state") { forceRemote.current = true; return setPulled(false); }
        if (j?.error === "stale" && isStateLike(j.data)) {
          const remote = normalize(j.data);
          setBase(remote.updatedAt);
          // Another device wrote since our base: merge both (an import still replaces), then push the result.
          if (!forcePush.current) { mergePending.current = true; setRemoteRev((n) => n + 1); setS((local) => { const m = mergeStates(remote, local); ls.set(KEY, JSON.stringify(m)); return m; }); }
          dirty.current = true;
          return kick();
        }
        dirty.current = true;
        setSync("error");
        return scheduleRetry();
      }
      if (!r?.ok) { dirty.current = true; setSync("error"); return scheduleRetry(); }
      attempt.current = 0;
      forcePush.current = false;
      setBase(data.updatedAt);
      setSync("synced");
    };
    inflight.current = (inflight.current ?? Promise.resolve()).then(() => run(), () => run());
    return inflight.current;
  }, [dropSession, scheduleRetry, setBase, kick, setSync]);

  // User-facing: also forget the data on this device so an offline reopen shows nothing. Never while edits are
  // not on the server yet (dirty, or a copy newer than the last synced one): push first, refuse if that fails.
  const logout = useCallback(async () => {
    const unsynced = () => dirty.current || sRef.current.updatedAt > baseRef.current;
    if (unsynced() && tokenRef.current) { dirty.current = true; await push(); }
    if (unsynced()) return false;
    dropSession();
    ls.del(KEY); ls.del(PIN_VERIFIER); ls.del(BASE);
    clearBrainCache();
    baseRef.current = 0;
    forceRemote.current = false;
    forcePush.current = false;
    setS(DEFAULT);
    return true;
  }, [dropSession, push]);

  // Debounced push.
  useEffect(() => {
    if (mode !== "server" || !token || !pulled || !dirty.current) return;
    const t = setTimeout(() => { flushNext.current = false; void push(); }, flushNext.current ? 0 : 800);
    return () => clearTimeout(t);
  }, [s, mode, token, pulled, retry, push]);

  // Flush on hide; on return to foreground retry what failed and re-pull a stale copy (never while dirty).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { if (dirty.current && tokenRef.current) void push(true); return; }
      if (!dirty.current && Date.now() - lastPullAt.current > 60_000) setPulled(false);
      kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", onVis); clearTimeout(retryTimer.current); };
  }, [push, kick]);

  const update = useCallback((fn: (s: State) => void, opts?: UpdateOpts) => {
    if (opts?.force) forcePush.current = true;
    if (opts?.flush) flushNext.current = true;
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = Date.now();
      ls.set(KEY, JSON.stringify(next));
      dirty.current = true;
      return next;
    });
  }, []);

  // Push now (marks dirty when this copy is newer than the last synced one). Only after a pull, like the debounced push.
  const flush = useCallback(async () => {
    if (mode !== "server" || !tokenRef.current || !pulled) return false;
    if (sRef.current.updatedAt > baseRef.current) dirty.current = true;
    await push();
    return !dirty.current && syncRef.current === "synced";
  }, [mode, pulled, push]);
  const repull = useCallback(() => setPulled(false), []);

  const login = useCallback(async (pin: string) => {
    const r = await fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }), signal: AbortSignal.timeout(FETCH_TIMEOUT) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ต";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return typeof j.left === "number" ? `${j.error} (เหลือ ${j.left} ครั้ง)` : j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    ls.set(PIN_VERIFIER, await hashPin(pin));
    setHasPin(true);
    setPinLen(pin.length);
    cacheAuth({ hasPin: true, pinLen: pin.length });
    tokenRef.current = j.token;
    setToken(j.token);
    return null;
  }, []);

  // Local verifier first (instant, offline); otherwise the server decides (it rewrites the verifier on success,
  // so a PIN changed on another device self-heals here).
  const unlockLocal = useCallback(async (pin: string) => {
    const v = ls.get(PIN_VERIFIER);
    if (v && (await hashPin(pin)) === v) return true;
    if (!v || navigator.onLine) return (await login(pin)) === null;
    return false;
  }, [login]);

  const disablePin = useCallback(async (pin: string) => {
    const r = await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ disablePin: true, pin }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    tokenRef.current = j.token;
    setToken(j.token);
    setPinOff(true);
    cacheAuth({ pinOff: true });
    return null;
  }, [api]);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    const r = await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin: oldPin, newPin }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้";
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return j.error ?? `ผิดพลาด (${r.status})`;
    ls.set(TOKEN, j.token);
    ls.set(PIN_VERIFIER, await hashPin(newPin));
    tokenRef.current = j.token;
    setToken(j.token);
    setPinOff(false);
    setHasPin(true);
    setPinLen(newPin.length);
    cacheAuth({ hasPin: true, pinOff: false, pinLen: newPin.length });
    return null;
  }, [api]);

  const auth: Auth = { mode, hasPin, pinOff, pinLen, token, reason, login, unlockLocal, changePin, disablePin, logout, dropSession };
  return <StoreCtx.Provider value={{ s, update, ready, pulled: mode === "local" || pulled, pulledOnce: mode === "local" || pulledOnce, sync, resync: kick, flush, repull, remoteRev, auth }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

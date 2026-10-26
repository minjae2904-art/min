"use client";

// Screen Wake Lock for Live mode (v1.7 G3). Feature-detected, re-acquired when the app comes back to the foreground,
// released when inactive or unmounted. ok: null = not asked / unsupported yet, true = held, false = refused or lost.
// No NoSleep video hack; nothing here feeds server logic or reminders.
import { useEffect, useState } from "react";

export type WakeSentinel = { release: () => Promise<void>; addEventListener?: (t: "release", f: () => void) => void; removeEventListener?: (t: "release", f: () => void) => void };
export type WakeNav = { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } } | undefined;

// The sentinel, or null when the API is missing or the request is refused (low power mode, not visible, ...).
export async function acquire(nav: WakeNav): Promise<WakeSentinel | null> {
  try {
    if (!nav?.wakeLock || typeof nav.wakeLock.request !== "function") return null;
    return (await nav.wakeLock.request("screen")) ?? null;
  } catch { return null; }
}

export function useWakeLock(active: boolean): { ok: boolean | null } {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let cur: WakeSentinel | null = null;
    const onRelease = () => { if (alive && document.visibilityState === "visible") setOk(false); };
    const get = async () => {
      if (cur || document.visibilityState !== "visible") return;
      const w = await acquire(typeof navigator === "undefined" ? undefined : (navigator as unknown as WakeNav));
      if (!alive) { w?.release().catch(() => {}); return; }
      cur = w;
      setOk(!!w);
      w?.addEventListener?.("release", () => { cur = null; onRelease(); });
    };
    const onVis = () => { if (document.visibilityState === "visible") void get(); };
    void get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      cur?.release().catch(() => {});
      cur = null;
      setOk(null);
    };
  }, [active]);
  return { ok };
}

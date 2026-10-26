"use client";

import { useEffect, useRef, useState } from "react";
import { langHeader, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { useStore } from "@/lib/store";

type Health = { lastTick: string | null; devices: number; at: number };
export type HealthNotice = { kind: "cron" | "sync" | "local" | "unreachable"; text: string; href?: string; act?: string; retry?: () => void; dismiss: () => void };
const m = msgs(C), c = msgs(Common);
const PROBE_EVERY = 5 * 60_000;
const STALE_MS = 10 * 60_000;
const SYNC_ERR_MS = 30_000;
const LOCAL_HIDE = "krob-local-hide";
const localHidden = () => { try { return sessionStorage.getItem(LOCAL_HIDE) === "1"; } catch { return false; } };

// Today notice (NoticeSlot "health"): the cron has not reached the server for a while (push would be silent), sync is
// stuck, or local mode (no server session: no sync, no closed-app notifications) with the matching way out.
export function useHealthNotice(): HealthNotice | null {
  const { auth, sync } = useStore();
  const [h, setH] = useState<Health | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [localHide, setLocalHide] = useState(localHidden);
  const [syncStuck, setSyncStuck] = useState(false);
  const last = useRef(0);
  const server = auth.mode === "server" && !!auth.token;

  useEffect(() => {
    if (!server) return;
    const probe = async () => {
      if (document.hidden || Date.now() - last.current < PROBE_EVERY) return;
      last.current = Date.now();
      const r = await fetch("/api/push/status", { headers: { authorization: `Bearer ${auth.token}`, ...langHeader() }, signal: AbortSignal.timeout(5000) }).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as Omit<Health, "at"> | null) : null;
      if (j) setH({ ...j, at: Date.now() });
    };
    probe();
    document.addEventListener("visibilitychange", probe);
    return () => document.removeEventListener("visibilitychange", probe);
  }, [server, auth.token]);

  // Only a sync error that lasts a while counts; the cleanup clears the flag when sync recovers.
  useEffect(() => {
    if (sync !== "error") return;
    const t = setTimeout(() => setSyncStuck(true), SYNC_ERR_MS);
    return () => { clearTimeout(t); setSyncStuck(false); };
  }, [sync]);

  if (auth.mode === "local") {
    if (localHide) return null;
    const dismiss = () => { try { sessionStorage.setItem(LOCAL_HIDE, "1"); } catch {} setLocalHide(true); };
    return auth.reason === "unreachable"
      ? { kind: "unreachable", text: m("healthBanner.unreachable"), act: c("retry"), retry: () => location.reload(), dismiss }
      : { kind: "local", text: m("healthBanner.local"), act: m("healthBanner.howFix"), href: "/settings/notifications", dismiss };
  }
  if (!server || dismissed) return null;
  const age = h?.lastTick ? h.at - Date.parse(h.lastTick) : null;
  const cronStale = !!h && h.devices > 0 && (age === null || age > STALE_MS);
  if (!cronStale && !syncStuck) return null;
  return {
    kind: cronStale ? "cron" : "sync",
    text: cronStale ? m("healthBanner.cron.text", { age: age === null ? m("healthBanner.cron.long") : m("healthBanner.cron.min", { n: Math.round(age / 60_000) }) }) : m("healthBanner.syncStuck"),
    act: m("healthBanner.check"), href: "/settings/system", dismiss: () => setDismissed(true),
  };
}

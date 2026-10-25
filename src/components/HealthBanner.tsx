"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

type Health = { lastTick: string | null; devices: number; at: number };
const PROBE_EVERY = 5 * 60_000;
const STALE_MS = 10 * 60_000;
const SYNC_ERR_MS = 30_000;
const LOCAL_HIDE = "krob-local-hide";
const localHidden = () => { try { return sessionStorage.getItem(LOCAL_HIDE) === "1"; } catch { return false; } };

// Local mode (no server session): why sync and closed-app notifications cannot work, with the matching way out.
function LocalBanner({ reason }: { reason: "unconfigured" | "unreachable" | null }) {
  const [hidden, setHidden] = useState(localHidden);
  if (hidden) return null;
  const hide = () => { try { sessionStorage.setItem(LOCAL_HIDE, "1"); } catch {} setHidden(true); };
  const unreachable = reason === "unreachable";
  return (
    <div className="health-wrap">
      <div className="daymsg health" role="status">
        <span className="daymsg-link">
          {unreachable ? "ติดต่อ server ไม่ได้ตอนเปิดแอป ตอนนี้ใช้ข้อมูลในเครื่องไปก่อน" : "โหมดเฉพาะในเครื่อง: เว็บนี้ยังไม่ได้ต่อ server ข้อมูลจึงอยู่แค่ในเครื่องนี้ ไม่ซิงค์ และแจ้งเตือนตอนปิดแอปใช้ไม่ได้"}
        </span>
        {unreachable
          ? <button className="daymsg-btn" onClick={() => location.reload()}>ลองใหม่</button>
          : <Link href="/settings/notifications" className="daymsg-btn">ดูวิธีแก้</Link>}
        <button className="daymsg-x" aria-label="ปิด" onClick={hide}>x</button>
      </div>
    </div>
  );
}

// Today-screen warning when the cron has not reached the server for a while (push would be silent) or sync is stuck.
export function HealthBanner() {
  const { auth, sync } = useStore();
  const [h, setH] = useState<Health | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [syncStuck, setSyncStuck] = useState(false);
  const last = useRef(0);
  const server = auth.mode === "server" && !!auth.token;

  useEffect(() => {
    if (!server) return;
    const probe = async () => {
      if (document.hidden || Date.now() - last.current < PROBE_EVERY) return;
      last.current = Date.now();
      const r = await fetch("/api/push/status", { headers: { authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(5000) }).catch(() => null);
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

  if (auth.mode === "local") return <LocalBanner reason={auth.reason} />;
  if (!server || dismissed) return null;
  const age = h?.lastTick ? h.at - Date.parse(h.lastTick) : null;
  const cronStale = !!h && h.devices > 0 && (age === null || age > STALE_MS);
  if (!cronStale && !syncStuck) return null;
  const msg = cronStale
    ? `แจ้งเตือนตอนปิดแอปอาจไม่ทำงาน · ตัวสั่งงานหยุดมา ${age === null ? "นาน" : `${Math.round(age / 60_000)} นาที`}`
    : "ซิงค์ไม่สำเร็จมาสักพัก · แตะเพื่อตรวจสถานะระบบ";
  return (
    <div className="health-wrap">
      <div className="daymsg health" role="status">
        <Link href="/settings/system" className="daymsg-link">{msg}</Link>
        <button className="daymsg-x" aria-label="ปิด" onClick={() => setDismissed(true)}>x</button>
      </div>
    </div>
  );
}

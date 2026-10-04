"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { hashPin } from "@/lib/pin";
import { registerSW, setBadge } from "@/lib/push";
import { dueReminders } from "@/lib/reminders";
import { configureFeedback, play } from "@/lib/sound";
import { StoreProvider, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { IconBody, IconGear, IconGym, IconStats, IconToday } from "./Icons";
import { Login } from "./Login";
import { PinPad } from "./PinPad";
import { ProfileForm } from "./ProfileForm";
import { Toaster, toast } from "./ui";

export const ACCENTS = { blue: "#0a84ff", green: "#30c254", orange: "#ff9500", pink: "#ff2d55", purple: "#af52de", teal: "#30b0c7" } as const;

const TABS = [
  { href: "/", label: "วันนี้", Icon: IconToday },
  { href: "/gym", label: "ยิม", Icon: IconGym },
  { href: "/stats", label: "สถิติ", Icon: IconStats },
  { href: "/body", label: "ร่างกาย", Icon: IconBody },
  { href: "/settings", label: "ตั้งค่า", Icon: IconGear },
];

function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
        <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} onClick={() => play(path === href ? "tap" : "nav")}>
          <Icon size={26} />
          {label}
        </Link>
        );
      })}
    </nav>
  );
}

// While the app is open: app-icon badge = items due and not done; in-app toast when something comes due.
function useLiveReminders() {
  const { s } = useStore();
  const shown = useRef(new Set<string>());
  const state = useRef(s);
  useEffect(() => { state.current = s; }, [s]);
  useEffect(() => {
    let first = true; // don't toast what was already due when the app opened
    const check = () => {
      const { date, reminders, badge } = dueReminders(state.current, new Date());
      setBadge(badge);
      for (const r of reminders) {
        const k = `${date}|${r.key}`;
        if (r.level !== "due" || shown.current.has(k)) continue;
        shown.current.add(k);
        if (!first) { play("done"); toast(`ถึงเวลา: ${r.title}`); }
      }
      first = false;
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);
}

function Gate({ children }: { children: ReactNode }) {
  const { s, update, ready, session, authReady } = useStore();
  const [unlocked, setUnlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef(0);
  const { pinHash, pinLen, lockAfterMin, sound, soundVol, haptics, theme, accent, reduceMotion } = s.settings;

  useEffect(() => configureFeedback(sound, soundVol, haptics), [sound, soundVol, haptics]);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") delete el.dataset.theme; else el.dataset.theme = theme;
    if (accent === "blue") el.style.removeProperty("--blue"); else el.style.setProperty("--blue", ACCENTS[accent]);
    if (reduceMotion) el.dataset.motion = "off"; else delete el.dataset.motion;
  }, [theme, accent, reduceMotion]);
  useEffect(() => { registerSW(); }, []);
  useLiveReminders();

  // Blur content in the app switcher; re-lock after lockAfterMin away.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        setHidden(true);
      } else {
        setHidden(false);
        if (pinHash && Date.now() - hiddenAt.current >= lockAfterMin * 60_000) setUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pinHash, lockAfterMin]);

  if (!ready || !authReady) return null;
  if (supabase && !session) return <Login />;
  if (pinHash && !unlocked) {
    return <PinPad title="ใส่รหัส Krob" length={pinLen} onSubmit={async (p) => {
      const ok = (await hashPin(p)) === pinHash;
      play(ok ? "done" : "error");
      if (ok) setUnlocked(true);
      return ok;
    }} />;
  }
  if (!s.profile.setup) {
    return (
      <main className="screen">
        <Image src="/logo-256.png" alt="" width={72} height={72} className="app-logo" style={{ margin: "8px 0 16px" }} priority />
        <div className="eyebrow">ยินดีต้อนรับสู่ Krob</div>
        <h1 className="large-title">ตั้งค่าโปรไฟล์</h1>
        <div className="subtitle">ใช้คำนวณแคลอรี่ โปรตีน น้ำดื่ม และเป้าน้ำหนัก แก้ไขภายหลังได้ในหน้าตั้งค่า</div>
        <ProfileForm initial={s.profile} submitLabel="เริ่มใช้งาน" onSave={(p) => { play("complete"); update((x) => { x.profile = p; }); }} />
      </main>
    );
  }
  return (
    <>
      {children}
      <TabBar />
      {hidden && pinHash && <div className="privacy" />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <Gate>{children}</Gate>
      <Toaster />
    </StoreProvider>
  );
}

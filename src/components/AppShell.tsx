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
import { IconBody, IconGear, IconGym, IconStats, IconToday } from "./Icons";
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

const PIN_LEN = "krob-pinlen";
const storedPinLen = () => { try { return Number(localStorage.getItem(PIN_LEN)) || 6; } catch { return 6; } };

// Server mode, no session on this device: enter the PIN (or create it the very first time).
function PinLogin({ onDone }: { onDone: () => void }) {
  const { auth } = useStore();
  const [len, setLen] = useState(storedPinLen);
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const creating = !auth.hasPin;
  const title = creating ? (first ? "ใส่ PIN อีกครั้งเพื่อยืนยัน" : `ตั้ง PIN ${len} หลักสำหรับเข้าแอป`) : "ใส่ PIN เพื่อเข้า Krob";

  return (
    <>
      <PinPad
        key={`${len}-${first ? 1 : 0}`}
        title={title}
        length={len}
        onSubmit={async (p) => {
          if (creating && !first) { play("tap"); setFirst(p); return true; }
          if (creating && p !== first) { play("error"); setFirst(null); setMsg("PIN ไม่ตรงกัน ลองใหม่"); return false; }
          const err = await auth.login(p);
          if (err) { play("error"); setMsg(err); return false; }
          try { localStorage.setItem(PIN_LEN, String(len)); } catch {}
          play("complete");
          onDone();
          return true;
        }}
      />
      <div className="pin-extra">
        {msg && <div className="pin-msg">{msg}</div>}
        <button className="link" onClick={() => { play("tap"); setFirst(null); setMsg(""); setLen(len === 6 ? 4 : 6); }}>
          {len === 6 ? "ใช้ PIN 4 หลัก" : "ใช้ PIN 6 หลัก"}
        </button>
        {creating && <div className="pin-note">PIN แรกที่ตั้งจะเป็นรหัสเข้าแอปบนทุกเครื่อง เปลี่ยนได้ภายหลังในตั้งค่า</div>}
      </div>
    </>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { s, update, ready, auth } = useStore();
  const [unlocked, setUnlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef(0);
  const { pinHash, pinLen, lockAfterMin, pinOnOpen, sound, soundVol, haptics, theme, accent, reduceMotion } = s.settings;
  // Server mode: the PIN is the way in (no email) unless switched off; "ask on open" can be off per user choice.
  // Local mode: optional on-device lock.
  const needPin = auth.mode === "server" ? !auth.pinOff && pinOnOpen : !!pinHash;

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
        if (needPin && Date.now() - hiddenAt.current >= lockAfterMin * 60_000) setUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [needPin, lockAfterMin]);

  if (!ready || auth.mode === "loading") return null;
  // With the PIN off the store opens a session before mode leaves "loading"; if that failed, the PIN still works.
  if (auth.mode === "server" && !auth.token) return <PinLogin onDone={() => setUnlocked(true)} />;
  if (needPin && !unlocked) {
    return <PinPad title="ใส่ PIN เพื่อเข้า Krob" length={auth.mode === "server" ? storedPinLen() : pinLen} onSubmit={async (p) => {
      const ok = auth.mode === "server" ? await auth.unlockLocal(p) : (await hashPin(p)) === pinHash;
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
      {hidden && needPin && <div className="privacy" />}
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

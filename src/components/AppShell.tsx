"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { hashPin } from "@/lib/pin";
import { registerSW, setBadge } from "@/lib/push";
import { HealthBanner } from "./HealthBanner";
import { dueReminders } from "@/lib/reminders";
import { configureFeedback, play } from "@/lib/sound";
import { SYNC_LABEL, StoreProvider, useStore } from "@/lib/store";
import { IconBody, IconGear, IconGym, IconStats, IconToday } from "./Icons";
import { PinPad } from "./PinPad";
import { ProfileForm } from "./ProfileForm";
import { ConfirmSheet, Toaster, toast } from "./ui";

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
        <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => play(path === href ? "tap" : "nav")}>
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

// Neutral screen while the session or the first server copy is loading (the logo is precached by the SW).
function Splash({ label, onRetry }: { label?: string; onRetry?: () => void }) {
  return (
    <main className="screen" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
        <Image src="/logo-256.png" width={72} height={72} alt="" className="app-logo" unoptimized />
        {label && <div className="subtitle">{label}</div>}
        {onRetry && <button className="link" onClick={() => { play("tap"); onRetry(); }}>ลองอีกครั้ง</button>}
      </div>
    </main>
  );
}

// Server mode, no session on this device: enter the PIN (or create it the very first time).
function PinLogin({ onDone }: { onDone: () => void }) {
  const { auth } = useStore();
  const [len, setLen] = useState(() => auth.pinLen ?? storedPinLen());
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const creating = !auth.hasPin;
  const title = creating ? (first ? "ใส่ PIN อีกครั้งเพื่อยืนยัน" : `ตั้ง PIN ${len} หลักสำหรับเข้าแอป`) : "ใส่ PIN เพื่อเข้า Krob";

  return (
    <>
      <PinPad
        key={`${len}-${first ? 1 : 0}`}
        logo
        title={title}
        subtitle="ซิงค์ทุกเครื่องด้วย PIN เดียว"
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
  const { s, update, ready, pulledOnce, sync, resync, auth } = useStore();
  const path = usePathname();
  const [unlocked, setUnlocked] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [padMsg, setPadMsg] = useState("");
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef(0);
  const { pinHash, pinLen, lockAfterMin, pinOnOpen, sound, soundVol, haptics, theme, accent, reduceMotion } = s.settings;
  // Server mode: the PIN is the way in (no email) unless switched off; "ask on open" can be off per user choice.
  // Local mode: optional on-device lock.
  const server = auth.mode === "server";
  const needPin = server ? !auth.pinOff && pinOnOpen : !!pinHash;

  useEffect(() => configureFeedback(sound, soundVol, haptics), [sound, soundVol, haptics]);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") delete el.dataset.theme; else el.dataset.theme = theme;
    // Keep the iOS status bar / PWA chrome in step with the forced theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = theme === "auto" ? (m.media.includes("dark") ? "#000000" : "#f2f2f7") : theme === "dark" ? "#000000" : "#f2f2f7";
    });
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

  if (!ready || auth.mode === "loading") return <Splash />;
  // With the PIN off the store opens a session before mode leaves "loading"; if that failed, the PIN still works.
  if (server && !auth.token) return <PinLogin onDone={() => setUnlocked(true)} />;
  // The lock is an overlay, not an early return, so whatever was being typed survives a re-lock.
  const locked = needPin && !unlocked;
  const pad = locked ? (
    <>
      <PinPad
        logo
        title="ใส่ PIN เพื่อเข้า Krob"
        subtitle={server ? "ซิงค์ทุกเครื่องด้วย PIN เดียว" : undefined}
        message={padMsg}
        length={server ? auth.pinLen ?? storedPinLen() : pinLen}
        cancelLabel="ลืม PIN?"
        onCancel={server ? () => { play("tap"); setPadMsg(""); setConfirmLogout(true); } : undefined}
        onSubmit={async (p) => {
          const ok = server ? await auth.unlockLocal(p) : (await hashPin(p)) === pinHash;
          play(ok ? "done" : "error");
          if (ok) { setUnlocked(true); setPadMsg(""); }
          return ok;
        }}
      />
      {/* Own stacking context above .lock (z-index 100); toasts sit below the lock, so a refusal shows on the pad. */}
      <div style={{ position: "relative", zIndex: 101 }}>
        <ConfirmSheet
          open={confirmLogout}
          title="ออกจากระบบบนเครื่องนี้"
          body={"ข้อมูลในเครื่องนี้จะถูกลบ ข้อมูลบน server ยังอยู่ครบ\nเข้าด้วย PIN อีกครั้งเพื่อดึงข้อมูลกลับมา"}
          confirmLabel="ออกจากระบบ"
          danger
          onClose={() => setConfirmLogout(false)}
          onConfirm={() => { void auth.logout().then((ok) => { if (!ok) { play("error"); setPadMsg("ยังมีข้อมูลที่ยังไม่ซิงค์ เชื่อมต่อเน็ตแล้วลองใหม่"); } }); }}
        />
      </div>
    </>
  ) : null;
  if (!s.profile.setup) {
    // Nothing cached on this device yet: wait for the server copy instead of asking a returning user to set up again.
    // pulledOnce, not pulled: a foreground re-pull must not swap a half-filled setup form for the splash.
    if (server && !pulledOnce) return <><div inert={locked || undefined}><Splash label={sync === "error" ? SYNC_LABEL.error : "กำลังซิงค์..."} onRetry={sync === "error" ? resync : undefined} /></div>{pad}</>;
    return (
      <>
        <main className="screen" inert={locked || undefined}>
          <Image src="/logo-256.png" alt="" width={72} height={72} className="app-logo" style={{ margin: "8px 0 16px" }} priority unoptimized />
          <div className="eyebrow">ยินดีต้อนรับสู่ Krob</div>
          <h1 className="large-title">ตั้งค่าโปรไฟล์</h1>
          <div className="subtitle">ใช้คำนวณแคลอรี่ โปรตีน น้ำดื่ม และเป้าน้ำหนัก แก้ไขภายหลังได้ในหน้าตั้งค่า</div>
          <ProfileForm initial={{ ...s.profile, birth: "", heightCm: 0, startKg: 0, goalKg: 0 }} submitLabel="เริ่มใช้งาน" onSave={(p) => { play("complete"); update((x) => { x.profile = p; }); }} />
        </main>
        {pad}
      </>
    );
  }
  return (
    <>
      <div inert={locked || undefined}>
        {path === "/" && <HealthBanner />}
        {children}
        <TabBar />
      </div>
      {pad}
      {hidden && needPin && <div className="privacy" />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <Gate>{children}</Gate>
      {/* Below .privacy (99) and .lock (100), above sheets and the wizard: toasts never show or take taps over the lock. */}
      <div style={{ position: "relative", zIndex: 98 }}>
        <Toaster />
      </div>
    </StoreProvider>
  );
}

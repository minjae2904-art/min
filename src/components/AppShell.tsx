"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { hashPin } from "@/lib/pin";
import { applyUpdate, checkForUpdate, healPush, registerSW, setBadge } from "@/lib/push";
import { HealthBanner } from "./HealthBanner";
import { LaunchSplash } from "./LaunchSplash";
import L from "@/lib/launch.json";
import { LogoMark } from "./LogoMark";
import { dueReminders } from "@/lib/reminders";
import { configureFeedback, play } from "@/lib/sound";
import { SYNC_LABEL, StoreProvider, useStore } from "@/lib/store";
import { IconBody, IconGear, IconGym, IconStats, IconToday } from "./Icons";
import { PinPad } from "./PinPad";
import { ProfileForm } from "./ProfileForm";
import { TickTimeSheet } from "./TickTime";
import { ConfirmSheet, Toaster, motionOff, toast } from "./ui";

const TABS = [
  { href: "/", label: "วันนี้", Icon: IconToday },
  { href: "/gym", label: "ยิม", Icon: IconGym },
  { href: "/stats", label: "สถิติ", Icon: IconStats },
  { href: "/body", label: "ร่างกาย", Icon: IconBody },
  { href: "/settings", label: "ตั้งค่า", Icon: IconGear },
];

// Paths already shown since the app (JS) started: decorative first-visit entrances play once per path, not on every tab tap.
const seen = new Set<string>();
type Nav = "none" | "push" | "pop";
// Tab a path belongs to (-1 = none, e.g. the 404 page).
const tabOf = (p: string) => TABS.findIndex(({ href }) => (href === "/" ? p === "/" : p.startsWith(href)));
// Page entrance direction: deeper / shallower inside one tab (settings sub pages). Tab switches keep the plain rise.
function navDir(from: string, to: string): Nav {
  if (tabOf(from) !== tabOf(to)) return "none";
  const d = to.split("/").length - from.split("/").length;
  return d > 0 ? "push" : d < 0 ? "pop" : "none";
}

function TabBar() {
  const path = usePathname();
  const cur = tabOf(path);
  return (
    <nav className="tabbar" data-none={cur < 0 || undefined} style={{ ["--i" as string]: Math.max(0, cur), ["--n" as string]: TABS.length }}>
      <span className="tab-pill" aria-hidden />
      {TABS.map(({ href, label, Icon }, k) => {
        const active = k === cur;
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

// One persistent layer for every loading state (auth check, first sync, sync error): same mark, size and spot as the
// launch overlay, so the hand-off is invisible and the logo never restarts when the label changes.
function Splash({ label, onRetry, inert }: { label?: string; onRetry?: () => void; inert?: boolean }) {
  return (
    <div className="splash" role="status" inert={inert || undefined}>
      <LogoMark size={L.size} mode={onRetry ? "error" : "loading"} />
      <div className="splash-foot">
        {label ? <div key={label} className="subtitle">{label}</div> : <span className="sr-only">กำลังโหลด</span>}
        {onRetry && <button className="link" onClick={() => { play("tap"); onRetry(); }}>ลองอีกครั้ง</button>}
      </div>
    </div>
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
  const { s, update, ready, pulledOnce, sync, resync, flush, auth } = useStore();
  const path = usePathname();
  const [unlocked, setUnlocked] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [padMsg, setPadMsg] = useState("");
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef(0);
  const { pinHash, pinLen, lockAfterMin, pinOnOpen, sound, soundVol, haptics, theme, accent, textSize, reduceMotion } = s.settings;
  // Server mode: the PIN is the way in (no email) unless switched off; "ask on open" can be off per user choice.
  // Local mode: optional on-device lock.
  const server = auth.mode === "server";
  const needPin = server ? !auth.pinOff && pinOnOpen : !!pinHash;

  useEffect(() => configureFeedback(sound, soundVol, haptics), [sound, soundVol, haptics]);
  useEffect(() => {
    if (!ready) return; // DEFAULT settings before the store loads would undo the boot script (layout.tsx)
    const el = document.documentElement;
    if (theme === "auto") delete el.dataset.theme; else el.dataset.theme = theme;
    // Keep the iOS status bar / PWA chrome in step with the forced theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = theme === "auto" ? (m.media.includes("dark") ? "#000000" : "#f2f2f7") : theme === "dark" ? "#000000" : "#f2f2f7";
    });
    // Accent and text size are token switches in globals.css (html[data-accent], html[data-fs]); --blue stays info blue.
    if (accent === "blue") delete el.dataset.accent; else el.dataset.accent = accent;
    if (textSize === "md") delete el.dataset.fs; else el.dataset.fs = textSize;
    if (reduceMotion) el.dataset.motion = "off"; else delete el.dataset.motion;
    // Mirror for the boot script, so the next load applies all four before the first paint.
    try { localStorage.setItem("krob-ui", JSON.stringify({ theme, motion: reduceMotion ? "off" : "", accent, fs: textSize })); } catch {}
  }, [ready, theme, accent, textSize, reduceMotion]);
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

  const [padOut, setPadOut] = useState(false); // unlocked pad still on screen for its 320 ms exit
  const [nav, setNav] = useState<{ path: string; dir: Nav; first: boolean }>({ path, dir: "none", first: true });
  if (nav.path !== path) setNav({ path, dir: navDir(nav.path, path), first: !seen.has(path) }); // same pattern as ui.tsx:36-37
  // The page is on screen (main return, not under the PIN pad): first-visit entrances start now, e.g. at unlock.
  const live = ready && auth.mode !== "loading" && (!server || !!auth.token) && s.profile.setup && !(needPin && !unlocked);
  const first = nav.first && live;
  useEffect(() => {
    if (!first) return;
    seen.add(path);
    // Window for [data-first] rules (longest: body line 1 s); removing the attribute never starts an animation.
    const t = setTimeout(() => setNav((n) => ({ ...n, first: false })), motionOff() ? 0 : 1200);
    return () => clearTimeout(t);
  }, [first, path]);

  // Silent push repair on open and on resume (healPush throttles itself to once per 6 h per token), and again
  // when the SW reports a rotated subscription.
  const token = auth.token;
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => {
    if (!live || !server || !token) return;
    void healPush(token);
    const onVis = () => { if (document.visibilityState === "visible") void healPush(token); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [live, server, token]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "krob-push-sub-changed") void healPush(tokenRef.current, true); };
    sw.addEventListener("message", onMsg);
    return () => sw.removeEventListener("message", onMsg);
  }, []);

  // New deploy: offer the update; reload only after a tap (pending edits get up to 3 s to reach the server first).
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => {
    let lastCheck = 0, lastToast = 0;
    const run = async () => {
      if (document.hidden || Date.now() - lastCheck < 30 * 60_000) return;
      lastCheck = Date.now();
      if (!(await checkForUpdate()) || Date.now() - lastToast < 10 * 60_000) return;
      lastToast = Date.now();
      toast("อัปเดตใหม่พร้อมแล้ว", {
        action: "อัปเดต", ms: 15_000,
        onAction: async () => { toast("กำลังอัปเดต...", { ms: 12_000 }); await Promise.race([flushRef.current().catch(() => false), new Promise((r) => setTimeout(r, 3000))]); void applyUpdate(); },
      });
    };
    const t = setTimeout(run, 15_000);
    document.addEventListener("visibilitychange", run);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", run); };
  }, []);

  if (!ready || auth.mode === "loading") return <><Splash />{null}</>;
  // With the PIN off the store opens a session before mode leaves "loading"; if that failed, the PIN still works.
  if (server && !auth.token) return <PinLogin onDone={() => setUnlocked(true)} />;
  // The lock is an overlay, not an early return, so whatever was being typed survives a re-lock.
  const locked = needPin && !unlocked;
  const pad = locked || padOut ? (
    <>
      <PinPad
        logo
        leaving={!locked}
        title="ใส่ PIN เพื่อเข้า Krob"
        subtitle={server ? "ซิงค์ทุกเครื่องด้วย PIN เดียว" : undefined}
        message={padMsg}
        length={server ? auth.pinLen ?? storedPinLen() : pinLen}
        cancelLabel="ลืม PIN?"
        onCancel={server ? () => { play("tap"); setPadMsg(""); setConfirmLogout(true); } : undefined}
        onSubmit={async (p) => {
          const ok = server ? await auth.unlockLocal(p) : (await hashPin(p)) === pinHash;
          play(ok ? "done" : "error");
          if (ok) { setUnlocked(true); setPadMsg(""); setPadOut(true); setTimeout(() => setPadOut(false), motionOff() ? 0 : 320); } // timer: motion-off kills animationend
          return ok;
        }}
      />
      {/* Own stacking context above .lock (z-index 100); toasts sit below the lock, so a refusal shows on the pad. */}
      {locked && <div style={{ position: "relative", zIndex: 101 }}>
        <ConfirmSheet
          open={confirmLogout}
          title="ออกจากระบบบนเครื่องนี้"
          body={"ข้อมูลในเครื่องนี้จะถูกลบ ข้อมูลบน server ยังอยู่ครบ\nเข้าด้วย PIN อีกครั้งเพื่อดึงข้อมูลกลับมา"}
          confirmLabel="ออกจากระบบ"
          danger
          onClose={() => setConfirmLogout(false)}
          onConfirm={() => { void auth.logout().then((ok) => { if (!ok) { play("error"); setPadMsg("ยังมีข้อมูลที่ยังไม่ซิงค์ เชื่อมต่อเน็ตแล้วลองใหม่"); } }); }}
        />
      </div>}
    </>
  ) : null;
  if (!s.profile.setup) {
    // Nothing cached on this device yet: wait for the server copy instead of asking a returning user to set up again.
    // pulledOnce, not pulled: a foreground re-pull must not swap a half-filled setup form for the splash.
    if (server && !pulledOnce) return <><Splash label={sync === "error" ? SYNC_LABEL.error : "กำลังซิงค์..."} onRetry={sync === "error" ? resync : undefined} inert={locked} />{pad}</>;
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
      <div className="app" inert={locked || undefined} data-nav={nav.dir} data-first={first || undefined}>
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
        <TickTimeSheet />
      </div>
      <LaunchSplash />
    </StoreProvider>
  );
}

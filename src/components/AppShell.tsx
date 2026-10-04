"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { hashPin } from "@/lib/pin";
import { StoreProvider, useStore } from "@/lib/store";
import { setSoundOn } from "@/lib/sound";
import { supabase } from "@/lib/supabase";
import { ProfileForm } from "./ProfileForm";
import { Login } from "./Login";
import { IconBody, IconGear, IconGym, IconToday } from "./Icons";
import { PinPad } from "./PinPad";

const TABS = [
  { href: "/", label: "วันนี้", Icon: IconToday },
  { href: "/gym", label: "ยิม", Icon: IconGym },
  { href: "/body", label: "ร่างกาย", Icon: IconBody },
  { href: "/settings", label: "ตั้งค่า", Icon: IconGear },
];

function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className={`tab ${path === href ? "active" : ""}`}>
          <Icon size={26} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { s, update, ready, session, authReady } = useStore();
  setSoundOn(s.settings.sound);
  const [unlocked, setUnlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef(0);
  const { pinHash, pinLen, lockAfterMin } = s.settings;

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
      if (ok) setUnlocked(true);
      return ok;
    }} />;
  }
  if (!s.profile.setup) {
    return (
      <main className="screen">
        <div className="eyebrow">ยินดีต้อนรับสู่ Krob</div>
        <h1 className="large-title">ตั้งค่าโปรไฟล์</h1>
        <div className="subtitle">ใช้คำนวณแคลอรี่ โปรตีน น้ำดื่ม และเป้าน้ำหนัก แก้ไขภายหลังได้ในหน้าตั้งค่า</div>
        <ProfileForm initial={s.profile} submitLabel="เริ่มใช้งาน" onSave={(p) => update((x) => { x.profile = p; })} />
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
    </StoreProvider>
  );
}

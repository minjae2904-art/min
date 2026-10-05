"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { IconBell, IconDatabase, IconList, IconLock, IconPalette, IconPerson, IconPulse, IconTarget } from "@/components/Icons";
import { ProfileForm } from "@/components/ProfileForm";
import { Section, Sheet, Tile } from "@/components/ui";
import { age, targets } from "@/lib/health";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const SYNC_LABEL = { local: "เฉพาะในเครื่อง", syncing: "กำลังซิงค์...", synced: "ซิงค์แล้ว", error: "ซิงค์ไม่สำเร็จ" };

function NavRow({ href, color, icon, title, value }: { href: string; color: string; icon: React.ReactNode; title: string; value?: string }) {
  return (
    <Link href={href} className="row row-link" style={{ ["--inset" as string]: "57px" }} onClick={() => play("nav")}>
      <Tile color={color}>{icon}</Tile>
      <span className="row-main row-title">{title}</span>
      {value && <span className="row-value" style={{ fontSize: 15 }}>{value}</span>}
      <span className="chev">›</span>
    </Link>
  );
}

export default function Settings() {
  const { s, update, sync, auth } = useStore();
  const [editProfile, setEditProfile] = useState(false);
  const [now] = useState(() => Date.now());
  const p = s.profile;
  const set = s.settings;
  const custom = s.schedule.custom.length;
  const off = Object.values(s.schedule.overrides).filter((o) => o.enabled === false).length;

  function exportData() {
    play("done");
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `krob-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <main className="screen">
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 22px" }}>
        <Image src="/logo-256.png" alt="" width={60} height={60} className="app-logo" />
        <div>
          <h1 className="large-title" style={{ margin: 0 }}>ตั้งค่า</h1>
          <div className="subtitle" style={{ margin: 0 }}>Krob v0.9 · ครบทุกวัน ไม่ว่ากะไหน</div>
        </div>
      </div>

      <Section>
        <button className="row" style={{ ["--inset" as string]: "57px" }} onClick={() => setEditProfile(true)}>
          <Tile color="var(--blue)"><IconPerson size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{p.name || "โปรไฟล์"} · {p.sex === "m" ? "ชาย" : "หญิง"} · {age(p.birth)} ปี · {p.heightCm} cm</div>
            <div className="row-sub">{p.startKg} → {p.goalKg} kg · กินราว {targets(p, p.startKg).kcal.toLocaleString()} kcal · โปรตีน ~{targets(p, p.startKg).protein} g</div>
          </span>
          <span className="chev">›</span>
        </button>
      </Section>

      <Section>
        <NavRow href="/settings/schedule" color="var(--orange)" icon={<IconList size={18} />} title="ตารางประจำวัน" value={[s.schedule.shiftMin ? `เลื่อน ${s.schedule.shiftMin > 0 ? "+" : ""}${s.schedule.shiftMin} น.` : "", custom ? `+${custom} รายการ` : "", off ? `ปิด ${off}` : ""].filter(Boolean).join(" · ") || undefined} />
        <NavRow href="/settings/notifications" color="var(--red)" icon={<IconBell size={18} />} title="การแจ้งเตือน" value={set.dndUntil > now ? "พักอยู่" : undefined} />
        <NavRow href="/settings/goals" color="var(--green)" icon={<IconTarget size={18} />} title="เป้าหมาย" value={`วันที่ดี ${Math.round(set.goodDay * 100)}%`} />
        <NavRow href="/settings/appearance" color="var(--purple)" icon={<IconPalette size={18} />} title="รูปลักษณ์ เสียง การสั่น" />
        <NavRow href="/settings/privacy" color="var(--label2)" icon={<IconLock size={18} />} title="ความเป็นส่วนตัว" value={auth.mode === "server" ? (auth.pinOff ? "ไม่ใช้ PIN" : set.pinOnOpen ? "ขอ PIN ทุกครั้ง" : "PIN ครั้งแรก") : set.pinHash ? "ล็อกอยู่" : "ไม่ล็อก"} />
      </Section>

      {auth.mode === "server" && (
        <Section header="บัญชี" footer="เข้าแอปด้วย PIN อย่างเดียว ไม่ต้องใช้อีเมล ข้อมูลซิงค์ทุกเครื่องที่ใส่ PIN เดียวกัน">
          <div className="row"><span className="row-main row-title">เข้าด้วย PIN</span><span className="row-value">{auth.token ? "เข้าอยู่" : "-"}</span></div>
          <div className="row">
            <span className="row-main row-title">สถานะซิงค์</span>
            <span className="row-value" style={{ color: sync === "error" ? "var(--red)" : undefined }}>{SYNC_LABEL[sync]}</span>
          </div>
          <button className="row" onClick={() => { play("tap"); auth.logout(); }}><span className="row-main row-title" style={{ color: "var(--red)" }}>ออกจากระบบบนเครื่องนี้</span></button>
        </Section>
      )}

      <Section header="ระบบ">
        <NavRow href="/settings/system" color="var(--teal)" icon={<IconPulse size={18} />} title="สถานะระบบ / ทดสอบแจ้งเตือน" />
        <button className="row" style={{ ["--inset" as string]: "57px" }} onClick={exportData}>
          <Tile color="var(--blue)"><IconDatabase size={18} /></Tile>
          <span className="row-main row-title link">สำรองข้อมูล (JSON)</span>
        </button>
      </Section>

      <Section footer={auth.token ? "ข้อมูลซิงค์กับ Supabase อัตโนมัติ และเก็บสำรองในเครื่องสำหรับใช้ออฟไลน์" : "ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น"}>
        <button className="row" onClick={() => { if (confirm("ลบข้อมูลทั้งหมดในเครื่องนี้?")) { localStorage.removeItem("krob-v1"); location.reload(); } }}>
          <span className="row-main row-title" style={{ color: "var(--red)" }}>ลบข้อมูลในเครื่องนี้</span>
        </button>
      </Section>

      <Sheet open={editProfile} title="แก้ไขโปรไฟล์" onClose={() => setEditProfile(false)}>
        <div style={{ maxHeight: "70dvh", overflowY: "auto" }}>
          <ProfileForm initial={p} submitLabel="บันทึก" onSave={(np) => { play("done"); update((st) => { st.profile = np; }); setEditProfile(false); }} />
        </div>
      </Sheet>
    </main>
  );
}

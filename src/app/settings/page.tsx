"use client";

import { useState } from "react";
import { IconLock, IconPerson, IconSound } from "@/components/Icons";
import { ProfileForm } from "@/components/ProfileForm";
import { PinPad } from "@/components/PinPad";
import { Section, Segmented, Sheet, Switch, Tile } from "@/components/ui";
import { age, targets } from "@/lib/health";
import { hashPin } from "@/lib/pin";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const SYNC_LABEL = { local: "เฉพาะในเครื่อง", syncing: "กำลังซิงค์...", synced: "ซิงค์แล้ว", error: "ซิงค์ไม่สำเร็จ" };

export default function Settings() {
  const { s, update, session, sync } = useStore();
  const [setup, setSetup] = useState<null | { first?: string }>(null);
  const [editProfile, setEditProfile] = useState(false);
  const p = s.profile;
  const set = s.settings;

  if (setup) {
    return (
      <PinPad
        title={setup.first ? "ใส่รหัสอีกครั้ง" : `ตั้งรหัส ${set.pinLen} หลัก`}
        length={set.pinLen}
        onCancel={() => setSetup(null)}
        onSubmit={async (pin) => {
          if (!setup.first) { setSetup({ first: pin }); return true; }
          if (pin !== setup.first) { setSetup({}); return false; }
          const h = await hashPin(pin);
          update((st) => { st.settings.pinHash = h; });
          setSetup(null);
          return true;
        }}
      />
    );
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `krob-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <main className="screen">
      <h1 className="large-title">ตั้งค่า</h1>
      <div className="subtitle">Krob v0.2</div>

      <Section header="ทั่วไป">
        <button className="row" style={{ ["--inset" as string]: "57px" }} onClick={() => setEditProfile(true)}>
          <Tile color="var(--blue)"><IconPerson size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{p.name || "โปรไฟล์"} · {p.sex === "m" ? "ชาย" : "หญิง"} · {age(p.birth)} ปี · {p.heightCm} cm</div>
            <div className="row-sub">{p.startKg} → {p.goalKg} kg · กินราว {targets(p, p.startKg).kcal.toLocaleString()} kcal · โปรตีน ~{targets(p, p.startKg).protein} g</div>
          </span>
          <span className="chev">›</span>
        </button>
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--pink)"><IconSound size={18} /></Tile>
          <span className="row-main row-title">เสียงตอบสนองเมื่อกด</span>
          <Switch on={s.settings.sound} onChange={(v) => update((st) => { st.settings.sound = v; })} />
        </div>
      </Section>

      <Section header="ความเป็นส่วนตัว" footer="รหัสใช้กันคนอื่นเปิดดูบนเครื่อง หน้าจอจะเบลอเมื่อสลับแอป">
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--red)"><IconLock size={18} /></Tile>
          <span className="row-main row-title">ล็อกด้วยรหัส</span>
          <Switch on={!!set.pinHash} onChange={(v) => v ? setSetup({}) : update((st) => { st.settings.pinHash = null; })} />
        </div>
        {!set.pinHash && (
          <div className="row">
            <span className="row-main row-title">จำนวนหลัก</span>
            <div style={{ width: 140 }}>
              <Segmented value={String(set.pinLen)} options={[["4", "4"], ["6", "6"]]} onChange={(v) => update((st) => { st.settings.pinLen = Number(v); })} />
            </div>
          </div>
        )}
        {set.pinHash && (
          <div className="row">
            <span className="row-main row-title">ล็อกเมื่อออกจากแอป</span>
            <div style={{ width: 170 }}>
              <Segmented value={String(set.lockAfterMin)} options={[["0", "ทันที"], ["1", "1 น."], ["5", "5 น."]]} onChange={(v) => update((st) => { st.settings.lockAfterMin = Number(v); })} />
            </div>
          </div>
        )}
      </Section>

      {session && (
        <Section header="บัญชี">
          <div className="row"><span className="row-main row-title">{session.user.email}</span></div>
          <div className="row">
            <span className="row-main row-title">สถานะซิงค์</span>
            <span className="row-value" style={{ color: sync === "error" ? "var(--red)" : undefined }}>{SYNC_LABEL[sync]}</span>
          </div>
          <button className="row" onClick={() => supabase?.auth.signOut()}><span className="row-main row-title" style={{ color: "var(--red)" }}>ออกจากระบบ</span></button>
        </Section>
      )}

      <Sheet open={editProfile} title="แก้ไขโปรไฟล์" onClose={() => setEditProfile(false)}>
        <div style={{ maxHeight: "70dvh", overflowY: "auto" }}>
          <ProfileForm initial={p} submitLabel="บันทึก" onSave={(np) => { update((st) => { st.profile = np; }); setEditProfile(false); }} />
        </div>
      </Sheet>

      <Section header="ข้อมูล" footer={session ? "ข้อมูลซิงค์กับ Supabase อัตโนมัติ และเก็บสำรองในเครื่องสำหรับใช้ออฟไลน์" : "ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น"}>
        <button className="row" onClick={exportData}><span className="row-main row-title link">สำรองข้อมูล (JSON)</span></button>
        <button className="row" onClick={() => { if (confirm("ลบข้อมูลทั้งหมดในเครื่องนี้?")) { localStorage.removeItem("krob-v1"); location.reload(); } }}>
          <span className="row-main row-title" style={{ color: "var(--red)" }}>ลบข้อมูลทั้งหมด</span>
        </button>
      </Section>
    </main>
  );
}

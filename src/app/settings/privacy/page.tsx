"use client";

import { useState } from "react";
import { IconLock } from "@/components/Icons";
import { PinPad } from "@/components/PinPad";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { hashPin } from "@/lib/pin";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

export default function PrivacySettings() {
  const { s, update } = useStore();
  const [setup, setSetup] = useState<null | { first?: string }>(null);
  const set = s.settings;

  if (setup) {
    return (
      <PinPad
        title={setup.first ? "ใส่รหัสอีกครั้ง" : `ตั้งรหัส ${set.pinLen} หลัก`}
        length={set.pinLen}
        onCancel={() => setSetup(null)}
        onSubmit={async (pin) => {
          if (!setup.first) { play("tap"); setSetup({ first: pin }); return true; }
          if (pin !== setup.first) { play("error"); setSetup({}); return false; }
          const h = await hashPin(pin);
          update((st) => { st.settings.pinHash = h; });
          play("complete");
          toast("ตั้งรหัสแล้ว");
          setSetup(null);
          return true;
        }}
      />
    );
  }

  return (
    <main className="screen">
      <NavBar title="ความเป็นส่วนตัว" />

      <Section footer="รหัสใช้กันคนอื่นเปิดดูบนเครื่อง หน้าจอจะเบลอเมื่อสลับแอป ข้อมูลจริงป้องกันด้วยการล็อกอิน + Row Level Security ของ Supabase">
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
          <>
            <div className="row">
              <span className="row-main row-title">ล็อกเมื่อออกจากแอป</span>
              <div style={{ width: 200 }}>
                <Segmented value={String(set.lockAfterMin)} options={[["0", "ทันที"], ["1", "1 น."], ["5", "5 น."], ["15", "15 น."]]} onChange={(v) => update((st) => { st.settings.lockAfterMin = Number(v); })} />
              </div>
            </div>
            <button className="row" onClick={() => setSetup({})}><span className="row-main row-title link">เปลี่ยนรหัส</span></button>
          </>
        )}
      </Section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { IconLock } from "@/components/Icons";
import { PinPad } from "@/components/PinPad";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { hashPin } from "@/lib/pin";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Step = { stage: "old" | "new" | "confirm"; old?: string; next?: string; len: number };

export default function PrivacySettings() {
  const { s, update, auth } = useStore();
  const [step, setStep] = useState<Step | null>(null);
  const set = s.settings;
  const server = auth.mode === "server";

  if (step) {
    const title = step.stage === "old" ? "ใส่ PIN เดิม" : step.stage === "new" ? `ตั้ง PIN ใหม่ ${step.len} หลัก` : "ใส่ PIN ใหม่อีกครั้ง";
    return (
      <>
        <PinPad
          key={step.stage + step.len}
          title={title}
          length={step.stage === "old" ? Number(localStorage.getItem("krob-pinlen")) || set.pinLen : step.len}
          onCancel={() => setStep(null)}
          onSubmit={async (pin) => {
            if (step.stage === "old") { play("tap"); setStep({ ...step, stage: "new", old: pin }); return true; }
            if (step.stage === "new") { play("tap"); setStep({ ...step, stage: "confirm", next: pin }); return true; }
            if (pin !== step.next) { play("error"); setStep({ ...step, stage: "new", next: undefined }); toast("PIN ไม่ตรงกัน"); return false; }
            if (server) {
              const err = await auth.changePin(step.old ?? "", pin);
              if (err) { play("error"); toast(err); setStep(null); return false; }
              try { localStorage.setItem("krob-pinlen", String(step.len)); } catch {}
            } else {
              const h = await hashPin(pin);
              update((st) => { st.settings.pinHash = h; st.settings.pinLen = step.len; });
            }
            play("complete");
            toast("ตั้ง PIN แล้ว");
            setStep(null);
            return true;
          }}
        />
        {step.stage === "new" && (
          <div className="pin-extra">
            <button className="link" onClick={() => setStep({ ...step, len: step.len === 6 ? 4 : 6 })}>{step.len === 6 ? "ใช้ PIN 4 หลัก" : "ใช้ PIN 6 หลัก"}</button>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="screen">
      <NavBar title="ความเป็นส่วนตัว" />

      {server ? (
        <Section footer="เข้าแอปด้วย PIN อย่างเดียว ไม่ต้องใช้อีเมล PIN ตรวจที่ server ใส่ผิด 5 ครั้งจะล็อก 15 นาที หน้าจอเบลอเมื่อสลับแอป">
          <div className="row" style={{ ["--inset" as string]: "57px" }}>
            <Tile color="var(--red)"><IconLock size={18} /></Tile>
            <span className="row-main row-title">เข้าแอปด้วย PIN</span>
            <span className="row-value pill-on" style={{ fontSize: 14 }}>เปิดอยู่</span>
          </div>
          <button className="row" onClick={() => setStep({ stage: "old", len: Number(localStorage.getItem("krob-pinlen")) || 6 })}><span className="row-main row-title link">เปลี่ยน PIN</span></button>
          <div className="row">
            <span className="row-main row-title">ขอ PIN อีกครั้งเมื่อออกจากแอป</span>
            <div style={{ width: 200 }}>
              <Segmented value={String(set.lockAfterMin)} options={[["0", "ทันที"], ["1", "1 น."], ["5", "5 น."], ["15", "15 น."]]} onChange={(v) => update((st) => { st.settings.lockAfterMin = Number(v); })} />
            </div>
          </div>
        </Section>
      ) : (
        <Section footer="ยังไม่ได้เชื่อม server: PIN นี้ล็อกเฉพาะเครื่องนี้">
          <div className="row" style={{ ["--inset" as string]: "57px" }}>
            <Tile color="var(--red)"><IconLock size={18} /></Tile>
            <span className="row-main row-title">ล็อกด้วย PIN</span>
            <Switch on={!!set.pinHash} onChange={(v) => v ? setStep({ stage: "new", len: set.pinLen }) : update((st) => { st.settings.pinHash = null; })} />
          </div>
          {set.pinHash && (
            <div className="row">
              <span className="row-main row-title">ล็อกเมื่อออกจากแอป</span>
              <div style={{ width: 200 }}>
                <Segmented value={String(set.lockAfterMin)} options={[["0", "ทันที"], ["1", "1 น."], ["5", "5 น."], ["15", "15 น."]]} onChange={(v) => update((st) => { st.settings.lockAfterMin = Number(v); })} />
              </div>
            </div>
          )}
        </Section>
      )}
    </main>
  );
}

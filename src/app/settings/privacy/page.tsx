"use client";

import { useState } from "react";
import { IconLock } from "@/components/Icons";
import { PinPad } from "@/components/PinPad";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { hashPin } from "@/lib/pin";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

// Flows: change PIN (old -> new -> confirm), turn PIN on (new -> confirm), turn PIN off (current PIN).
type Step = { flow: "change" | "on" | "off"; stage: "old" | "new" | "confirm"; old?: string; next?: string; len: number };

const savedLen = () => { try { return Number(localStorage.getItem("krob-pinlen")) || 6; } catch { return 6; } };

export default function PrivacySettings() {
  const { s, update, auth } = useStore();
  const [step, setStep] = useState<Step | null>(null);
  const set = s.settings;
  const server = auth.mode === "server";

  async function finish(pin: string, st: Step): Promise<boolean> {
    if (st.flow === "off") {
      const err = await auth.disablePin(pin);
      if (err) { play("error"); toast(err); return false; }
      play("toggle");
      toast("ปิด PIN แล้ว เปิดแอปได้โดยไม่ต้องใส่ PIN");
      setStep(null);
      return true;
    }
    if (server) {
      const err = await auth.changePin(st.old ?? "", pin);
      if (err) { play("error"); toast(err); setStep(null); return false; }
      try { localStorage.setItem("krob-pinlen", String(st.len)); } catch {}
    } else {
      const h = await hashPin(pin);
      update((x) => { x.settings.pinHash = h; x.settings.pinLen = st.len; });
    }
    play("complete");
    toast(st.flow === "on" ? "เปิดใช้ PIN แล้ว" : "เปลี่ยน PIN แล้ว");
    setStep(null);
    return true;
  }

  if (step) {
    const title = step.flow === "off" ? "ใส่ PIN ปัจจุบันเพื่อปิด PIN" : step.stage === "old" ? "ใส่ PIN เดิม" : step.stage === "new" ? `ตั้ง PIN ใหม่ ${step.len} หลัก` : "ใส่ PIN ใหม่อีกครั้ง";
    return (
      <>
        <PinPad
          key={step.flow + step.stage + step.len}
          title={title}
          length={step.flow === "off" || step.stage === "old" ? (server ? savedLen() : set.pinLen) : step.len}
          onCancel={() => setStep(null)}
          onSubmit={async (pin) => {
            if (step.flow === "off") return finish(pin, step);
            if (step.stage === "old") { play("tap"); setStep({ ...step, stage: "new", old: pin }); return true; }
            if (step.stage === "new") { play("tap"); setStep({ ...step, stage: "confirm", next: pin }); return true; }
            if (pin !== step.next) { play("error"); setStep({ ...step, stage: "new", next: undefined }); toast("PIN ไม่ตรงกัน"); return false; }
            return finish(pin, step);
          }}
        />
        {step.stage === "new" && step.flow !== "off" && (
          <div className="pin-extra">
            <button className="link" onClick={() => setStep({ ...step, len: step.len === 6 ? 4 : 6 })}>{step.len === 6 ? "ใช้ PIN 4 หลัก" : "ใช้ PIN 6 หลัก"}</button>
          </div>
        )}
      </>
    );
  }

  const lockRow = (
    <div className="row">
      <span className="row-main row-title">ขอ PIN อีกครั้งเมื่อออกจากแอปเกิน</span>
      <div style={{ width: 200 }}>
        <Segmented value={String(set.lockAfterMin)} options={[["0", "ทันที"], ["1", "1 น."], ["5", "5 น."], ["15", "15 น."]]} onChange={(v) => update((x) => { x.settings.lockAfterMin = Number(v); })} />
      </div>
    </div>
  );

  return (
    <main className="screen">
      <NavBar title="ความเป็นส่วนตัว" />

      {server ? (
        <>
          <Section footer={auth.pinOff
            ? "PIN ปิดอยู่: ใครที่รู้ลิงก์เว็บนี้จะเปิดดูและแก้ข้อมูลของคุณได้ แนะนำให้เปิด PIN ไว้ หรือปิดแค่ 'ขอ PIN ทุกครั้ง' ด้านล่างแทน"
            : "PIN ตรวจที่ server ใส่ผิด 5 ครั้งจะล็อก 15 นาที หน้าจอเบลอเมื่อสลับแอป"}>
            <div className="row" style={{ ["--inset" as string]: "57px" }}>
              <Tile color={auth.pinOff ? "var(--label3)" : "var(--red)"}><IconLock size={18} /></Tile>
              <span className="row-main">
                <div className="row-title">ใช้ PIN เข้าแอป</div>
                <div className="row-sub">{auth.pinOff ? "ปิดอยู่ ไม่ต้องใส่ PIN ทุกเครื่อง" : "เปิดอยู่"}</div>
              </span>
              <Switch on={!auth.pinOff} onChange={(v) => v ? setStep({ flow: "on", stage: "new", len: savedLen() }) : setStep({ flow: "off", stage: "old", len: savedLen() })} />
            </div>
            {!auth.pinOff && <button className="row" onClick={() => setStep({ flow: "change", stage: "old", len: savedLen() })}><span className="row-main row-title link">เปลี่ยน PIN</span></button>}
          </Section>

          {!auth.pinOff && (
            <Section header="ความสะดวก" footer={set.pinOnOpen
              ? "ปิดสวิตช์นี้ถ้าไม่อยากใส่ PIN ทุกครั้ง: จะใส่แค่ครั้งแรกบนเครื่องนี้ เครื่องใหม่ยังต้องใช้ PIN เหมือนเดิม (ปลอดภัยกว่าปิด PIN ทั้งหมด)"
              : "เครื่องนี้จะไม่ถาม PIN อีก จนกว่าจะออกจากระบบ เครื่องใหม่ยังต้องใช้ PIN"}>
              <div className="row">
                <span className="row-main row-title">ขอ PIN ทุกครั้งที่เปิดแอป</span>
                <Switch on={set.pinOnOpen} onChange={(v) => update((x) => { x.settings.pinOnOpen = v; })} />
              </div>
              {set.pinOnOpen && lockRow}
            </Section>
          )}
        </>
      ) : (
        <Section footer="ยังไม่ได้เชื่อม server: PIN นี้ล็อกเฉพาะเครื่องนี้">
          <div className="row" style={{ ["--inset" as string]: "57px" }}>
            <Tile color="var(--red)"><IconLock size={18} /></Tile>
            <span className="row-main row-title">ล็อกด้วย PIN</span>
            <Switch on={!!set.pinHash} onChange={(v) => v ? setStep({ flow: "on", stage: "new", len: set.pinLen }) : update((x) => { x.settings.pinHash = null; })} />
          </div>
          {set.pinHash && lockRow}
        </Section>
      )}
    </main>
  );
}

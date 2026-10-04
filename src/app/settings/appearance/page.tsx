"use client";

import { ACCENTS } from "@/components/AppShell";
import { IconSound } from "@/components/Icons";
import { NavBar, Section, Segmented, Switch, Tile } from "@/components/ui";
import type { Accent } from "@/lib/model";
import { haptic, play, type Sound } from "@/lib/sound";
import { useStore } from "@/lib/store";

const ACCENT_LABEL: Record<Accent, string> = { blue: "ฟ้า", green: "เขียว", orange: "ส้ม", pink: "ชมพู", purple: "ม่วง", teal: "เขียวน้ำทะเล" };
const PREVIEW: [Sound, string][] = [["tap", "แตะ"], ["nav", "เปลี่ยนหน้า"], ["toggle", "สวิตช์"], ["done", "ติ๊กเสร็จ"], ["water", "ดื่มน้ำ"], ["complete", "ครบทั้งวัน"], ["undo", "ยกเลิก"], ["error", "ผิดพลาด"]];

export default function AppearanceSettings() {
  const { s, update } = useStore();
  const set = s.settings;

  return (
    <main className="screen">
      <NavBar title="รูปลักษณ์ เสียง การสั่น" />

      <Section header="ธีม">
        <div className="row">
          <div style={{ flex: 1 }}>
            <Segmented value={set.theme} options={[["auto", "ตามเครื่อง"], ["light", "สว่าง"], ["dark", "มืด"]]} onChange={(v) => update((st) => { st.settings.theme = v; })} />
          </div>
        </div>
      </Section>

      <Section header="สีหลัก" footer={ACCENT_LABEL[set.accent]}>
        <div className="row">
          <div className="color-dots">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <button key={a} aria-label={ACCENT_LABEL[a]} className={`color-dot ${set.accent === a ? "on" : ""}`} style={{ background: ACCENTS[a] }} onClick={() => { play("tap"); update((st) => { st.settings.accent = a; }); }} />
            ))}
          </div>
        </div>
      </Section>

      <Section header="การเคลื่อนไหว">
        <div className="row">
          <span className="row-main">
            <div className="row-title">ลดแอนิเมชัน</div>
            <div className="row-sub">ปิดการเคลื่อนไหวทั้งหมด (ประหยัดแบต)</div>
          </span>
          <Switch on={set.reduceMotion} onChange={(v) => update((st) => { st.settings.reduceMotion = v; })} />
        </div>
      </Section>

      <Section header="การสั่น" footer="iPhone: ใช้ได้กับ iOS 18 ขึ้นไป และต้องเปิด การตั้งค่า > เสียงและการสั่น > การสั่นของระบบ">
        <div className="row">
          <span className="row-main row-title">สั่นเมื่อกดและเปลี่ยนหน้า</span>
          <Switch on={set.haptics} onChange={(v) => update((st) => { st.settings.haptics = v; })} />
        </div>
        {set.haptics && <button className="row" onClick={() => haptic([12, 60, 12])}><span className="row-main row-title link">ทดลองสั่น</span></button>}
      </Section>

      <Section header="เสียง">
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--pink)"><IconSound size={18} /></Tile>
          <span className="row-main row-title">เสียงตอบสนอง</span>
          <Switch on={set.sound} onChange={(v) => update((st) => { st.settings.sound = v; })} />
        </div>
        {set.sound && (
          <div className="row">
            <span className="row-main row-title">ความดัง</span>
            <div style={{ width: 190 }}>
              <Segmented value={String(set.soundVol)} options={[["0.5", "เบา"], ["1", "ปกติ"], ["1.6", "ดัง"]]} onChange={(v) => { update((st) => { st.settings.soundVol = Number(v); }); setTimeout(() => play("done"), 30); }} />
            </div>
          </div>
        )}
      </Section>

      {set.sound && (
        <Section header="ลองฟังเสียง">
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PREVIEW.map(([k, label]) => <button key={k} className="chip" onClick={() => play(k)}>{label}</button>)}
          </div>
        </Section>
      )}
    </main>
  );
}

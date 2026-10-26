"use client";

import { IconCheck, IconSound } from "@/components/Icons";
import { NavBar, Section, Segmented, Switch, Tile } from "@/components/ui";
import { ACCENT_IDS, type Accent, type TextSize } from "@/lib/model";
import { configureFeedback, haptic, play, type Sound } from "@/lib/sound";
import { useStore } from "@/lib/store";

const ACCENT_LABEL: Record<Accent, string> = { blue: "ฟ้า", green: "เขียว", orange: "ส้ม", pink: "ชมพู", purple: "ม่วง", teal: "เขียวน้ำทะเล", indigo: "คราม", mint: "มิ้นต์" };
const TEXT_SIZE: [TextSize, string][] = [["sm", "เล็ก"], ["md", "ปกติ"], ["lg", "ใหญ่"], ["xl", "ใหญ่มาก"]];
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
            <Segmented label="ธีม" value={set.theme} options={[["auto", "ตามเครื่อง"], ["light", "สว่าง"], ["dark", "มืด"]]} onChange={(v) => update((st) => { st.settings.theme = v; })} />
          </div>
        </div>
      </Section>

      <Section header="โหมดกลางคืน" footer="ไม่ทำงานเมื่อเลือกธีมสว่าง">
        <div className="row">
          <span className="row-main">
            <div className="row-title">โหมดกลางคืนอัตโนมัติ</div>
            <div className="row-sub">พื้นดำสนิท สีอุ่น (เมื่อใช้สีหลักเริ่มต้น) ช่วงไลฟ์ ผ่อนคลาย และเวลานอน</div>
          </span>
          <Switch label="โหมดกลางคืนอัตโนมัติ" on={set.night} onChange={(v) => update((st) => { st.settings.night = v; })} />
        </div>
      </Section>

      <Section header="สีหลัก" footer={ACCENT_LABEL[set.accent]}>
        <div className="row">
          <div className="color-dots">
            {ACCENT_IDS.map((a) => (
              <button key={a} aria-label={ACCENT_LABEL[a]} aria-pressed={set.accent === a} className={`color-dot sw-${a} ${set.accent === a ? "on" : ""}`} onClick={() => { play("tap"); update((st) => { st.settings.accent = a; }); }}>
                {set.accent === a && <IconCheck size={14} weight={3} />}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section header="ขนาดตัวอักษร" footer="แอปบนหน้าจอโฮมไม่ตามขนาดตัวอักษรของ iPhone เสมอไป ปรับที่นี่แทน">
        <div className="row">
          <div className="row-main">
            <Segmented label="ขนาดตัวอักษร" value={set.textSize} options={TEXT_SIZE} onChange={(v) => update((st) => { st.settings.textSize = v; })} />
          </div>
        </div>
        <div className="row">
          <span className="row-time">13:00</span>
          <span className="row-main row-title">ตัวอย่าง: มื้อ 1 + creatine</span>
        </div>
      </Section>

      <Section header="การเคลื่อนไหว">
        <div className="row">
          <span className="row-main">
            <div className="row-title">ลดแอนิเมชัน</div>
            <div className="row-sub">ปิดการเคลื่อนไหวทั้งหมด (ประหยัดแบต)</div>
          </span>
          <Switch label="ลดแอนิเมชัน" on={set.reduceMotion} onChange={(v) => update((st) => { st.settings.reduceMotion = v; })} />
        </div>
      </Section>

      <Section header="การสั่น" footer="iPhone: ใช้ได้กับ iOS 18 ขึ้นไป และต้องเปิด การตั้งค่า > เสียงและการสั่น > การสั่นของระบบ">
        <div className="row">
          <span className="row-main row-title">สั่นเมื่อกดและเปลี่ยนหน้า</span>
          <Switch label="สั่นเมื่อกดและเปลี่ยนหน้า" on={set.haptics} onChange={(v) => update((st) => { st.settings.haptics = v; })} />
        </div>
        {set.haptics && <button className="row" onClick={() => haptic([12, 60, 12])}><span className="row-main row-title link">ทดลองสั่น</span></button>}
      </Section>

      <Section header="เสียง">
        <div className="row has-tile">
          <Tile color="var(--pink)"><IconSound size={18} /></Tile>
          <span className="row-main row-title">เสียงตอบสนอง</span>
          <Switch label="เสียงตอบสนอง" on={set.sound} onChange={(v) => update((st) => { st.settings.sound = v; })} />
        </div>
        {set.sound && (
          <div className="row">
            <span className="row-main row-title">ความดัง</span>
            <div className="row-ctrl sm">
              <Segmented label="ความดัง" value={String(set.soundVol)} options={[["0.5", "เบา"], ["1", "ปกติ"], ["1.6", "ดัง"]]} onChange={(v) => { update((st) => { st.settings.soundVol = Number(v); }); configureFeedback(set.sound, Number(v), set.haptics); play("done"); }} />
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

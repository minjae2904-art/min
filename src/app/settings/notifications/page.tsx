"use client";

import { useState } from "react";
import { IconDrop, IconEye, IconMoon } from "@/components/Icons";
import { PushDoctor } from "@/components/PushDoctor";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { addDays, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { buildDay } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const KINDS: [string, string][] = [
  ["meal", "มื้ออาหาร / ของว่าง"], ["supp", "Whey / Creatine"], ["gym", "ยิม / คาร์ดิโอ"], ["weigh", "ชั่งน้ำหนัก"],
  ["personality", "ฝึกบุคลิกภาพ"], ["trade", "เทรด"], ["habit", "นิสัย (skincare, journal ฯลฯ)"], ["sleep", "เวลานอน"],
  ["sing", "ร้องเพลง"], ["mc", "เซิร์ฟเวอร์ Minecraft"], ["game", "เกม: เตือนพักสายตาระหว่างเล่น"],
  ["stream", "ไลฟ์สตรีม: เตรียมไลฟ์ เริ่มไลฟ์ ตัดคลิป + พักเสียงระหว่างไลฟ์"],
  ["care", "ดูแลตัวเอง: กิจวัตรที่เปิดเตือน + ทากันแดดซ้ำวันร้อน"],
];

export default function NotificationSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const [now, setNow] = useState(() => Date.now());
  const dnd = set.dndUntil > now;

  const pause = (ms: number) => { play("toggle"); const t = Date.now(); setNow(t); update((st) => { st.settings.dndUntil = t + ms; }); toast("พักการแจ้งเตือนแล้ว"); };
  // Until the next planned wake-up (weigh item, same as SleepWake) - handy right before sleeping.
  // Once today's wake has passed, tomorrow's template decides (its wake may differ, e.g. a per-template override).
  const untilWake = () => {
    const d = new Date();
    const date = logicalDate(d);
    const nowMin = logicalMinutes(d);
    const day = dayFor(s, date);
    const items = buildDay(day.type, day.meal2, s.schedule, day.shiftMin ?? 0, { date });
    const wake = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 13 * 60;
    let mins = wake - nowMin;
    if (mins <= 0) {
      const tom = dayFor(s, addDays(date, 1));
      const w2 = buildDay(tom.type, tom.meal2, s.schedule, tom.shiftMin ?? 0, { date: addDays(date, 1) }).find((i) => i.id === "weigh")?.min ?? 780;
      mins = w2 + 1440 - nowMin;
    }
    pause(mins * 60_000);
  };

  return (
    <main className="screen">
      <NavBar title="การแจ้งเตือน" />

      <PushDoctor />

      <Section header="พักการแจ้งเตือน" footer={dnd ? `พักถึง ${new Date(set.dndUntil).toLocaleString("th-TH", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "หยุดทุกการแจ้งเตือนชั่วคราว เช่น ตอนประชุมหรือวันลา"}>
        {dnd ? (
          <button className="row" onClick={() => { play("toggle"); update((st) => { st.settings.dndUntil = 0; }); }}>
            <span className="icon-btn ic-purple"><IconMoon size={18} /></span>
            <span className="row-main row-title link">เปิดการแจ้งเตือนต่อ</span>
          </button>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="chip" onClick={() => pause(3600e3)}>1 ชม.</button>
            <button className="chip" onClick={() => pause(3 * 3600e3)}>3 ชม.</button>
            <button className="chip" onClick={() => pause(8 * 3600e3)}>8 ชม.</button>
            <button className="chip" onClick={untilWake}>ถึงเวลาตื่น</button>
          </div>
        )}
      </Section>

      <Section header="รูปแบบ" footer='ตัวอย่างบนหน้าจอล็อก: "15:00 · เทรด 1 ไม้ตามแผน" และ "ตอนนี้ 21:00 · พักกะ - ต้องทำ: มื้อหลัก 2"'>
        <div className="row">
          <span className="row-main">
            <div className="row-title">แสดงเวลาในหัวข้อ</div>
            <div className="row-sub">ขึ้นเวลาที่ต้องทำนำหน้าทุกแจ้งเตือน</div>
          </span>
          <Switch label="แสดงเวลาในหัวข้อ" on={set.notifShowTime} onChange={(v) => update((st) => { st.settings.notifShowTime = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">แจ้งเมื่อเข้าช่วงเวลาใหม่</div>
            <div className="row-sub">บอกว่าตอนนี้คือช่วงอะไรและต้องทำอะไรบ้าง</div>
          </span>
          <Switch label="แจ้งเมื่อเข้าช่วงเวลาใหม่" on={set.notifyPhase} onChange={(v) => update((st) => { st.settings.notifyPhase = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">สรุปแผนตอนตื่น</div>
            <div className="row-sub">จำนวนรายการ ยิมส่วนไหน และเป้าน้ำของวันนี้</div>
          </span>
          <Switch label="สรุปแผนตอนตื่น" on={set.notifyBriefing} onChange={(v) => update((st) => { st.settings.notifyBriefing = v; })} />
        </div>
      </Section>

      <Section header="เตือนตามประเภทรายการ" footer="ปิดประเภทที่ไม่อยากให้เตือน รายการยังอยู่ในตารางตามเดิม">
        {KINDS.map(([k, label]) => (
          <div key={k} className="row">
            <span className="row-main row-title">{label}</span>
            <Switch label={label} on={set.notifyKinds[k] !== false} onChange={(v) => update((st) => { st.settings.notifyKinds = { ...st.settings.notifyKinds, [k]: v }; })} />
          </div>
        ))}
      </Section>

      <Section footer='ข้ามรอบที่มีมื้อหรือรายการอื่นใกล้กัน ±20 นาที · ระหว่างไลฟ์เตือนพักเสียง 5 นาที และไม่เตือนซ้ำ/เตือนดื่มน้ำ · เริ่มเกม/ไลฟ์แจ้งผ่าน "แจ้งเมื่อเข้าช่วงเวลาใหม่" · ระหว่างโหมดไลฟ์ มีเตือนพักบนจอเพิ่มด้วย'>
        <div className="row mini-seg">
          <span className="row-main row-title">เตือนพักระหว่างเกม/ไลฟ์ (นาที)</span>
          <div className="row-ctrl lg">
            <Segmented label="เตือนพักระหว่างเกม/ไลฟ์ (นาที)" value={String(set.gameBreakMin)} options={[["0", "ปิด"], ["30", "30"], ["45", "45"], ["60", "60"], ["90", "90"]]} onChange={(v) => update((st) => { st.settings.gameBreakMin = Number(v); })} />
          </div>
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">เตือนก่อนปิดไลฟ์ 15 นาที</div>
            <div className="row-sub">บอกเวลาไลฟ์พรุ่งนี้ + raid แล้วปิดตรงเวลา</div>
          </span>
          <Switch label="เตือนก่อนปิดไลฟ์ 15 นาที" on={set.notifyStreamWrap} onChange={(v) => update((st) => { st.settings.notifyStreamWrap = v; })} />
        </div>
      </Section>

      <Section header="เตือนซ้ำ" footer="ถ้ายังไม่ติ๊กหลังถึงเวลา จะเตือนอีกครั้ง (ไม่เตือนซ้ำรายการ 'นอน')">
        <div className="row mini-seg">
          <span className="row-main row-title">เตือนซ้ำหลัง</span>
          <div className="row-ctrl md">
            <Segmented label="เตือนซ้ำหลัง (นาที)" value={String(set.followUpMin)} options={[["0", "ปิด"], ["15", "15"], ["30", "30"], ["45", "45"], ["60", "60"]]} onChange={(v) => update((st) => { st.settings.followUpMin = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header="ประเภท">
        <div className="row has-tile">
          <Tile color="var(--teal)"><IconDrop size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">เตือนดื่มน้ำ</div>
            <div className="row-sub">เฉพาะเมื่อดื่มตามหลังเป้าเกิน 300 ml</div>
          </span>
          <Switch label="เตือนดื่มน้ำ" on={set.notifyWater} onChange={(v) => update((st) => { st.settings.notifyWater = v; })} />
        </div>
        {set.notifyWater && (
          <div className="row mini-seg">
            <span className="row-main row-title">เช็กทุก</span>
            <div className="row-ctrl md">
              <Segmented label="เช็กน้ำทุก" value={String(set.waterEveryMin)} options={[["60", "1 ชม."], ["90", "1.5"], ["120", "2 ชม."], ["180", "3 ชม."]]} onChange={(v) => update((st) => { st.settings.waterEveryMin = Number(v); })} />
            </div>
          </div>
        )}
        <div className="row has-tile">
          <Tile color="var(--purple)"><IconMoon size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">สรุปก่อนนอน</div>
            <div className="row-sub">15 นาทีก่อนเวลานอน บอก % และสิ่งที่ยังขาด</div>
          </span>
          <Switch label="สรุปก่อนนอน" on={set.notifySummary} onChange={(v) => update((st) => { st.settings.notifySummary = v; })} />
        </div>
        <div className="row has-tile">
          <Tile color="var(--gray)"><IconEye size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">ซ่อนรายละเอียดบนหน้าล็อก</div>
            <div className="row-sub">แสดงแค่ &quot;มีรายการที่ต้องทำ&quot;</div>
          </span>
          <Switch label="ซ่อนรายละเอียดบนหน้าล็อก" on={set.privateNotifications} onChange={(v) => update((st) => { st.settings.privateNotifications = v; })} />
        </div>
      </Section>

      <Section footer="ปิดเตือนบางรายการได้ที่ ตั้งค่า > แผนประจำวัน (ไอคอนกระดิ่ง)">
        <div className="row"><span className="row-main row-sub">ระบบเช็กทุก 1 นาทีผ่าน Supabase แล้วส่งถึง iPhone แม้ปิดแอป</span></div>
      </Section>
    </main>
  );
}

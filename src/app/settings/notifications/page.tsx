"use client";

import { useEffect, useState } from "react";
import { IconBell, IconDrop, IconEye, IconMoon } from "@/components/Icons";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { disablePush, enablePush, pushState, sendTest, type PushState } from "@/lib/push";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const KINDS: [string, string][] = [
  ["meal", "มื้ออาหาร / ของว่าง"], ["supp", "Whey / Creatine"], ["gym", "ยิม / คาร์ดิโอ"], ["weigh", "ชั่งน้ำหนัก"],
  ["personality", "ฝึกบุคลิกภาพ"], ["trade", "เทรด"], ["habit", "นิสัย (skincare, journal ฯลฯ)"], ["sleep", "เวลานอน"],
];

const PUSH_LABEL: Record<PushState | "busy", string> = {
  busy: "กำลังตรวจสอบ...", on: "เปิดอยู่บนเครื่องนี้", off: "ปิดอยู่", denied: "ถูกปิดในการตั้งค่า iPhone", unsupported: "อุปกรณ์นี้ไม่รองรับ", "needs-install": "ต้องติดตั้งลงหน้าจอโฮมก่อน",
};
const PUSH_FOOTER: Record<PushState | "busy", string> = {
  busy: "",
  on: "ตัวเลขบนไอคอนแอป = รายการที่ถึงเวลาแล้วแต่ยังไม่ทำ",
  off: "เปิดเพื่อรับแจ้งเตือนแม้ปิดแอป (iOS 16.4 ขึ้นไป)",
  denied: "ไปที่ การตั้งค่า iPhone > การแจ้งเตือน > Krob แล้วเปิดอนุญาต",
  unsupported: "เบราว์เซอร์นี้ไม่รองรับ Web Push",
  "needs-install": "เปิดใน Safari > ปุ่มแชร์ > เพิ่มไปยังหน้าจอโฮม แล้วเปิดแอปจากไอคอน",
};

export default function NotificationSettings() {
  const { s, update, session } = useStore();
  const set = s.settings;
  const [push, setPush] = useState<PushState | "busy">("busy");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { pushState().then(setPush); }, []);
  const dnd = set.dndUntil > now;

  const pause = (ms: number) => { play("toggle"); const t = Date.now(); setNow(t); update((st) => { st.settings.dndUntil = t + ms; }); toast("พักการแจ้งเตือนแล้ว"); };
  // Until the next wake-up (13:00 + schedule shift) - handy right before sleeping.
  const untilWake = () => {
    const d = new Date();
    const wake = new Date(d);
    wake.setHours(13, s.schedule.shiftMin, 0, 0);
    if (wake <= d) wake.setDate(wake.getDate() + 1);
    pause(wake.getTime() - d.getTime());
  };

  return (
    <main className="screen">
      <NavBar title="การแจ้งเตือน" />

      <Section footer={PUSH_FOOTER[push]}>
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--red)"><IconBell size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">แจ้งเตือนตอนปิดแอป</div>
            <div className="row-sub"><span className={`status-dot ${push === "on" ? "on" : ""}`} />{PUSH_LABEL[push]}</div>
          </span>
          {(push === "on" || push === "off") && (
            <Switch on={push === "on"} onChange={async (v) => {
              if (!session) return toast("ต้องเข้าสู่ระบบก่อน");
              setPush("busy");
              if (v) {
                const err = await enablePush(session);
                if (err) { play("error"); toast(err); } else { play("complete"); toast("เปิดการแจ้งเตือนแล้ว"); }
              } else await disablePush();
              setPush(await pushState());
            }} />
          )}
        </div>
        {push === "on" && session && (
          <button className="row" onClick={async () => { play("tap"); toast(await sendTest(session)); }}><span className="row-main row-title link">ส่งการแจ้งเตือนทดสอบ</span></button>
        )}
      </Section>

      <Section header="พักการแจ้งเตือน" footer={dnd ? `พักถึง ${new Date(set.dndUntil).toLocaleString("th-TH", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "หยุดทุกการแจ้งเตือนชั่วคราว เช่น ตอนประชุมหรือวันลา"}>
        {dnd ? (
          <button className="row" onClick={() => { play("toggle"); update((st) => { st.settings.dndUntil = 0; }); }}>
            <span className="icon-btn" style={{ color: "var(--purple)" }}><IconMoon size={18} /></span>
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
          <Switch on={set.notifShowTime} onChange={(v) => update((st) => { st.settings.notifShowTime = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">แจ้งเมื่อเข้าช่วงเวลาใหม่</div>
            <div className="row-sub">บอกว่าตอนนี้คือช่วงอะไรและต้องทำอะไรบ้าง</div>
          </span>
          <Switch on={set.notifyPhase} onChange={(v) => update((st) => { st.settings.notifyPhase = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">สรุปแผนตอนตื่น</div>
            <div className="row-sub">จำนวนรายการ ยิมส่วนไหน และเป้าน้ำของวันนี้</div>
          </span>
          <Switch on={set.notifyBriefing} onChange={(v) => update((st) => { st.settings.notifyBriefing = v; })} />
        </div>
      </Section>

      <Section header="เตือนตามประเภทรายการ" footer="ปิดประเภทที่ไม่อยากให้เตือน รายการยังอยู่ในตารางตามเดิม">
        {KINDS.map(([k, label]) => (
          <div key={k} className="row">
            <span className="row-main row-title">{label}</span>
            <Switch on={set.notifyKinds[k] !== false} onChange={(v) => update((st) => { st.settings.notifyKinds = { ...st.settings.notifyKinds, [k]: v }; })} />
          </div>
        ))}
      </Section>

      <Section header="เตือนซ้ำ" footer="ถ้ายังไม่ติ๊กหลังถึงเวลา จะเตือนอีกครั้ง (ไม่เตือนซ้ำรายการ 'นอน')">
        <div className="row mini-seg">
          <span className="row-main row-title">เตือนซ้ำหลัง</span>
          <div style={{ width: 210 }}>
            <Segmented value={String(set.followUpMin)} options={[["0", "ปิด"], ["15", "15"], ["30", "30"], ["45", "45"], ["60", "60"]]} onChange={(v) => update((st) => { st.settings.followUpMin = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header="ประเภท">
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--teal)"><IconDrop size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">เตือนดื่มน้ำ</div>
            <div className="row-sub">เฉพาะเมื่อดื่มตามหลังเป้าเกิน 300 ml</div>
          </span>
          <Switch on={set.notifyWater} onChange={(v) => update((st) => { st.settings.notifyWater = v; })} />
        </div>
        {set.notifyWater && (
          <div className="row mini-seg">
            <span className="row-main row-title">เช็กทุก</span>
            <div style={{ width: 210 }}>
              <Segmented value={String(set.waterEveryMin)} options={[["60", "1 ชม."], ["90", "1.5"], ["120", "2 ชม."], ["180", "3 ชม."]]} onChange={(v) => update((st) => { st.settings.waterEveryMin = Number(v); })} />
            </div>
          </div>
        )}
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--purple)"><IconMoon size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">สรุปก่อนนอน</div>
            <div className="row-sub">15 นาทีก่อนเวลานอน บอก % และสิ่งที่ยังขาด</div>
          </span>
          <Switch on={set.notifySummary} onChange={(v) => update((st) => { st.settings.notifySummary = v; })} />
        </div>
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--label2)"><IconEye size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">ซ่อนรายละเอียดบนหน้าล็อก</div>
            <div className="row-sub">แสดงแค่ &quot;มีรายการที่ต้องทำ&quot;</div>
          </span>
          <Switch on={set.privateNotifications} onChange={(v) => update((st) => { st.settings.privateNotifications = v; })} />
        </div>
      </Section>

      <Section footer="ปิดเตือนบางรายการได้ที่ ตั้งค่า > ตารางประจำวัน (ไอคอนกระดิ่ง)">
        <div className="row"><span className="row-main row-sub">ระบบเช็กทุก 1 นาทีผ่าน Supabase แล้วส่งถึง iPhone แม้ปิดแอป</span></div>
      </Section>
    </main>
  );
}

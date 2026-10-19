"use client";

import { useEffect, useState } from "react";
import { IconBell, IconDrop, IconEye, IconMoon } from "@/components/Icons";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { addDays, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { disablePush, enablePush, pushState, sendTest, type PushState } from "@/lib/push";
import { buildDay } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const KINDS: [string, string][] = [
  ["meal", "มื้ออาหาร / ของว่าง"], ["supp", "Whey / Creatine"], ["gym", "ยิม / คาร์ดิโอ"], ["weigh", "ชั่งน้ำหนัก"],
  ["personality", "ฝึกบุคลิกภาพ"], ["trade", "เทรด"], ["habit", "นิสัย (skincare, journal ฯลฯ)"], ["sleep", "เวลานอน"],
  ["sing", "ร้องเพลง"], ["mc", "เซิร์ฟเวอร์ Minecraft"], ["game", "เกม: เตือนพักสายตาระหว่างเล่น"],
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
  const { s, update, auth } = useStore();
  const set = s.settings;
  const [push, setPush] = useState<PushState | "busy">("busy");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { pushState().then(setPush); }, []);
  const dnd = set.dndUntil > now;

  const pause = (ms: number) => { play("toggle"); const t = Date.now(); setNow(t); update((st) => { st.settings.dndUntil = t + ms; }); toast("พักการแจ้งเตือนแล้ว"); };
  // Until the next planned wake-up (weigh item, same as SleepWake) - handy right before sleeping.
  // Once today's wake has passed, tomorrow's template decides (its wake may differ, e.g. a per-template override).
  const untilWake = () => {
    const d = new Date();
    const date = logicalDate(d);
    const nowMin = logicalMinutes(d);
    const day = dayFor(s, date);
    const items = buildDay(day.type, day.meal2, s.schedule, day.shiftMin ?? 0);
    const wake = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 13 * 60;
    let mins = wake - nowMin;
    if (mins <= 0) {
      const tom = dayFor(s, addDays(date, 1));
      const w2 = buildDay(tom.type, tom.meal2, s.schedule, tom.shiftMin ?? 0).find((i) => i.id === "weigh")?.min ?? 780;
      mins = w2 + 1440 - nowMin;
    }
    pause(mins * 60_000);
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
            <Switch label="แจ้งเตือนตอนปิดแอป" on={push === "on"} onChange={async (v) => {
              setPush("busy");
              try {
                if (v) {
                  const err = await enablePush(auth.token);
                  if (err) { play("error"); toast(err); } else { play("complete"); toast("เปิดการแจ้งเตือนแล้ว"); }
                } else await disablePush(auth.token);
              } catch (e) {
                play("error");
                toast((e as Error)?.name === "NotAllowedError" ? "iPhone ไม่อนุญาตการแจ้งเตือน ลองใหม่จากการแตะปุ่ม" : "เปลี่ยนการแจ้งเตือนไม่สำเร็จ");
              } finally {
                setPush(await pushState().catch(() => "off" as const));
              }
            }} />
          )}
        </div>
        {push === "on" && auth.token && (
          <button className="row" onClick={async () => { play("tap"); toast(await sendTest(auth.token)); }}><span className="row-main row-title link">ส่งการแจ้งเตือนทดสอบ</span></button>
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

      <Section footer='ข้ามรอบที่มีมื้อหรือรายการอื่นใกล้กัน ±20 นาที · เริ่มเกมและหยุดเกมแข่งแจ้งผ่าน "แจ้งเมื่อเข้าช่วงเวลาใหม่"'>
        <div className="row mini-seg">
          <span className="row-main row-title">เตือนพักระหว่างเกม</span>
          <div style={{ width: 210 }}>
            <Segmented label="เตือนพักระหว่างเกม" value={String(set.gameBreakMin)} options={[["0", "ปิด"], ["60", "60 นาที"], ["90", "90 นาที"]]} onChange={(v) => update((st) => { st.settings.gameBreakMin = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header="เตือนซ้ำ" footer="ถ้ายังไม่ติ๊กหลังถึงเวลา จะเตือนอีกครั้ง (ไม่เตือนซ้ำรายการ 'นอน')">
        <div className="row mini-seg">
          <span className="row-main row-title">เตือนซ้ำหลัง</span>
          <div style={{ width: 210 }}>
            <Segmented label="เตือนซ้ำหลัง (นาที)" value={String(set.followUpMin)} options={[["0", "ปิด"], ["15", "15"], ["30", "30"], ["45", "45"], ["60", "60"]]} onChange={(v) => update((st) => { st.settings.followUpMin = Number(v); })} />
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
          <Switch label="เตือนดื่มน้ำ" on={set.notifyWater} onChange={(v) => update((st) => { st.settings.notifyWater = v; })} />
        </div>
        {set.notifyWater && (
          <div className="row mini-seg">
            <span className="row-main row-title">เช็กทุก</span>
            <div style={{ width: 210 }}>
              <Segmented label="เช็กน้ำทุก" value={String(set.waterEveryMin)} options={[["60", "1 ชม."], ["90", "1.5"], ["120", "2 ชม."], ["180", "3 ชม."]]} onChange={(v) => update((st) => { st.settings.waterEveryMin = Number(v); })} />
            </div>
          </div>
        )}
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--purple)"><IconMoon size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">สรุปก่อนนอน</div>
            <div className="row-sub">15 นาทีก่อนเวลานอน บอก % และสิ่งที่ยังขาด</div>
          </span>
          <Switch label="สรุปก่อนนอน" on={set.notifySummary} onChange={(v) => update((st) => { st.settings.notifySummary = v; })} />
        </div>
        <div className="row" style={{ ["--inset" as string]: "57px" }}>
          <Tile color="var(--label2)"><IconEye size={18} /></Tile>
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

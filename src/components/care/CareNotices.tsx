"use client";

// Today notices of the self-care module (v1.7 spec 4.1): the one-time setup card and the doctor flag.
// Nothing changes until a tap; the level choice shows its diff in a toast with an exact undo.
import { IconBell, IconSpark } from "@/components/Icons";
import type { Notice } from "@/components/today/NoticeSlot";
import { toast } from "@/components/ui";
import { careFlag } from "@/lib/care/flags";
import { LEVEL_LABEL, LEVEL_SUMMARY } from "@/lib/care/presets";
import { applyLevel } from "@/lib/care/progress";
import { LEVELS, type Level } from "@/lib/care/types";
import { dayFor, type State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { waterGoal, weightStats } from "@/lib/stats";
import { CareFlag } from "./CareFlag";

type Upd = (fn: (x: State) => void) => void;

// Shared by the setup card and Settings > ดูแลตัวเอง. The toast text comes from a dry run on a copy (same inputs, same result).
export function applyLevelWithUndo(update: Upd, s: State, level: Level, date: string) {
  const probe = structuredClone(s);
  const res = applyLevel(probe, level, date);
  const prev = { care: structuredClone(s.care), routines: structuredClone(s.schedule.care ?? []) };
  const goal = waterGoal(probe, dayFor(probe, date), weightStats(probe, date).cur);
  play("done");
  update((x) => { applyLevel(x, level, date); });
  const parts = [`ตั้งระดับ ${LEVEL_LABEL[level]} แล้ว`, `เพิ่ม ${res.added} ขั้น`];
  if (res.off) parts.push(`ปิด ${res.off}`);
  if (res.water) parts.push(`เป้าน้ำ ${(goal / 1000).toFixed(1)} ลิตร`);
  toast(parts.join(" · "), { action: "เลิกทำ", onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
}

export function CareSetup({ date, close }: { date: string; close: () => void }) {
  const { s, update } = useStore();
  return (
    <div className="notice-sheet">
      <div className="sw-sub">กิจวัตรดูแลผิว ฟัน น้ำ ตา หู และเสียง จะไปอยู่ในแถวเดิมของวันนี้ (เช้า หลังยิม ก่อนไลฟ์ ก่อนนอน) ติ๊กทีละขั้นหรือกด เสร็จหมด ทีเดียวก็ได้ ปรับหรือปิดได้ทุกเมื่อที่ ตั้งค่า &gt; ดูแลตัวเอง</div>
      <div className="group care-levels">
        {LEVELS.map((l) => (
          <button key={l} className="row" onClick={() => { close(); applyLevelWithUndo(update, s, l, date); }}>
            <span className="row-main"><span className="row-title">{LEVEL_LABEL[l]}</span><span className="row-sub">{LEVEL_SUMMARY[l]}</span></span>
          </button>
        ))}
      </div>
      <div className="sw-actions">
        <button className="chip" onClick={() => { play("tap"); close(); update((x) => { x.care.asked = true; }); }}>ไว้ทีหลัง</button>
      </div>
      <div className="sw-sub">ข้อมูลสุขภาพทั่วไป ไม่ใช่คำแนะนำทางการแพทย์</div>
    </div>
  );
}

export function useCareNotices(date: string, pulled: boolean): Notice[] {
  const { s } = useStore();
  const out: Notice[] = [];
  if (pulled && s.settings.streamAsked && s.care.level === null && !s.care.asked) out.push({
    key: "care", tone: "accent", icon: <IconSpark size={18} />, text: "ใหม่: ดูแลตัวเอง (ผิว ฟัน น้ำ ตา เสียง) · แตะเพื่อเลือกระดับ",
    sheet: { title: "ดูแลตัวเอง", body: (close) => <CareSetup date={date} close={close} /> },
  });
  const flag = careFlag(s, date);
  if (flag) out.push({
    key: "flag", tone: "warn", icon: <IconBell size={18} />, text: flag.title,
    sheet: { title: flag.title, body: (close) => <CareFlag flag={flag} date={date} close={close} /> },
  });
  return out;
}

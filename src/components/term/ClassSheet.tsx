"use client";

// v1.8 class editor (Settings > ตารางเรียน). Add = one class per selected weekday; edit = one class, one weekday.
// Writes the whole term through sanitizeTerm, so a saved timetable is always valid. Every save and delete has undo.
import { useState } from "react";
import { Sheet, toast } from "@/components/ui";
import { dowName } from "@/lib/brain/copy";
import { ROLLOVER_HOUR, hm } from "@/lib/date";
import type { Cls } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { CLS_CAP, CLS_MAX, CLS_MIN, EARLY_WARN, newClsId, sanitizeTerm } from "@/lib/term";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
// "HH:MM" -> logical minutes (times before the 08:00 rollover land past 1440 and fail the range check).
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? Math.round(((h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m) / 5) * 5 : NaN; };

export function ClassSheet({ open, edit, onClose }: { open: boolean; edit: Cls | null; onClose: () => void }) {
  const { s, update } = useStore();
  const [title, setTitle] = useState(edit?.t ?? "");
  const [days, setDays] = useState<number[]>(edit ? [edit.d] : []);
  const [st, setSt] = useState(hm(edit?.s ?? 540));
  const [en, setEn] = useState(hm(edit?.e ?? 630));
  const [room, setRoom] = useState(edit?.r ?? "");
  const term = s.schedule.term;
  const a = toMin(st);

  const bad = (m: string) => { play("error"); toast(m); };
  const restore = (cls: Cls[]) => update((x) => { if (x.schedule.term) x.schedule.term = sanitizeTerm({ ...x.schedule.term, cls }) ?? x.schedule.term; });

  function pickDay(d: number) {
    play("tap");
    if (edit) setDays([d]);
    else setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));
  }

  function save() {
    if (!term) return;
    const t = title.trim().slice(0, 40), b = toMin(en);
    if (!t) return bad("ใส่ชื่อวิชา");
    if (!days.length) return bad("เลือกวันเรียน");
    if (!(a >= CLS_MIN && b <= CLS_MAX)) return bad("เรียนได้ตั้งแต่ 08:00 ถึง 23:59");
    if (b <= a) return bad("เวลาเลิกต้องหลังเวลาเริ่ม");
    if (b - a > 600) return bad("ยาวได้ไม่เกิน 10 ชม.");
    if (b - a < 15) return bad("เรียนอย่างน้อย 15 นาที");
    const others = term.cls.filter((c) => c.id !== edit?.id);
    if (others.length + days.length > CLS_CAP) return bad("เพิ่มได้สูงสุด 30 วิชา");
    const r = room.trim().slice(0, 20);
    const base = { s: a, e: b, t, ...(r ? { r } : {}) };
    let list: Cls[];
    if (edit) list = [...others, { id: edit.id, d: days[0], ...base }];
    else {
      list = [...term.cls];
      const now = Date.now();
      for (const d of days) list.push({ id: newClsId({ ...term, cls: list }, now), d, ...base });
    }
    const prev = term.cls;
    play("done");
    restore(list);
    toast(edit ? `บันทึกวิชา ${t} แล้ว` : days.length > 1 ? `เพิ่มวิชา ${t} ${days.length} วันแล้ว` : `เพิ่มวิชา ${t} แล้ว`, { action: "เลิกทำ", onAction: () => restore(prev) });
    onClose();
  }

  function remove() {
    if (!term || !edit) return;
    const prev = term.cls;
    play("undo");
    restore(prev.filter((c) => c.id !== edit.id));
    toast(`ลบวิชา ${edit.t} แล้ว`, { action: "เลิกทำ", onAction: () => restore(prev) });
    onClose();
  }

  return (
    <Sheet open={open} title={edit ? "แก้ไขวิชา" : "เพิ่มวิชา"} onClose={onClose}>
      <div className="cls-form">
        <label className="journal-label" htmlFor="cls-title">ชื่อวิชา</label>
        <input id="cls-title" className="field field--fill" value={title} maxLength={40} placeholder="เช่น แคลคูลัส 1" onChange={(e) => setTitle(e.target.value)} />
        <div className="journal-label" id="cls-days-label">{edit ? "วันเรียน" : "วันเรียน (เลือกได้หลายวัน)"}</div>
        <div className="chips cls-days" role="group" aria-labelledby="cls-days-label">
          {DOW.map((d, i) => (
            <button key={d} type="button" className={`chip chip--day ${days.includes(i) ? "on" : ""}`} aria-pressed={days.includes(i)} aria-label={dowName(i)} onClick={() => pickDay(i)}>{d}</button>
          ))}
        </div>
        <div className="cls-times">
          <label className="cls-time"><span className="journal-label">เริ่ม</span>
            <input className="time-input" type="time" step={300} value={st} onChange={(e) => setSt(e.target.value)} />
          </label>
          <label className="cls-time"><span className="journal-label">เลิก</span>
            <input className="time-input" type="time" step={300} value={en} onChange={(e) => setEn(e.target.value)} />
          </label>
        </div>
        {a >= CLS_MIN && a < EARLY_WARN && (
          <div className="sw-sub cls-note">เรียนก่อน 09:00: แอปเริ่มวันใหม่ 08:00 ตื่นก่อนนั้นยังจัดตารางให้ไม่ได้ · กดตื่นแล้วตอนเช้าได้ตามปกติ</div>
        )}
        <label className="journal-label" htmlFor="cls-room">ห้อง (ไม่บังคับ)</label>
        <input id="cls-room" className="field field--fill" value={room} maxLength={20} onChange={(e) => setRoom(e.target.value)} />
        <button className="btn cls-save" onClick={save}>บันทึก</button>
        {edit && <button className="btn danger cls-del" onClick={remove}>ลบวิชา</button>}
      </div>
    </Sheet>
  );
}

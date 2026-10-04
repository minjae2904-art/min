"use client";

import { useState } from "react";
import { IconPlus, IconTrash } from "@/components/Icons";
import { NavBar, Section, Segmented, Sheet, Switch, toast } from "@/components/ui";
import { ROLLOVER_HOUR, hm } from "@/lib/date";
import type { CustomItem } from "@/lib/model";
import { baseDay, buildDay, type DayType, type Ring } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const RING_LABEL: Record<Ring, string> = { food: "กิน", body: "ร่างกาย", habit: "นิสัย" };
const RING_COLOR: Record<Ring, string> = { food: "var(--ring-food)", body: "var(--ring-body)", habit: "var(--ring-habit)" };

// "HH:MM" <-> logical minutes (times before the rollover hour belong to the night after).
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m; };

export default function ScheduleSettings() {
  const { s, update } = useStore();
  const [type, setType] = useState<DayType>("work");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CustomItem>({ id: "", title: "", min: toMin("14:00"), ring: "habit", days: "both" });
  const cfg = s.schedule;
  const items = buildDay(type, undefined, { ...cfg, overrides: Object.fromEntries(Object.entries(cfg.overrides).map(([k, v]) => [k, { ...v, enabled: true }])) }).filter((i) => i.ring);
  const base = new Map(baseDay(type).map((i) => [i.id, i]));

  const ov = (id: string) => cfg.overrides[`${type}:${id}`] ?? {};
  const setOv = (id: string, patch: Partial<{ enabled: boolean; min: number; remind: boolean }>) =>
    update((st) => {
      const k = `${type}:${id}`;
      st.schedule.overrides[k] = { ...st.schedule.overrides[k], ...patch };
    });

  return (
    <main className="screen">
      <NavBar title="ตารางประจำวัน" sub="ปรับเวลา เปิด/ปิดรายการ ตั้งเตือนรายข้อ และเพิ่มรายการของคุณเอง" />

      <Section header="เลื่อนทั้งตาราง" footer="ใช้เมื่อตื่นช้า/เร็วกว่าปกติ เลื่อนทุกรายการส่วนตัว (ไม่รวมเวลาเข้า-เลิกงาน)">
        <div className="row">
          <button className="chip" onClick={() => { play("tap"); update((st) => { st.schedule.shiftMin = Math.max(-180, st.schedule.shiftMin - 15); }); }}>-15</button>
          <span className="row-main" style={{ textAlign: "center" }}>
            <span className="big-number" style={{ fontSize: 24 }}>{cfg.shiftMin > 0 ? "+" : ""}{cfg.shiftMin}</span> <span className="row-sub">นาที</span>
          </span>
          <button className="chip" onClick={() => { play("tap"); update((st) => { st.schedule.shiftMin = Math.min(180, st.schedule.shiftMin + 15); }); }}>+15</button>
        </div>
        {cfg.shiftMin !== 0 && <button className="row" onClick={() => { play("undo"); update((st) => { st.schedule.shiftMin = 0; }); }}><span className="row-main row-title link">กลับเป็นเวลาเดิม</span></button>}
      </Section>

      <Segmented value={type} options={[["work", "วันทำงาน"], ["off", "วันหยุด"]]} onChange={setType} />

      <Section header="รายการ" footer="แตะเวลาเพื่อแก้ · สวิตช์ = ใช้รายการนี้ · ไอคอนกระดิ่ง = แจ้งเตือนรายการนี้">
        {items.map((i) => {
          const o = ov(i.id);
          const enabled = o.enabled !== false;
          const remind = o.remind !== false;
          const changed = o.min !== undefined;
          return (
            <div key={i.id} className={`row ${enabled ? "" : "disabled"}`}>
              <input
                className="time-input"
                type="time"
                value={hm(i.min)}
                disabled={!enabled}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const m = toMin(e.target.value);
                  if (i.custom) update((st) => { const c = st.schedule.custom.find((x) => x.id === i.id); if (c) c.min = m - st.schedule.shiftMin; });
                  else setOv(i.id, { min: m });
                }}
              />
              <span className="row-main">
                <div className="row-title" style={{ fontSize: 16 }}>{i.title}</div>
                <div className="row-sub">
                  <span style={{ color: RING_COLOR[i.ring!] }}>{RING_LABEL[i.ring!]}</span>
                  {i.custom ? " · ของคุณ" : changed ? ` · เดิม ${hm((base.get(i.id)?.min ?? i.min) + cfg.shiftMin)}` : ""}
                </div>
              </span>
              <button className="icon-btn" aria-label="แจ้งเตือน" style={{ color: remind && enabled ? "var(--blue)" : "var(--label3)" }} onClick={() => { play("tap"); setOv(i.id, { remind: !remind }); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={remind ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16zM10 20a2 2 0 004 0" /></svg>
              </button>
              {i.custom ? (
                <button className="icon-btn" aria-label="ลบ" style={{ color: "var(--red)" }} onClick={() => { play("undo"); update((st) => { st.schedule.custom = st.schedule.custom.filter((x) => x.id !== i.id); }); }}><IconTrash size={18} /></button>
              ) : (
                <Switch on={enabled} onChange={(v) => setOv(i.id, { enabled: v })} />
              )}
            </div>
          );
        })}
        <button className="row" onClick={() => { setDraft({ id: "", title: "", min: toMin("14:00"), ring: "habit", days: type }); setAdding(true); }}>
          <span className="icon-btn" style={{ color: "var(--blue)" }}><IconPlus size={20} /></span>
          <span className="row-main row-title link">เพิ่มรายการของคุณ</span>
        </button>
      </Section>

      <Section>
        <button className="row" onClick={() => {
          if (!confirm("รีเซ็ตเวลาและการเปิด/ปิดของรายการทั้งหมดในวันนี้กลับเป็นค่าเริ่มต้น?")) return;
          play("undo");
          update((st) => { for (const k of Object.keys(st.schedule.overrides)) if (k.startsWith(`${type}:`)) delete st.schedule.overrides[k]; });
          toast("รีเซ็ตแล้ว");
        }}><span className="row-main row-title" style={{ color: "var(--red)" }}>รีเซ็ตตาราง{type === "work" ? "วันทำงาน" : "วันหยุด"}</span></button>
      </Section>

      <Sheet open={adding} title="เพิ่มรายการ" onClose={() => setAdding(false)}>
        <Section>
          <label className="row form-row">
            <span className="row-title" style={{ width: 90 }}>ชื่อ</span>
            <input className="inline-input" placeholder="เช่น ยืดเหยียด 10 นาที" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="row form-row">
            <span className="row-title" style={{ width: 90 }}>รายละเอียด</span>
            <input className="inline-input" placeholder="ไม่บังคับ" value={draft.sub ?? ""} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} />
          </label>
          <label className="row form-row">
            <span className="row-title" style={{ width: 90 }}>เวลา</span>
            <span className="row-main" />
            <input className="time-input" type="time" value={hm(draft.min)} onChange={(e) => e.target.value && setDraft({ ...draft, min: toMin(e.target.value) })} />
          </label>
          <div className="row">
            <span className="row-title" style={{ width: 90 }}>หมวด</span>
            <div style={{ flex: 1 }}><Segmented value={draft.ring} options={[["food", "กิน"], ["body", "ร่างกาย"], ["habit", "นิสัย"]]} onChange={(v) => setDraft({ ...draft, ring: v })} /></div>
          </div>
          <div className="row">
            <span className="row-title" style={{ width: 90 }}>ใช้วัน</span>
            <div style={{ flex: 1 }}><Segmented value={draft.days} options={[["work", "ทำงาน"], ["off", "หยุด"], ["both", "ทุกวัน"]]} onChange={(v) => setDraft({ ...draft, days: v })} /></div>
          </div>
        </Section>
        <button className="btn" disabled={!draft.title.trim()} style={{ opacity: draft.title.trim() ? 1 : 0.5 }} onClick={() => {
          play("done");
          const id = `c-${Date.now().toString(36)}`;
          update((st) => { st.schedule.custom.push({ ...draft, id, title: draft.title.trim(), sub: draft.sub?.trim() || undefined, min: draft.min - st.schedule.shiftMin }); });
          setAdding(false);
          toast(`เพิ่ม "${draft.title.trim()}" แล้ว`);
        }}>เพิ่ม</button>
      </Sheet>
    </main>
  );
}

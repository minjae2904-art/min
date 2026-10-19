"use client";

import { useState } from "react";
import { MiniTimeline } from "@/components/MiniTimeline";
import { TemplatePicker } from "@/components/TemplatePicker";
import { ConfirmSheet, NavBar, Section, toast } from "@/components/ui";
import { applyWeekPlan } from "@/lib/actions";
import { addDays, logicalDate } from "@/lib/date";
import { plannedType } from "@/lib/model";
import { buildDay, resolveTemplate, templateExists } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { timeBudget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { TEMPLATE_BY_ID, WEEK_PRESETS } from "@/lib/templates";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const hrs = (m: number) => String(Math.round(m / 6) / 10);

// Weekly plan: settings.weekPlan[getDay()] picks the template of days not logged yet; null = old offWeekdays rule.
export default function WeekSettings() {
  const { s, update } = useStore();
  const [preset, setPreset] = useState<(typeof WEEK_PRESETS)[number] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const today = logicalDate();
  const todayDow = new Date(today + "T12:00:00").getDay();
  const dateOf = (i: number) => addDays(today, (i - todayDow + 7) % 7);
  const plan = s.settings.weekPlan;
  const nameOf = (id: string) => resolveTemplate(s.schedule, id).def.name;
  const b = timeBudget(s, today);

  function setDay(i: number, id: string | null) {
    const prev = plan[i] ?? null;
    if (prev === id) return;
    play("done");
    update((x) => { x.settings.weekPlan[i] = id; });
    toast(`${DAY[i]}: ${id ? nameOf(id) : "ตามค่าพื้นฐาน"}`, { action: "เลิกทำ", onAction: () => update((x) => { x.settings.weekPlan[i] = prev; }) });
  }

  return (
    <main className="screen">
      <NavBar title="แผนประจำสัปดาห์" sub="วันที่ยังไม่ได้บันทึกจะใช้แผนนี้ เปลี่ยนรายวันได้ที่หน้าวันนี้" />

      <Section header="ชุดสำเร็จรูป">
        {WEEK_PRESETS.map((p) => (
          <button key={p.id} className="row tpl-card" onClick={() => { play("tap"); setPreset(p); }}>
            <span className="row-main">
              <div className="row-title">{p.name}</div>
              <div className="row-sub">{p.note}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }} aria-label={p.days.map((d, i) => `${DOW[i]} ${TEMPLATE_BY_ID.get(d)?.name ?? d}`).join(", ")}>
                {p.days.map((d, i) => <span key={i} className="tpl-dot" title={`${DOW[i]}: ${TEMPLATE_BY_ID.get(d)?.name ?? d}`} style={{ background: TEMPLATE_BY_ID.get(d)?.color ?? "var(--label3)" }} />)}
              </div>
            </span>
          </button>
        ))}
      </Section>

      <Section header="รายวัน" footer={`7 วันข้างหน้าตามแผน: เกม ~${hrs(b.game)} ชม. · ร้องเพลง ${b.singDays} วัน ~${hrs(b.sing)} ชม. · เซิฟ ~${hrs(b.mc)} ชม. · ยก ${b.gym} ครั้ง · คาร์ดิโอ ${b.cardio} · เทรด ${b.trade} วัน · มีผลกับวันที่ยังไม่ได้บันทึกเท่านั้น`}>
        {DAY.map((label, i) => {
          const date = dateOf(i);
          const id = plan[i];
          const set = !!id && templateExists(s.schedule, id);
          const type = plannedType(s, date);
          const { def } = resolveTemplate(s.schedule, type);
          const items = buildDay(type, undefined, s.schedule, 0, { date });
          const weekendTrade = (i === 0 || i === 6) && items.some((x) => x.kind === "trade");
          return (
            <button key={i} className="row tpl-card" onClick={() => { play("tap"); setSlot(i); }}>
              <span className="tpl-dot" style={{ background: set ? def.color : "var(--label3)" }} />
              <span className="row-main">
                <div className="row-title">
                  {label}
                  {i === todayDow && <span className="badge">วันนี้</span>}
                </div>
                <div className="row-sub">{set ? def.name : `ตามค่าพื้นฐาน · ${s.settings.offWeekdays.includes(i) ? "วันหยุด" : "วันทำงาน"} (แบบเดิม)`}</div>
                <MiniTimeline items={items} work={def.work} />
                {weekendTrade && <div className="row-sub">ตลาด FX ปิด วันนั้นกด &apos;ไม่มีจังหวะ&apos; หรือเลือกแผนที่ไม่มีเทรด</div>}
              </span>
            </button>
          );
        })}
      </Section>

      <Section header="ค่าพื้นฐานเมื่อไม่ได้เลือกแผน" footer="วันที่เลือก = วันหยุด (แบบเดิม) ที่เหลือ = วันทำงาน (แบบเดิม)">
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <span className="row-main">
            <div className="row-title">วันหยุดประจำ</div>
            <div className="row-sub">วันที่ยังไม่ได้บันทึกจะเริ่มเป็นวันหยุด (สลับได้ในหน้าวันนี้)</div>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {DOW.map((d, i) => {
              const on = s.settings.offWeekdays.includes(i);
              return (
                <button key={d} className="chip" style={{ flex: 1, padding: "8px 0", textAlign: "center", ...(on ? { background: "var(--blue)", color: "#fff" } : {}) }} onClick={() => {
                  play("tap");
                  update((st) => { st.settings.offWeekdays = on ? st.settings.offWeekdays.filter((x) => x !== i) : [...st.settings.offWeekdays, i].sort(); });
                }}>{d}</button>
              );
            })}
          </div>
        </div>
      </Section>

      <ConfirmSheet
        open={preset !== null}
        title={`ใช้ชุด "${preset?.name ?? ""}"`}
        body={preset ? preset.days.map((d, i) => `${DOW[i]}: ${TEMPLATE_BY_ID.get(d)?.name ?? d}`).join(" · ") : undefined}
        confirmLabel="ใช้ชุดนี้"
        onClose={() => setPreset(null)}
        onConfirm={() => {
          if (!preset) return;
          const prev = [...plan];
          play("done");
          update((x) => applyWeekPlan(x, preset.days));
          toast(`ใช้ชุด "${preset.name}" แล้ว`, { action: "เลิกทำ", onAction: () => update((x) => { x.settings.weekPlan = prev; }) });
        }}
      />

      <TemplatePicker
        open={slot !== null}
        value={slot !== null && plan[slot] && templateExists(s.schedule, plan[slot]!) ? plan[slot] : null}
        date={dateOf(slot ?? todayDow)}
        allowDefault
        onPick={(id) => { if (slot !== null) setDay(slot, id); }}
        onClose={() => setSlot(null)}
      />
    </main>
  );
}

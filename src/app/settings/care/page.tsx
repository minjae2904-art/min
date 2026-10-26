"use client";

// Settings > ดูแลตัวเอง (v1.7 spec 4.7): level, packs, routines, periodic tasks, trackers, health links, red flags.
// Level and pack changes show their diff in a toast with an exact undo; nothing changes Today without a tap here.
import Link from "next/link";
import { useMemo, useState } from "react";
import { IconPlus } from "@/components/Icons";
import { RoutineEditor } from "@/components/care/RoutineEditor";
import { TasksSheet, taskWhen } from "@/components/care/TasksSheet";
import { applyLevelWithUndo } from "@/components/care/CareNotices";
import { Chev, NavBar, Section, Segmented, Switch, toast } from "@/components/ui";
import { HELP, RED_FLAGS } from "@/lib/care/flags";
import { LEVEL_LABEL, PACKS, SLOTS } from "@/lib/care/presets";
import { applyLevel, resetPack, rowOf, setPack } from "@/lib/care/progress";
import { CAF_LABEL, type CafKind } from "@/lib/care/track";
import { LEVELS, type Care, type Level } from "@/lib/care/types";
import { hm, logicalDate } from "@/lib/date";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const TRACK: [keyof Care["track"], string, string][] = [
  ["veg", "ผัก/ผลไม้", "วันละ 5 ส่วน ในแผ่นน้ำดื่ม"],
  ["urine", "สีปัสสาวะ", "ดูคร่าวๆ ว่าดื่มน้ำพอไหม"],
  ["caf", "คาเฟอีน", "นับแก้ว ประมาณ มก. และเวลาแก้วสุดท้าย"],
  ["walk", "ก้าวเดิน", "ช่วงก้าวเดินในแผ่นก่อนนอน"],
  ["bowel", "ขับถ่าย", "ในแผ่นเช้า"],
  ["sym", "อาการ", "เสียงแหบ ปวดหัว ตาล้า หูอื้อ ผิวระคาย ไม่สบาย"],
];
const CAF_KINDS: CafKind[] = ["c", "t", "e", "p"];
const diffText = (r: { added: number; off: number }) => [r.added ? `เพิ่ม ${r.added} ขั้น` : "", r.off ? `ปิด ${r.off}` : ""].filter(Boolean).join(" · ") || "ไม่เปลี่ยน";

// Number field that commits on blur (or Enter) and snaps back when the value is out of range.
function NumField({ value, min, max, step = 1, label, onCommit }: { value: number; min: number; max: number; step?: number; label: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState<string | null>(null);
  const commit = () => {
    if (v === null) return;
    const n = Math.round(Number(v) / step) * step;
    setV(null);
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
  };
  return <input className="inline-input num care-num" inputMode="numeric" aria-label={label} value={v ?? String(value)} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

export default function CareSettings() {
  const { s, update } = useStore();
  const today = logicalDate();
  const [editor, setEditor] = useState<{ rid: string } | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [chip, setChip] = useState("");
  const c = s.care;
  const level = c.level;
  const routines = s.schedule.care ?? [];
  const customs = routines.filter((r) => !SLOTS.some((x) => x.id === r.id)).length;

  // Dry-run previews of the other levels on a copy (applyLevel is deterministic).
  const preview = useMemo(() => LEVELS.filter((l) => l !== level).map((l) => `ถ้าเลือก ${LEVEL_LABEL[l]}: ${diffText(applyLevel(structuredClone(s), l, today))}`).join(" · "), [s, level, today]);

  const careEdit = (fn: (x: State) => void) => update(fn);
  function togglePack(id: string, on: boolean) {
    const name = PACKS.find((p) => p.id === id)?.name ?? id;
    const res = setPack(structuredClone(s), id, on, today);
    const prev = { care: structuredClone(s.care), routines: structuredClone(routines) };
    play("toggle");
    update((x) => { setPack(x, id, on, today); });
    toast(`${on ? "เปิด" : "ปิด"} ${name} · ${diffText(res)}`, { action: "เลิกทำ", onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
  }
  function reset(id: string) {
    const name = PACKS.find((p) => p.id === id)?.name ?? id;
    const prev = { care: structuredClone(s.care), routines: structuredClone(routines) };
    play("undo");
    update((x) => resetPack(x, id, today));
    toast(`คืนค่า ${name} แล้ว`, { action: "เลิกทำ", onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
  }
  function when(rid: string, on: boolean) {
    if (!on) return "ปิดอยู่";
    const row = rowOf(s, today, rid);
    if (row) return hm(row.min);
    return rid === "gym" ? "วันยิม" : rid === "prep" ? "วันไลฟ์" : "ไม่มีวันนี้";
  }
  function addChip() {
    const n = Math.round(Number(chip) / 10) * 10;
    setChip("");
    if (!(n >= 50 && n <= 2000) || c.water.chips.includes(n) || c.water.chips.length >= 6) { play("error"); toast("ขนาด 50-2000 ml ได้สูงสุด 6 ปุ่ม"); return; }
    play("tap");
    careEdit((x) => { x.care.water.chips = [...x.care.water.chips, n].sort((a, b) => a - b); });
  }

  return (
    <main className="screen">
      <NavBar title="ดูแลตัวเอง" sub="ผิว ฟัน น้ำ ตา หู เสียง ในแถวเดิมของวันนี้ ปรับได้ทุกอย่าง" />

      <Section header="ระดับ" footer={preview}>
        <div className="row">
          <div className="care-grow">
            {level ? (
              <Segmented<Level> label="ระดับ" value={level} options={LEVELS.map((l) => [l, LEVEL_LABEL[l]])} onChange={(v) => applyLevelWithUndo(update, s, v, today)} />
            ) : (
              <div className="chips">{LEVELS.map((l) => <button key={l} className="chip" onClick={() => applyLevelWithUndo(update, s, l, today)}>{LEVEL_LABEL[l]}</button>)}</div>
            )}
          </div>
        </div>
      </Section>

      {level && (
        <>
          <Section header="ชุดสำเร็จรูป" footer="ชุด 'เลือกเอง' ไม่เปิดตามระดับ เปิดแล้วอยู่ทุกระดับ">
            {PACKS.map((p) => {
              const on = c.packs.includes(p.id);
              return (
                <div key={p.id} className="row">
                  <span className="row-main">
                    <span className="row-title">{p.name}{p.optIn ? " · เลือกเอง" : ""}</span>
                    <span className="row-sub">{p.desc}</span>
                    {on && <button className="link fs-foot care-inline-link" onClick={() => reset(p.id)}>คืนค่า</button>}
                  </span>
                  <Switch label={p.name} on={on} onChange={(v) => togglePack(p.id, v)} />
                </div>
              );
            })}
          </Section>

          <Section header="กิจวัตรรายวัน" footer="แตะเพื่อแก้ชื่อ เวลา และขั้นตอน">
            {routines.map((r) => (
              <button key={r.id} className="row" onClick={() => { play("tap"); setEditor({ rid: r.id }); }}>
                <span className="row-main"><span className="row-title">{r.name} · {when(r.id, r.on)} · {r.steps.filter((x) => x.on !== false).length} ขั้น</span></span>
                <Chev />
              </button>
            ))}
            {customs < 3 && (
              <button className="row" onClick={() => { play("tap"); setEditor({ rid: "new" }); }}>
                <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
                <span className="row-main row-title link">สร้างกิจวัตรเอง</span>
              </button>
            )}
          </Section>

          <Section header="งานตามรอบ" footer="ไม่นับคะแนน ไม่แจ้งเตือน ขึ้นในแผ่นก่อนนอนเมื่อครบรอบ">
            <button className="row" onClick={() => { play("tap"); setTasksOpen(true); }}>
              <span className="row-main row-title link">ดูที่ครบรอบ</span>
              <Chev />
            </button>
            {c.tasks.map((t) => (
              <div key={t.id} className={`row care-task-row ${t.on ? "" : "disabled"}`}>
                <span className="row-main"><span className="row-title">{t.title}</span><span className="row-sub">{taskWhen(s, t, today)}</span></span>
                <span className="care-mini-stepper">
                  <button className="chip chip--sm" aria-label={`ถี่ขึ้น: ${t.title}`} disabled={t.every <= 1} onClick={() => { play("tap"); careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.every = Math.max(1, y.every - 1); }); }}>-</button>
                  <button className="chip chip--sm" aria-label={`ห่างขึ้น: ${t.title}`} disabled={t.every >= 365} onClick={() => { play("tap"); careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.every = Math.min(365, y.every + 1); }); }}>+</button>
                </span>
                <Switch label={t.title} on={t.on} onChange={(v) => careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.on = v; })} />
              </div>
            ))}
          </Section>

          <Section header="น้ำดื่ม" footer="ไม่ดื่มรวดเดียวเกิน ~1 ลิตร/ชม. · เป้าสูงสุด 4.5 ลิตร">
            <div className="row">
              <span className="row-main"><span className="row-title">เป้าน้ำตามกิจกรรม</span><span className="row-sub">35 ml/กก. + ยิม คาร์ดิโอ ไลฟ์ วันร้อน</span></span>
              <Switch label="เป้าน้ำตามกิจกรรม" on={c.water.plan} onChange={(v) => careEdit((x) => { x.care.water.plan = v; })} />
            </div>
            <div className="row">
              <span className="row-title form-label">เป้า (ลิตร)</span>
              <div className="care-grow"><Segmented label="เป้าน้ำ" value={String(s.settings.waterGoalMl)} options={[["0", "อัตโนมัติ"], ["2500", "2.5"], ["3000", "3"], ["3500", "3.5"], ["4000", "4"]]} onChange={(v) => careEdit((x) => { x.settings.waterGoalMl = Number(v); })} /></div>
            </div>
            <div className="row">
              <span className="row-main"><span className="row-title">ไลฟ์ +125 ml/ชม.</span><span className="row-sub">ค่าประมาณ ปิดได้</span></span>
              <Switch label="ไลฟ์ +125 ml/ชม." on={c.water.live} onChange={(v) => careEdit((x) => { x.care.water.live = v; })} />
            </div>
            <div className="row care-ctx--wrap">
              <span className="row-main row-title">ปุ่มดื่มน้ำ (ml)</span>
              <span className="chips">
                {c.water.chips.map((ml) => (
                  <button key={ml} className="chip chip--sm" aria-label={`ลบปุ่ม ${ml} ml`} disabled={c.water.chips.length <= 1} onClick={() => { play("tap"); careEdit((x) => { x.care.water.chips = x.care.water.chips.filter((y) => y !== ml); }); }}>{ml} x</button>
                ))}
              </span>
            </div>
            {c.water.chips.length < 6 && (
              <div className="row form-row">
                <span className="row-main row-title">เพิ่มปุ่ม</span>
                <input className="inline-input num care-num" inputMode="numeric" placeholder="เช่น 600" value={chip} onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addChip(); }} />
                <button className="chip chip--sm" disabled={!chip} onClick={addChip}>เพิ่ม</button>
              </div>
            )}
          </Section>

          <Section header="ตัวติดตาม" footer="ไม่นับคะแนน ไม่แจ้งเตือน ใช้ดูแนวโน้มของตัวเอง">
            {TRACK.map(([k, t, sub]) => (
              <div key={k} className="row">
                <span className="row-main"><span className="row-title">{t}</span><span className="row-sub">{sub}</span></span>
                <Switch label={t} on={c.track[k]} onChange={(v) => careEdit((x) => { x.care.track[k] = v; })} />
              </div>
            ))}
            {c.track.caf && CAF_KINDS.map((k) => (
              <div key={k} className="row">
                <span className="row-main row-title">{CAF_LABEL[k]} (มก./แก้ว)</span>
                <NumField label={`คาเฟอีน ${CAF_LABEL[k]}`} value={c.cafMg[k]} min={0} max={600} onCommit={(v) => careEdit((x) => { x.care.cafMg[k] = v; })} />
              </div>
            ))}
          </Section>

          <Section header="ตรวจสุขภาพ / ชั้นวาง">
            <Link href="/body" className="row row-link" onClick={() => play("nav")}>
              <span className="row-main"><span className="row-title">หน้าร่างกาย</span><span className="row-sub">ตรวจสุขภาพตามรอบ ของใช้และวันหมดอายุ</span></span>
              <Chev />
            </Link>
          </Section>
        </>
      )}

      <Section header="ควรไปหาหมอเมื่อ">
        {RED_FLAGS.map((t) => <div key={t} className="row"><span className="row-main row-sub care-flag-line">{t}</span></div>)}
      </Section>
      <Section header="ขอความช่วยเหลือ">
        {HELP.map(([n, t]) => (
          <a key={n} href={`tel:${n}`} className="row row-link" onClick={() => play("tap")}>
            <span className="row-main"><span className="row-title num">{n}</span><span className="row-sub">{t}</span></span>
            <Chev />
          </a>
        ))}
      </Section>
      <div className="section-footer care-foot">ข้อมูลสุขภาพทั่วไปจาก AAD, WHO, NHS, ACSM · ไม่ใช่คำแนะนำทางการแพทย์</div>

      <RoutineEditor open={editor} onClose={() => setEditor(null)} />
      <TasksSheet open={tasksOpen} date={today} onClose={() => setTasksOpen(false)} />
    </main>
  );
}

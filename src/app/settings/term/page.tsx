"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconPlus } from "@/components/Icons";
import { ClashSheet } from "@/components/term/ClashSheet";
import { ClassSheet } from "@/components/term/ClassSheet";
import { TermPlan } from "@/components/term/TermPlan";
import { Chev, NavBar, Section, toast } from "@/components/ui";
import { dowName, thaiDate } from "@/lib/brain/copy";
import { EARLY_NOTE, isTermWeek, termClashes, weekClashes } from "@/lib/clash";
import { logicalDate } from "@/lib/date";
import { GO_DEFAULT, termDefault, type Cls, type Term } from "@/lib/model";
import { resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { TERM_PRESET, WEEK_PRESETS } from "@/lib/templates";
import { OFF_CAP, clsSpan, dowOf, goOf, sanitizeTerm } from "@/lib/term";

const dayN = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

// v1.8 Settings > ตารางเรียน: term dates, travel time, classes, no-class days, this week's clashes and the term week plan.
export default function TermSettings() {
  const { s, update } = useStore();
  const today = logicalDate();
  const t = s.schedule.term ?? null;
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [offAdd, setOffAdd] = useState("");
  const [cls, setCls] = useState<{ open: boolean; edit: Cls | null; n: number }>({ open: false, edit: null, n: 0 });
  const [clash, setClash] = useState<{ open: boolean; date: string }>({ open: false, date: today });
  const [plan, setPlan] = useState(false);
  const preset = WEEK_PRESETS.find((p) => p.id === TERM_PRESET);

  // Every write goes through sanitizeTerm; undo restores the exact previous term (or none).
  const write = (next: Term | null) => update((x) => { x.schedule.term = next ? sanitizeTerm(next) : null; });
  const withUndo = (next: Term | null, msg: string) => {
    const prev = structuredClone(t);
    write(next);
    toast(msg, { action: "เลิกทำ", onAction: () => write(prev) });
  };

  if (!t) {
    return (
      <main className="screen">
        <NavBar title="ตารางเรียน" sub="ใส่ครั้งเดียวต่อเทอม" />
        <Section>
          <EmptyState title="ยังไม่มีตารางเรียน" body="ใส่วิชาครั้งเดียว แล้ววิชาจะขึ้นเป็นช่วงเรียนในหน้าวันนี้ และแอปจะไม่เตือนระหว่างเรียน"
            action={{ label: "เริ่มตั้งตารางเรียน", onClick: () => { play("done"); withUndo(termDefault(), "สร้างตารางเรียนแล้ว"); } }} />
        </Section>
      </main>
    );
  }

  function commitDates() {
    if (!t || !draft) return;
    const d = draft;
    setDraft(null);
    if (d.start === t.start && d.end === t.end) return;
    if (!d.start || !d.end) return;
    if (d.end < d.start) { play("error"); toast("วันปิดเทอมต้องหลังวันเปิดเทอม"); return; }
    if (dayN(d.start, d.end) > 400) { play("error"); toast("ช่วงเทอมยาวได้ไม่เกิน 400 วัน"); return; }
    play("done");
    withUndo({ ...t, start: d.start, end: d.end }, `ช่วงเทอม ${thaiDate(d.start)} - ${thaiDate(d.end)}`);
  }
  const dateVal = (k: "start" | "end") => draft?.[k] ?? t[k];
  const setDate = (k: "start" | "end", v: string) => setDraft({ start: dateVal("start"), end: dateVal("end"), [k]: v });

  const go = goOf(t);
  const setGo = (v: number) => { play("tap"); write({ ...t, go: Math.min(120, Math.max(0, v)) }); };

  const off = t.off ?? [];
  function addOff() {
    if (!t || !offAdd) return;
    if (off.includes(offAdd)) { setOffAdd(""); return; }
    if (off.length >= OFF_CAP) { play("error"); toast(`เพิ่มได้สูงสุด ${OFF_CAP} วัน`); return; }
    play("done");
    withUndo({ ...t, off: [...off, offAdd] }, `${thaiDate(offAdd)} ไม่มีเรียน`);
    setOffAdd("");
  }

  const openCls = (edit: Cls | null) => { play("tap"); setCls((p) => ({ open: true, edit, n: p.n + 1 })); };
  const from = t.start > today ? t.start : today;
  const week = weekClashes(s, from, 7, today);

  return (
    <main className="screen">
      <NavBar title="ตารางเรียน" sub={`${thaiDate(t.start)} - ${thaiDate(t.end)} · ${t.cls.length} วิชา`} />

      <Section header="ช่วงเทอม" footer="ค่าเริ่มต้นเปิดเทอม 2 พ.ย. 2026 แก้ตามปฏิทินมหาวิทยาลัยได้">
        <label className="row">
          <span className="row-main row-title">เปิดเทอม</span>
          <input className="time-input term-date" type="date" value={dateVal("start")} onChange={(e) => setDate("start", e.target.value)} onBlur={commitDates} />
        </label>
        <label className="row">
          <span className="row-main row-title">ปิดเทอม</span>
          <input className="time-input term-date" type="date" value={dateVal("end")} onChange={(e) => setDate("end", e.target.value)} onBlur={commitDates} />
        </label>
        <div className="row term-go">
          <span className="row-main">
            <span className="row-title">เวลาเดินทางไปเรียน</span>
            <span className="row-sub">ใช้ดูว่าตื่นทันเรียนไหม{go === GO_DEFAULT ? " · ค่าเริ่มต้น" : ""}</span>
          </span>
          <button className="chip" aria-label="ลด 5 นาที" disabled={go <= 0} onClick={() => setGo(go - 5)}>-5</button>
          <span className="num term-go-val">{go} นาที</span>
          <button className="chip" aria-label="เพิ่ม 5 นาที" disabled={go >= 120} onClick={() => setGo(go + 5)}>+5</button>
        </div>
      </Section>

      <Section header={`วิชา (${t.cls.length})`} footer="เรียนก่อน 08:00 ยังไม่รองรับ เพราะวันใหม่ของแอปเริ่ม 08:00">
        {t.cls.map((c) => (
          <button key={c.id} className="row" onClick={() => openCls(c)}>
            <span className="row-main">
              <span className="row-title">{c.t}</span>
              <span className="row-sub num">{dowName(c.d)} {clsSpan(c)}{c.r ? ` · ห้อง ${c.r}` : ""}</span>
            </span>
            <Chev />
          </button>
        ))}
        <button className="row" onClick={() => openCls(null)}>
          <span className="row-icon link" aria-hidden><IconPlus size={18} /></span>
          <span className="row-main row-title link">เพิ่มวิชา</span>
        </button>
      </Section>

      <Section header="วันไม่มีเรียน" footer="วันหยุด สอบ หรือยกคลาส · วันนั้นไม่แสดงช่วงเรียน">
        {off.map((d) => (
          <button key={d} className="row" aria-label={`ลบ ${thaiDate(d)} ออกจากวันไม่มีเรียน`} onClick={() => { play("undo"); withUndo({ ...t, off: off.filter((x) => x !== d) }, `เอา ${thaiDate(d)} ออกแล้ว`); }}>
            <span className="row-main row-title">{thaiDate(d)}</span>
            <span className="row-value fs-sub">แตะเพื่อเอาออก</span>
          </button>
        ))}
        <div className="row">
          <input className="time-input term-date" type="date" aria-label="วันไม่มีเรียน" value={offAdd} onChange={(e) => setOffAdd(e.target.value)} />
          <span className="row-main" />
          <button className="chip chip--tint" disabled={!offAdd} onClick={addOff}>เพิ่มวัน</button>
        </div>
      </Section>

      <Section header="สัปดาห์นี้" footer="ชน = เวลาเรียนทับไลฟ์ ยิม เทรด มื้ออาหาร หรือทำให้นอนไม่ถึง 7 ชม.">
        {week.map((w) => {
          const name = resolveTemplate(s.schedule, w.tpl).def.name;
          const stuck = w.clashes > w.fixable ? termClashes(s, w.date, { today: w.date === today }).filter((c) => !c.fixable) : [];
          const body = (
            <>
              <span className="row-main">
                <span className="row-title">{w.date === today ? "วันนี้" : `วัน${dowName(dowOf(w.date))}`} · {name}</span>
                <span className="row-sub num">{w.classes ? `เรียน ${w.classes} วิชา ${w.span}` : "ไม่มีเรียน"}{w.date !== today ? ` · ${thaiDate(w.date)}` : ""}</span>
                {stuck.map((c, k) => <span key={k} className="row-sub term-stuck">{c.text} · {c.hint ?? EARLY_NOTE}</span>)}
              </span>
              {(w.classes > 0 || w.clashes > 0) && <span className={`badge ${w.clashes ? "warn" : "ok"}`}>{w.clashes ? `ชน ${w.clashes}` : "ไม่ชน"}</span>}
            </>
          );
          return w.fixable ? (
            <button key={w.date} className="row term-day" onClick={() => { play("tap"); setClash({ open: true, date: w.date }); }}>{body}<Chev /></button>
          ) : <div key={w.date} className="row term-day">{body}</div>;
        })}
      </Section>

      <Section header="แผนช่วงเปิดเทอม" footer={isTermWeek(s) ? "ใช้แผนสัปดาห์ช่วงเปิดเทอมอยู่" : undefined}>
        <button className="row" onClick={() => { play("tap"); setPlan(true); }}>
          <span className="row-main">
            <span className="row-title">ใช้แผนสัปดาห์ช่วงเปิดเทอม</span>
            {preset && <span className="row-sub">{preset.note}</span>}
          </span>
          <Chev />
        </button>
      </Section>

      <Section>
        <button className="row" onClick={() => { play("undo"); withUndo(null, "ลบตารางเรียนแล้ว"); }}>
          <span className="row-main row-title ink-danger">ลบตารางเรียน</span>
        </button>
      </Section>

      <ClassSheet key={cls.n} open={cls.open} edit={cls.edit} onClose={() => setCls((p) => ({ ...p, open: false }))} />
      <ClashSheet open={clash.open} date={clash.date} today={today} onClose={() => setClash((p) => ({ ...p, open: false }))} />
      <TermPlan open={plan} onClose={() => setPlan(false)} />
    </main>
  );
}

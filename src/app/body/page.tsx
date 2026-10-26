"use client";

import { useState } from "react";
import { TrendLine } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { IconArrowRight, IconPlus } from "@/components/Icons";
import { TabPage } from "@/components/TabPage";
import { BodyCare } from "@/components/care/BodyCare";
import { AppBar, Chev, Section, Segmented, Sheet, toast } from "@/components/ui";
import { setWeight } from "@/lib/actions";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { bmi } from "@/lib/health";
import { NEED, etaRange, kgRate } from "@/lib/honest";
import { weightStats } from "@/lib/stats";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Range = "30" | "90" | "0";

type Edit = { date: string; kg: string; orig: string | null }; // orig = date of the weigh-in being edited (null = new)

export default function Body() {
  const { s, update } = useStore();
  const p = s.profile;
  const today = logicalDate();
  const { series: t, cur, rate, measured } = weightStats(s, today);
  const [range, setRange] = useState<Range>("30");
  const [ranged, setRanged] = useState(false); // range changed on this visit: the line draws again
  const [edit, setEdit] = useState<Edit | null>(null);
  const from = range === "0" ? "" : addDays(today, -Number(range));
  const shown = t.filter((w) => w.date >= from);

  const toGo = p.goalKg - cur;
  const span = p.goalKg - p.startKg;
  const progress = span ? Math.max(0, Math.min(1, (cur - p.startKg) / span)) : 1;
  const reached = toGo <= 0;

  // v1.8 honest copy: a verdict needs a rate and >= 5 weigh-ins in the last 14 days; the goal date is a month range.
  const recent = s.weights.filter((w) => w.date >= addDays(today, -13) && w.date <= today).length;
  let verdict = rate === null ? "ต้องชั่งห่างกันอย่างน้อย 7 วัน" : `ชั่งอีก ${Math.max(1, NEED.weighIns - recent)} ครั้งใน 2 สัปดาห์เพื่อดูอัตรา`;
  if (rate !== null && recent >= NEED.weighIns) verdict = rate < 0.2 ? "ขึ้นช้า - ลองเพิ่ม 1 มื้อเล็กหรือ shake" : rate > 0.75 ? "ขึ้นเร็วไป - ลดของทอด/ของหวาน" : "อัตรากำลังดี คงเดิม";
  const eta = reached ? null : etaRange(s, today);

  function save() {
    if (!edit) return;
    const v = parseFloat(edit.kg);
    if (!(v > 30 && v < 250)) { play("error"); return toast("ใส่น้ำหนักเป็นตัวเลข เช่น 67.4"); }
    if (edit.date > today) { play("error"); return toast("เลือกวันที่ไม่เกินวันนี้"); }
    if (edit.orig && edit.date !== edit.orig && s.weights.some((w) => w.date === edit.date)) { play("error"); return toast(`${THAI_DATE(edit.date)} มีน้ำหนักอยู่แล้ว แก้รายการนั้นแทน`); }
    play("done");
    update((st) => {
      if (edit.orig && edit.orig !== edit.date) setWeight(st, edit.orig, null, today);
      setWeight(st, edit.date, v, today);
    });
    setEdit(null);
  }

  function remove() {
    if (!edit?.orig) return;
    const orig = edit.orig, prev = s.weights.find((w) => w.date === orig)?.kg;
    play("undo");
    update((st) => setWeight(st, orig, null, today));
    setEdit(null);
    toast(`ลบน้ำหนัก ${prev === undefined ? "" : `${prev.toFixed(1)} kg `}ของ ${THAI_DATE(orig)} แล้ว`, { action: "เลิกทำ", onAction: () => { if (prev !== undefined) update((st) => setWeight(st, orig, prev, today)); } });
  }

  return (
    <TabPage>
    <main className="screen">
      <AppBar title="ร่างกาย" />
      <h1 className="large-title">ร่างกาย</h1>
      <div className="subtitle">เป้าหมาย {p.startKg} <span className="ic-arrow" role="img" aria-label="ถึง"><IconArrowRight size={14} /></span> {p.goalKg} kg</div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="fs-foot ink-2">น้ำหนักแนวโน้ม</div>
            <div className="big-number">{measured ? cur.toFixed(1) : "-"}<span className="unit"> kg</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="fs-foot ink-2">{reached ? "เป้าหมาย" : "อีก"}</div>
            <div className={`value-lg ${reached ? "ink-success" : ""}`}>{reached ? "ถึงเป้าแล้ว" : `${toGo.toFixed(1)} kg`}</div>
          </div>
        </div>
        <div className="goal-track">
          <span className="fill-x grow goal-fill" style={{ ["--p" as string]: progress }} />
        </div>
        <Segmented<Range> value={range} options={[["30", "30 วัน"], ["90", "90 วัน"], ["0", "ทั้งหมด"]]} onChange={(v) => { setRange(v); setRanged(true); }} />
        {/* Dots = daily weigh-ins, line = exponential trend, dashed = goal when within reach of the plotted range. */}
        <TrendLine key={range} regrow={ranged} points={shown.map((w) => ({ date: w.date, v: w.trend, raw: w.kg }))} goal={p.goalKg} unit="kg" label="น้ำหนักแนวโน้ม" tone="var(--accent)"
          empty={<EmptyState art="lifting-dumbbell" title="ชั่งน้ำหนักอย่างน้อย 2 วันเพื่อดูกราฟ" action={{ label: "ชั่งน้ำหนักเลย", onClick: () => { play("tap"); setEdit({ date: today, kg: "", orig: null }); } }} />} />
      </div>

      <Section header="สรุป" footer="เป้า +0.2 ถึง +0.6 kg/สัปดาห์ (ดูจากเส้นแนวโน้ม ไม่ใช่ตัวเลขรายวัน)">
        <div className="row"><span className="row-main row-title">อัตราต่อสัปดาห์</span><span className="row-value">{kgRate(rate)}</span></div>
        <div className="row"><span className="row-main row-title">คำแนะนำ</span><span className="row-value fs-sub">{verdict}</span></div>
        {eta && <div className="row"><span className="row-main row-title">ช่วงที่น่าจะถึงเป้า</span><span className="row-value">{eta}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">BMI</span><span className="row-value">{bmi(cur, p.heightCm).toFixed(1)}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">เพิ่มจากเริ่มต้น</span><span className="row-value">{(cur - p.startKg).toFixed(1)} kg</span></div>}
      </Section>

      {s.care.level !== null && <BodyCare today={today} />}

      <Section header="ประวัติการชั่ง" footer={s.weights.length ? "แตะรายการเพื่อแก้ไขหรือลบ" : undefined}>
        <button className="row" onClick={() => { play("tap"); setEdit({ date: today, kg: "", orig: null }); }}>
          <span className="icon-btn ink-accent"><IconPlus size={18} /></span>
          <span className="row-main row-title link">บันทึกน้ำหนัก</span>
        </button>
        {[...s.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((w) => (
          <button key={w.date} className="row" onClick={() => { play("tap"); setEdit({ date: w.date, kg: w.kg.toFixed(1), orig: w.date }); }}>
            <span className="row-main"><div className="row-title">{w.kg.toFixed(1)} kg</div><div className="row-sub">{THAI_DATE(w.date)}</div></span>
            <Chev />
          </button>
        ))}
      </Section>

      <Sheet open={edit !== null} title={edit?.orig ? "แก้ไขน้ำหนัก" : "บันทึกน้ำหนัก"} onClose={() => setEdit(null)}>
        {edit && (
          <>
            <input className="field num fs-title1" inputMode="decimal" placeholder={measured ? cur.toFixed(1) : "เช่น 67.4"} value={edit.kg} onChange={(e) => setEdit({ ...edit, kg: e.target.value })} autoFocus style={{ textAlign: "center" }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            <div style={{ height: 12 }} />
            <Section>
              <label className="row form-row">
                <span className="row-title">วันที่</span>
                <input className="inline-input" type="date" max={today} value={edit.date} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value })} />
              </label>
            </Section>
            <button className="btn" onClick={save}>บันทึก</button>
            {edit.orig && <button className="btn danger" style={{ marginTop: 10 }} onClick={remove}>ลบ</button>}
          </>
        )}
      </Sheet>
    </main>
    </TabPage>
  );
}

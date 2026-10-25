"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Chev, Section, Segmented, Sheet, toast } from "@/components/ui";
import { setWeight } from "@/lib/actions";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { bmi } from "@/lib/health";
import { weightStats } from "@/lib/stats";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Pt = { date: string; kg: number; trend: number };
type Range = "30" | "90" | "0";
const shortDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// Dots = daily weigh-ins, line = exponential trend, dashed green = goal when it is within reach of the plotted range.
// The line draws in on the first visit ([data-first]) and after a range switch on this visit (regrow).
function Chart({ data, goalKg, regrow, onAdd }: { data: Pt[]; goalKg: number; regrow?: boolean; onAdd: () => void }) {
  if (data.length < 2) return <EmptyState art="lifting-dumbbell" title="ชั่งน้ำหนักอย่างน้อย 2 วันเพื่อดูกราฟ" action={{ label: "ชั่งน้ำหนักเลย", onClick: onAdd }} />;
  const w = 320, h = 170, padL = 34, padR = 8, padT = 10, padB = 18;
  const all = data.flatMap((d) => [d.kg, d.trend]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const showGoal = goalKg >= lo && goalKg <= hi + 3;
  const min = Math.floor((lo - 0.5) * 2) / 2;
  const max = Math.ceil(((showGoal ? Math.max(hi, goalKg) : hi) + 0.5) * 2) / 2;
  const x = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.trend).toFixed(1)}`).join("");
  const mid = Math.floor((data.length - 1) / 2);
  const label = { className: "wlabel" } as const;
  return (
    <svg className={`wchart ${regrow ? "regrow" : ""}`} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`กราฟน้ำหนัก ${shortDate(data[0].date)} ถึง ${shortDate(data[data.length - 1].date)}`}>
      <line x1={padL} x2={w - padR} y1={y(max)} y2={y(max)} stroke="var(--sep)" />
      <line x1={padL} x2={w - padR} y1={y(min)} y2={y(min)} stroke="var(--sep)" />
      <text x={padL - 5} y={y(max) + 4} textAnchor="end" {...label}>{max.toFixed(1)}</text>
      <text x={padL - 5} y={y(min) + 4} textAnchor="end" {...label}>{min.toFixed(1)}</text>
      {showGoal && (
        <g className="wgoal">
          <line x1={padL} x2={w - padR} y1={y(goalKg)} y2={y(goalKg)} stroke="var(--success)" strokeDasharray="4 3" />
          <text x={w - padR} y={y(goalKg) - 3} textAnchor="end" className="wlabel wlabel--goal">เป้า {goalKg}</text>
        </g>
      )}
      <g className="wdots">{data.map((d, i) => <circle key={d.date} cx={x(i)} cy={y(d.kg)} r={2.5} fill="var(--label3)" />)}</g>
      <path className="wline" pathLength={1} d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={x(0)} y={h - 4} textAnchor="start" {...label}>{shortDate(data[0].date)}</text>
      {mid > 0 && mid < data.length - 1 && <text x={x(mid)} y={h - 4} textAnchor="middle" {...label}>{shortDate(data[mid].date)}</text>}
      <text x={x(data.length - 1)} y={h - 4} textAnchor="end" {...label}>{shortDate(data[data.length - 1].date)}</text>
    </svg>
  );
}

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

  let verdict = "ต้องชั่งห่างกันอย่างน้อย 7 วัน";
  if (rate !== null) verdict = rate < 0.2 ? "ขึ้นช้า - ลองเพิ่ม 1 มื้อเล็กหรือ shake" : rate > 0.75 ? "ขึ้นเร็วไป - ลดของทอด/ของหวาน" : "อัตรากำลังดี คงเดิม";

  let eta: string | null = null;
  if (!reached && rate !== null && rate > 0.05) {
    const d = new Date();
    d.setDate(d.getDate() + Math.round((toGo / rate) * 7));
    eta = d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  }

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
    <main className="screen">
      <h1 className="large-title">ร่างกาย</h1>
      <div className="subtitle">เป้าหมาย {p.startKg} → {p.goalKg} kg</div>

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
        <Chart key={range} regrow={ranged} data={shown} goalKg={p.goalKg} onAdd={() => { play("tap"); setEdit({ date: today, kg: "", orig: null }); }} />
      </div>

      <Section header="สรุป" footer="เป้า +0.2 ถึง +0.6 kg/สัปดาห์ (ดูจากเส้นแนวโน้ม ไม่ใช่ตัวเลขรายวัน)">
        <div className="row"><span className="row-main row-title">อัตราต่อสัปดาห์</span><span className="row-value">{rate === null ? "-" : `${rate >= 0 ? "+" : ""}${rate.toFixed(2)} kg`}</span></div>
        <div className="row"><span className="row-main row-title">คำแนะนำ</span><span className="row-value fs-sub">{verdict}</span></div>
        {eta && <div className="row"><span className="row-main row-title">คาดว่าจะถึง {p.goalKg} kg</span><span className="row-value ink-success">ประมาณ {eta}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">BMI</span><span className="row-value">{bmi(cur, p.heightCm).toFixed(1)}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">เพิ่มจากเริ่มต้น</span><span className="row-value">{(cur - p.startKg).toFixed(1)} kg</span></div>}
      </Section>

      <Section header="ประวัติการชั่ง" footer={s.weights.length ? "แตะรายการเพื่อแก้ไขหรือลบ" : undefined}>
        <button className="row" onClick={() => { play("tap"); setEdit({ date: today, kg: "", orig: null }); }}>
          <span className="row-main row-title link">+ บันทึกน้ำหนัก</span>
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
  );
}

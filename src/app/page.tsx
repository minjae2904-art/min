"use client";

import { useEffect, useState } from "react";
import { IconBriefcase, IconCheck, IconDrop } from "@/components/Icons";
import { Rings } from "@/components/Rings";
import { Section, Segmented, Sheet } from "@/components/ui";
import { THAI_DATE, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { trend, waterTargetMl } from "@/lib/health";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, buildDay, type DayType, type Item, type Meal2 } from "@/lib/schedule";
import { emptyDay, useStore } from "@/lib/store";

export default function Today() {
  const { s, update } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<null | "meal2" | "weigh">(null);
  const [kg, setKg] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = s.days[date] ?? emptyDay();
  const items = buildDay(day.type, day.meal2);

  const gymNext = nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
  const gymToday = s.workouts.find((w) => w.date === date)?.code;
  const personaNext = nextInCycle(PERSONALITY_CYCLE, s.personality.filter((w) => w.date !== date));

  const tracked = items.filter((i) => i.ring);
  const nextId = tracked.find((i) => !day.done[i.id] && i.min >= nowMin - 30)?.id;
  const ratio = (ring: string) => {
    const r = tracked.filter((i) => i.ring === ring);
    return r.length ? r.filter((i) => day.done[i.id]).length / r.length : 0;
  };
  const doneCount = tracked.filter((i) => day.done[i.id]).length;

  const latestKg = trend(s.weights).at(-1)?.trend ?? s.profile.startKg;
  const waterTarget = day.type === "work" ? waterTargetMl(latestKg, 1.25, 0) : waterTargetMl(latestKg, 0, day.done.cardio ? 1.5 : 0);

  const patch = (fn: (d: typeof day) => void) =>
    update((st) => {
      const d = st.days[date] ?? emptyDay();
      fn(d);
      st.days[date] = d;
    });

  function toggle(item: Item) {
    if (item.id === "meal2" && day.type === "work" && !day.done.meal2 && !day.meal2) return setSheet("meal2");
    if (item.kind === "weigh" && !day.done.weigh) return setSheet("weigh");
    const on = !day.done[item.id];
    update((st) => {
      const d = st.days[date] ?? emptyDay();
      if (on) d.done[item.id] = Date.now();
      else delete d.done[item.id];
      st.days[date] = d;
      if (item.kind === "gym") {
        st.workouts = st.workouts.filter((w) => w.date !== date);
        if (on) st.workouts.push({ date, code: day.type === "off" ? "R" : gymNext });
      }
      if (item.kind === "personality") {
        st.personality = st.personality.filter((w) => w.date !== date);
        if (on) st.personality.push({ date, code: personaNext });
      }
    });
  }

  function subFor(item: Item) {
    if (item.kind === "gym" && day.type === "work") {
      const code = gymToday ?? gymNext;
      return `${gymToday ? "เล่นแล้ว" : "ครั้งถัดไป"}: ${code} ${GYM_LABEL[code]}`;
    }
    if (item.kind === "personality") return `${personaNext} ${PERSONALITY_LABEL[personaNext]} · 30-45 นาที`;
    return item.sub;
  }

  return (
    <main className="screen">
      <h1 className="large-title">วันนี้</h1>
      <div className="subtitle">{THAI_DATE(date)}</div>

      <Segmented<DayType>
        value={day.type}
        options={[["work", "วันทำงาน (16:00-02:00)"], ["off", "วันหยุด"]]}
        onChange={(v) => patch((d) => { d.type = v; })}
      />

      <div className="card rings-card">
        <Rings values={[ratio("food"), ratio("body"), ratio("habit")]} />
        <div className="legend">
          <Legend label="กิน" color="var(--ring-food)" v={ratio("food")} />
          <Legend label="ร่างกาย" color="var(--ring-body)" v={ratio("body")} />
          <Legend label="นิสัย" color="var(--ring-habit)" v={ratio("habit")} />
        </div>
      </div>

      <Section header="น้ำดื่ม" footer={`เป้าคำนวณจากน้ำหนัก ${latestKg.toFixed(1)} kg + กิจกรรมวันนี้`}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "var(--teal)" }}><IconDrop size={22} /></span>
            <span className="big-number" style={{ fontSize: 28 }}>{(day.waterMl / 1000).toFixed(2)}</span>
            <span style={{ color: "var(--label2)" }}>/ {(waterTarget / 1000).toFixed(1)} ลิตร</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--fill)", overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", width: `${Math.min(100, (day.waterMl / waterTarget) * 100)}%`, background: "var(--teal)", transition: "width .4s" }} />
          </div>
          <div className="chips">
            {[250, 350, 500, 1000].map((ml) => (
              <button key={ml} className="chip" onClick={() => patch((d) => { d.waterMl += ml; })}>+{ml}</button>
            ))}
            <button className="chip" style={{ color: "var(--red)" }} onClick={() => patch((d) => { d.waterMl = Math.max(0, d.waterMl - 250); })}>-250</button>
          </div>
        </div>
      </Section>

      <Section header={`ตารางวันนี้ · ครบ ${doneCount}/${tracked.length}`}>
        {items.map((item) => {
          if (!item.ring) {
            return (
              <div key={item.id} className="row info" style={{ ["--inset" as string]: "74px" }}>
                <span className="row-time">{hm(item.min)}</span>
                <span style={{ width: 26, color: "var(--label3)", display: "grid", placeItems: "center" }}><IconBriefcase size={18} /></span>
                <span className="row-main row-title">{item.title}</span>
              </div>
            );
          }
          const done = !!day.done[item.id];
          const overdue = !done && item.min + 30 < nowMin;
          return (
            <button
              key={item.id}
              className={`row ${done ? "done" : ""} ${overdue ? "overdue" : ""} ${item.id === nextId ? "next" : ""}`}
              style={{ ["--inset" as string]: "74px" }}
              onClick={() => toggle(item)}
            >
              <span className="row-time">{hm(item.min)}</span>
              <span className={`check ${done ? "on" : ""}`}>{done && <IconCheck size={16} />}</span>
              <span className="row-main">
                <div className="row-title">{item.title}</div>
                {subFor(item) && <div className="row-sub">{subFor(item)}</div>}
              </span>
            </button>
          );
        })}
      </Section>

      <Sheet open={sheet === "meal2"} title="มื้อ 2 วันนี้เป็นแบบไหน" onClose={() => setSheet(null)}>
        <Section>
          {(Object.keys(MEAL2_LABEL) as Meal2[]).map((k) => (
            <button key={k} className="row" onClick={() => {
              patch((d) => { d.meal2 = k; if (k === "A") d.done.meal2 = Date.now(); });
              setSheet(null);
            }}>
              <span className="row-main">
                <div className="row-title">{k}. {MEAL2_LABEL[k]}</div>
                <div className="row-sub">
                  {k === "A" && "ติ๊กว่ากินแล้ว"}
                  {k === "B" && "เพิ่มของว่างชดเชย ~500 kcal ช่วง 23:45"}
                  {k === "C" && "กินข้าว 02:05 แล้วเลื่อนยิมเป็น 03:00"}
                </div>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </Section>
      </Sheet>

      <Sheet open={sheet === "weigh"} title="น้ำหนักเช้านี้" onClose={() => setSheet(null)}>
        <input className="field" inputMode="decimal" placeholder="เช่น 67.4" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus />
        <div style={{ height: 16 }} />
        <button className="btn" onClick={() => {
          const v = parseFloat(kg);
          if (!(v > 30 && v < 250)) return;
          update((st) => {
            st.weights = st.weights.filter((w) => w.date !== date).concat({ date, kg: v });
            const d = st.days[date] ?? emptyDay();
            d.done.weigh = Date.now();
            st.days[date] = d;
          });
          setKg("");
          setSheet(null);
        }}>บันทึก</button>
      </Sheet>
    </main>
  );
}

function Legend({ label, color, v }: { label: string; color: string; v: number }) {
  return (
    <div>
      <div className="legend-label" style={{ color }}>{label}</div>
      <div className="legend-value">{Math.round(v * 100)}<small>%</small></div>
    </div>
  );
}

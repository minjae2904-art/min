"use client";

import { IconGym } from "@/components/Icons";
import { Section, Tile } from "@/components/ui";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "@/lib/rotation";
import { useStore } from "@/lib/store";

const REST_KINDS: [string, string][] = [["R", "พักเฉยๆ"], ["R-tennis", "เทนนิส"], ["R-cardio", "คาร์ดิโอ"]];
const COLOR: Record<string, string> = { D1: "var(--orange)", D2: "var(--pink)", D3: "var(--blue)", D4: "var(--purple)", R: "var(--green)" };

export default function Gym() {
  const { s, update } = useStore();
  const date = logicalDate();
  const todayEntry = s.workouts.find((w) => w.date === date);
  const next = nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
  const since = addDays(date, -6);
  const week = s.workouts.filter((w) => w.date >= since && w.code.startsWith("D")).length;
  const history = [...s.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const lastLeg = history.find((w) => w.code === "D1")?.date;

  const log = (code: string) =>
    update((st) => {
      st.workouts = st.workouts.filter((w) => w.date !== date).concat({ date, code });
    });

  return (
    <main className="screen">
      <h1 className="large-title">ยิม</h1>
      <div className="subtitle">7 วันล่าสุด เล่น {week} ครั้ง{lastLeg ? ` · เล่นขาล่าสุด ${THAI_DATE(lastLeg)}` : ""}</div>

      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Tile color={COLOR[(todayEntry?.code ?? next).slice(0, 2)] ?? COLOR.R}><IconGym size={18} /></Tile>
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--label2)", fontSize: 13 }}>{todayEntry ? "วันนี้เล่นแล้ว" : "ครั้งถัดไป"}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {(todayEntry?.code ?? next).split("-")[0]} {GYM_LABEL[(todayEntry?.code ?? next).split("-")[0]]}
          </div>
        </div>
      </div>

      <Section header="Check-in วันนี้" footer="เลือกส่วนที่เล่นจริง ระบบจะนับรอบต่อจากนี้">
        {GYM_CYCLE.filter((c) => c !== "R").map((c) => (
          <button key={c} className="row" style={{ ["--inset" as string]: "57px" }} onClick={() => log(c)}>
            <Tile color={COLOR[c]}><b style={{ fontSize: 12 }}>{c}</b></Tile>
            <span className="row-main row-title">{GYM_LABEL[c]}</span>
            {todayEntry?.code === c && <span className="link">✓</span>}
          </button>
        ))}
        {REST_KINDS.map(([c, label]) => (
          <button key={c} className="row" style={{ ["--inset" as string]: "57px" }} onClick={() => log(c)}>
            <Tile color={COLOR.R}><b style={{ fontSize: 12 }}>R</b></Tile>
            <span className="row-main row-title">{label}</span>
            {todayEntry?.code === c && <span className="link">✓</span>}
          </button>
        ))}
      </Section>

      {history.length > 0 && (
        <Section header="ประวัติ">
          {history.map((w) => (
            <div key={w.date} className="row">
              <span className="row-main">
                <div className="row-title">{w.code.split("-")[0]} {REST_KINDS.find(([c]) => c === w.code)?.[1] ?? GYM_LABEL[w.code]}</div>
                <div className="row-sub">{THAI_DATE(w.date)}</div>
              </span>
            </div>
          ))}
        </Section>
      )}
    </main>
  );
}

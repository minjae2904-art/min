"use client";

import { useState } from "react";
import { IconCheck, IconGym } from "@/components/Icons";
import { Chev, Section, Sheet, Tile, toast } from "@/components/ui";
import { setDone } from "@/lib/actions";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "@/lib/rotation";
import { buildDay } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const REST_KINDS: [string, string][] = [["R", "พักเฉยๆ"], ["R-tennis", "เทนนิส"], ["R-cardio", "คาร์ดิโอ"]];
const COLOR: Record<string, string> = { D1: "var(--orange)", D2: "var(--pink)", D3: "var(--blue)", D4: "var(--purple)", R: "var(--green)" };
const ALL_CODES: [string, string][] = [...GYM_CYCLE.filter((c) => c !== "R").map((c): [string, string] => [c, GYM_LABEL[c]]), ...REST_KINDS];
const label = (code: string) => REST_KINDS.find(([c]) => c === code)?.[1] ?? GYM_LABEL[code];

type Edit = { date: string; code: string; orig: string | null }; // orig = date of the entry being edited (null = new)

const gymItem = (st: State, date: string) => {
  const d = st.days[date];
  return d && buildDay(d.type, d.meal2, st.schedule, d.shiftMin ?? 0).find((i) => i.kind === "gym");
};

// Write a gym log for any date. Only an already-logged day gets its "เข้ายิม" item ticked; a backdated
// entry edits workouts directly so it never creates a fake day log that drags the average score.
// The tick keeps its original time (or ts); a new tick on a past day gets 1 = "done, no real time",
// so an edit never shows up in the stats as a workout done days late.
function writeLog(st: State, date: string, code: string | null, ts?: number) {
  const item = gymItem(st, date);
  if (!item) { st.workouts = st.workouts.filter((w) => w.date !== date).concat(code ? [{ date, code }] : []); return; }
  const keep = ts ?? st.days[date].done[item.id];
  setDone(st, date, item, code !== null, code ?? undefined);
  if (code !== null) st.days[date].done[item.id] = keep || (date === logicalDate() ? Date.now() : 1);
}

export default function Gym() {
  const { s, update } = useStore();
  const date = logicalDate();
  const todayEntry = s.workouts.find((w) => w.date === date);
  const next = nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
  const since = addDays(date, -6);
  const week = s.workouts.filter((w) => w.date >= since && w.code.startsWith("D")).length;
  const all = [...s.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const [showAll, setShowAll] = useState(false);
  const history = showAll ? all : all.slice(0, 20);
  const lastLeg = all.find((w) => w.code === "D1")?.date;
  const [edit, setEdit] = useState<Edit | null>(null);

  const log = (code: string) => {
    play(todayEntry?.code === code ? "tap" : "done");
    update((st) => {
      const d = dayFor(st, date);
      const item = buildDay(d.type, d.meal2, st.schedule, d.shiftMin ?? 0).find((i) => i.kind === "gym");
      if (todayEntry?.code === code) {
        st.workouts = st.workouts.filter((w) => w.date !== date);
        if (item) setDone(st, date, item, false);
        return;
      }
      if (item) setDone(st, date, item, true, code);
      else st.workouts = st.workouts.filter((w) => w.date !== date).concat({ date, code });
    });
  };

  function save() {
    if (!edit) return;
    if (edit.date > date) { play("error"); return toast("เลือกวันที่ไม่เกินวันนี้"); }
    play("done");
    update((st) => {
      if (edit.orig && edit.orig !== edit.date) writeLog(st, edit.orig, null);
      writeLog(st, edit.date, edit.code);
    });
    setEdit(null);
    toast(`บันทึก ${edit.code} ${THAI_DATE(edit.date)} แล้ว`);
  }

  function remove() {
    if (!edit?.orig) return;
    const orig = edit.orig, prev = all.find((w) => w.date === orig)?.code ?? edit.code;
    const it = gymItem(s, orig), ts = it ? s.days[orig].done[it.id] : undefined;
    play("undo");
    update((st) => writeLog(st, orig, null));
    setEdit(null);
    toast(`ลบบันทึก ${prev} ของ ${THAI_DATE(orig)} แล้ว`, { action: "เลิกทำ", onAction: () => update((st) => writeLog(st, orig, prev, ts)) });
  }

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

      <Section header="Check-in วันนี้" footer="เลือกส่วนที่เล่นจริง ระบบจะติ๊ก 'เข้ายิม' ในหน้าวันนี้และนับรอบต่อจากนี้ · แตะซ้ำเพื่อยกเลิก">
        {GYM_CYCLE.filter((c) => c !== "R").map((c) => (
          <button key={c} className="row" style={{ ["--inset" as string]: "57px" }} aria-pressed={todayEntry?.code === c} onClick={() => log(c)}>
            <Tile color={COLOR[c]}><b style={{ fontSize: 12 }}>{c}</b></Tile>
            <span className="row-main row-title">{GYM_LABEL[c]}</span>
            {todayEntry?.code === c && <span className="link" aria-hidden><IconCheck size={18} /></span>}
          </button>
        ))}
        {REST_KINDS.map(([c, l]) => (
          <button key={c} className="row" style={{ ["--inset" as string]: "57px" }} aria-pressed={todayEntry?.code === c} onClick={() => log(c)}>
            <Tile color={COLOR.R}><b style={{ fontSize: 12 }}>R</b></Tile>
            <span className="row-main row-title">{l}</span>
            {todayEntry?.code === c && <span className="link" aria-hidden><IconCheck size={18} /></span>}
          </button>
        ))}
      </Section>

      <Section header="ประวัติ" footer="แตะรายการเพื่อแก้ไขหรือลบ">
        <button className="row" onClick={() => { play("tap"); setEdit({ date: addDays(date, -1), code: next === "R" ? "R" : next, orig: null }); }}>
          <span className="row-main row-title link">บันทึกย้อนหลัง</span>
        </button>
        {history.map((w) => (
          <button key={w.date} className="row" onClick={() => { play("tap"); setEdit({ date: w.date, code: w.code, orig: w.date }); }}>
            <span className="row-main">
              <div className="row-title">{w.code.split("-")[0]} {label(w.code)}</div>
              <div className="row-sub">{THAI_DATE(w.date)}</div>
            </span>
            <Chev />
          </button>
        ))}
        {!showAll && all.length > 20 && (
          <button className="row" onClick={() => { play("tap"); setShowAll(true); }}><span className="row-main row-title link">แสดงเพิ่ม ({all.length - 20})</span></button>
        )}
      </Section>

      <Sheet open={edit !== null} title={edit?.orig ? "แก้ไขบันทึกยิม" : "บันทึกย้อนหลัง"} onClose={() => setEdit(null)}>
        {edit && (
          <>
            <Section header="เล่นส่วนไหน">
              <div className="row chips" style={{ gap: 8 }}>
                {ALL_CODES.map(([c, l]) => (
                  <button key={c} className="chip" aria-pressed={edit.code === c} style={edit.code === c ? { background: COLOR[c.slice(0, 2)] ?? COLOR.R, color: "#fff" } : undefined} onClick={() => { play("tap"); setEdit({ ...edit, code: c }); }}>{c.startsWith("D") ? `${c} ${l.split(" ")[0]}` : l}</button>
                ))}
              </div>
            </Section>
            <Section header="วันที่">
              <label className="row form-row">
                <span className="row-title">วัน</span>
                <input className="inline-input" type="date" max={date} value={edit.date} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value })} />
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

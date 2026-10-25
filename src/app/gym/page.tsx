"use client";

import { Fragment, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconCheck, IconGym } from "@/components/Icons";
import { Chev, Section, Sheet, Tile, toast } from "@/components/ui";
import { setDone, setTickTime } from "@/lib/actions";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "@/lib/rotation";
import { buildDay, gymItemOf } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { clearSrc, isLateNow, srcOf } from "@/lib/ticks";
import { cancelLateTick, queueLateTick } from "@/components/TickTime";

const REST_KINDS: [string, string][] = [["R", "พักเฉยๆ"], ["R-tennis", "เทนนิส"], ["R-cardio", "คาร์ดิโอ"]];
const COLOR: Record<string, string> = { D1: "var(--orange)", D2: "var(--pink)", D3: "var(--info)", D4: "var(--purple)", R: "var(--green)" };
const ALL_CODES: [string, string][] = [...GYM_CYCLE.filter((c) => c !== "R").map((c): [string, string] => [c, GYM_LABEL[c]]), ...REST_KINDS];
const label = (code: string) => REST_KINDS.find(([c]) => c === code)?.[1] ?? GYM_LABEL[code];

type Edit = { date: string; code: string; orig: string | null }; // orig = date of the entry being edited (null = new)

const gymItem = (st: State, date: string) => {
  const d = st.days[date];
  return d && gymItemOf(buildDay(d.type, d.meal2, st.schedule, d.shiftMin ?? 0));
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
  if (code !== null) { st.days[date].done[item.id] = keep || (date === logicalDate() ? Date.now() : 1); clearSrc(st.days[date], item.id); }
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
  const [logged, setLogged] = useState(false); // logged on this visit: header and check animate only after a tap
  const dl = s.brain.deload; // display only: a deload never changes scoring here
  const deload = dl && dl.from <= date && date <= dl.to ? (dl.from === dl.to ? "วันนี้เล่นเบา ครึ่งเซ็ต" : `สัปดาห์ deload ถึง ${THAI_DATE(dl.to)}: ท่าเดิม เซ็ตประมาณครึ่งหนึ่ง`) : null;

  const log = (code: string) => {
    setLogged(true);
    play(todayEntry?.code === code ? "tap" : "done");
    const dd = dayFor(s, date), gi = gymItemOf(buildDay(dd.type, dd.meal2, s.schedule, dd.shiftMin ?? 0));
    // Switching today's code keeps the existing tick time and its source, so it is not asked again.
    const switching = !!todayEntry && todayEntry.code !== code && !!gi && !!dd.done[gi.id];
    if (gi && todayEntry?.code === code) cancelLateTick(date, gi.id);
    else if (gi && !switching && isLateNow(date, gi))
      queueLateTick({ date, item: gi, apply: (ts, src) => update((x) => setTickTime(x, date, gi.id, ts, src)) });
    update((st) => {
      const d = dayFor(st, date);
      const item = gymItemOf(buildDay(d.type, d.meal2, st.schedule, d.shiftMin ?? 0));
      if (todayEntry?.code === code) {
        st.workouts = st.workouts.filter((w) => w.date !== date);
        if (item) setDone(st, date, item, false);
        return;
      }
      const prev = item && todayEntry ? d.done[item.id] : undefined;
      if (item) setDone(st, date, item, true, code, prev ? { at: prev, src: srcOf(d, item.id) } : {});
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
    <main className={`screen ${logged ? "gym-logged" : ""}`}>
      <h1 className="large-title">ยิม</h1>
      <div className="subtitle">7 วันล่าสุด เล่น {week} ครั้ง{lastLeg ? ` · เล่นขาล่าสุด ${THAI_DATE(lastLeg)}` : ""}</div>

      <div className="card gym-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Fragment key={todayEntry?.code ?? `next-${next}`}>
          <Tile color={COLOR[(todayEntry?.code ?? next).slice(0, 2)] ?? COLOR.R}><IconGym size={18} /></Tile>
          <div className="gym-text" style={{ flex: 1 }}>
            <div className="fs-foot ink-2">{todayEntry ? "วันนี้เล่นแล้ว" : "ครั้งถัดไป"}</div>
            <div className="value-lg">
              {(todayEntry?.code ?? next).split("-")[0]} {GYM_LABEL[(todayEntry?.code ?? next).split("-")[0]]}
            </div>
          </div>
        </Fragment>
      </div>

      {deload && <div className="card fs-sub ink-2" role="note">{deload}</div>}

      <Section header="Check-in วันนี้" footer="เลือกส่วนที่เล่นจริง ระบบจะติ๊ก 'เข้ายิม' ในหน้าวันนี้และนับรอบต่อจากนี้ · แตะซ้ำเพื่อยกเลิก">
        {GYM_CYCLE.filter((c) => c !== "R").map((c) => (
          <button key={c} className="row has-tile" aria-pressed={todayEntry?.code === c} onClick={() => log(c)}>
            <Tile color={COLOR[c]}><b className="fs-cap1">{c}</b></Tile>
            <span className="row-main row-title">{GYM_LABEL[c]}</span>
            {todayEntry?.code === c && <span className="link gym-check" aria-hidden><IconCheck size={18} /></span>}
          </button>
        ))}
        {REST_KINDS.map(([c, l]) => (
          <button key={c} className="row has-tile" aria-pressed={todayEntry?.code === c} onClick={() => log(c)}>
            <Tile color={COLOR.R}><b className="fs-cap1">R</b></Tile>
            <span className="row-main row-title">{l}</span>
            {todayEntry?.code === c && <span className="link gym-check" aria-hidden><IconCheck size={18} /></span>}
          </button>
        ))}
      </Section>

      <Section header="ประวัติ" footer={all.length ? "แตะรายการเพื่อแก้ไขหรือลบ" : undefined}>
        <button className="row" onClick={() => { play("tap"); setEdit({ date: addDays(date, -1), code: next === "R" ? "R" : next, orig: null }); }}>
          <span className="row-main row-title link">บันทึกย้อนหลัง</span>
        </button>
        {all.length === 0 && <EmptyState art="lifting-dumbbell" title="ยังไม่มีประวัติยิม" body="เช็กอินด้านบนหลังเล่นเสร็จ แล้วประวัติจะขึ้นที่นี่" />}
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
                  <button key={c} className={`chip ${edit.code === c ? "on" : ""}`} aria-pressed={edit.code === c} onClick={() => { play("tap"); setEdit({ ...edit, code: c }); }}>{c.startsWith("D") ? `${c} ${l.split(" ")[0]}` : l}</button>
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

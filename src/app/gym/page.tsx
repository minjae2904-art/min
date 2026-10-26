"use client";

import { Fragment, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { IconCheck, IconGym } from "@/components/Icons";
import { Chev, ConfirmSheet, Section, Sheet, Tap, Tile, toast } from "@/components/ui";
import { ExerciseEditor } from "@/components/gym/ExerciseEditor";
import { GymSession } from "@/components/gym/GymSession";
import { GymSummary } from "@/components/gym/GymSummary";
import { Spark } from "@/components/gym/Spark";
import { GYM_CODES, finishGym, fmtKg, isCode, startGym, volumeTrend, type Summary } from "@/lib/gymlog";
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

// "/gym?start=1" (the "+" sheet, the Now card, the row menu): start once the state is settled, then strip the param.
function StartReader({ run }: { run: RefObject<() => void> }) {
  const want = useSearchParams().get("start") === "1";
  const { pulled } = useStore();
  const done = useRef(false);
  useEffect(() => {
    if (!want) { done.current = false; return; } // re-arm after the strip, so a later "?start=1" on this page starts again
    if (!pulled || done.current) return;
    done.current = true;
    setTimeout(() => run.current(), 0); // after the page's own effects have refreshed run.current
    window.history.replaceState(null, "", "/gym");
  }, [want, pulled, run]);
  return null;
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
  // v1.7 set logging: today's D-code (a check-in) or the next one in the cycle; a rest day picks a code first.
  const startCode = todayEntry && isCode(todayEntry.code) ? todayEntry.code : isCode(next) ? next : null;
  const [pick, setPick] = useState<string | null>(null);
  const code = pick ?? startCode ?? "D1";
  const [sum, setSum] = useState<{ sum: Summary; ticked: boolean } | null>(null);
  const [askEnd, setAskEnd] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const trends = GYM_CODES.map((c) => ({ c, t: volumeTrend(s, c) })).filter((x) => x.t.length);

  const startSession = (c: string) => {
    if (s.gym.run) return;
    play("tap");
    update((x) => { if (!x.gym.run) startGym(x, date, c, Date.now()); });
  };
  const startRef = useRef<() => void>(() => {});
  useEffect(() => { startRef.current = () => { if (!s.gym.run && startCode) startSession(startCode); }; });

  // "จบ": snapshot, finish, undo toast, summary. Zero ticked sets asks first (nothing would be saved).
  // endAt: a stale run (left open) ends at its last set instead of now.
  function finish(force = false, endAt?: number) {
    const run = s.gym.run;
    if (!run) return;
    const any = run.x.some((e) => e.s.some((t) => t[2] === 1 && t[1] > 0));
    if (!any && !force) { play("tap"); setAskEnd(true); return; }
    const d = run.d, had = d in s.days;
    const snap = structuredClone({ run, end: s.gym.end, log: s.gym.log, workouts: s.workouts, done: s.days[d]?.done, doneSrc: s.days[d]?.doneSrc });
    const now = endAt ?? Date.now();
    const fin = finishGym(structuredClone(s), now); // the same pure call on a copy gives the summary (update() runs later)
    update((x) => { finishGym(x, now); });
    const restore = () => update((x) => {
      x.gym.run = structuredClone(snap.run); x.gym.log = structuredClone(snap.log); x.workouts = structuredClone(snap.workouts);
      if (snap.end !== undefined) x.gym.end = snap.end; else delete x.gym.end;
      if (!had) { delete x.days[d]; return; }
      const dd = x.days[d];
      if (!dd) return;
      dd.done = structuredClone(snap.done ?? {});
      if (snap.doneSrc) dd.doneSrc = structuredClone(snap.doneSrc); else delete dd.doneSrc;
    });
    if (!any) { play("undo"); toast("จบโดยไม่บันทึกเซ็ต", { action: "เลิกทำ", onAction: restore }); return; }
    play("done");
    toast(`จบยิม ${run.c} แล้ว`, { action: "เลิกทำ", onAction: () => { setSum(null); restore(); } });
    if (fin) setSum({ sum: fin, ticked: !!fin.ticked });
  }
  // GymSession flushes set drafts, then calls this on the next tick: the ref holds the render that already has them.
  const finishRef = useRef(finish);
  useLayoutEffect(() => { finishRef.current = finish; });

  function discard() {
    const run = s.gym.run;
    if (!run) return;
    const snap = structuredClone(run), end = s.gym.end;
    play("undo");
    update((x) => { x.gym.run = null; x.gym.end = run.at; });
    toast("ทิ้งรอบนี้แล้ว", { action: "เลิกทำ", onAction: () => update((x) => {
      if (x.gym.run) return;
      x.gym.run = structuredClone(snap);
      if (end !== undefined) x.gym.end = end; else delete x.gym.end;
    }) });
  }

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

      {s.gym.run ? <GymSession onFinish={(endAt) => finishRef.current(false, endAt)} onDiscard={discard} /> : <>
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

      <Section header="บันทึกเซ็ต" footer="เติมน้ำหนักและครั้งจากครั้งก่อนให้ ติ๊กเซ็ตแล้วจับเวลาพัก · จบแล้วติ๊ก 'เข้ายิม' ให้เอง">
        <div className="chips gym-codes" role="radiogroup" aria-label="ส่วนที่จะเล่น">
          {GYM_CODES.map((c) => (
            <button key={c} type="button" role="radio" className={`chip ${code === c ? "on" : ""}`} aria-checked={code === c} onClick={() => { play("tap"); setPick(c); }}>{c}</button>
          ))}
        </div>
        <Tap className="btn gym-start" onTap={() => startSession(code)}>เริ่มบันทึกเซ็ต {code}</Tap>
        <button type="button" className="row" onClick={() => { play("tap"); setEditCode(code); }}>
          <span className="row-main row-title link">แก้ท่าของ {code}</span><Chev />
        </button>
      </Section>
      </>}

      {deload && <div className="card fs-sub ink-2" role="note">{deload}</div>}

      {trends.length > 0 && (
        <Section header="ยกรวมต่อครั้ง" footer="น้ำหนัก x ครั้ง ของเซ็ตที่ติ๊ก (ท่าน้ำหนักตัวนับ 0)">
          {trends.map(({ c, t }) => (
            <div key={c} className="row has-tile">
              <Tile color={COLOR[c]}><b className="fs-cap1">{c}</b></Tile>
              <span className="row-main"><span className="row-title">{GYM_LABEL[c]}</span><span className="row-sub num">ล่าสุด {fmtKg(t[t.length - 1].vol)} kg · {t.length} ครั้ง</span></span>
              <Spark values={t.map((v) => v.vol)} label={`แนวโน้มยกรวม ${c}`} />
            </div>
          ))}
        </Section>
      )}

      <Section header="เช็กอินแบบเร็ว (ไม่บันทึกเซ็ต)" footer="เลือกส่วนที่เล่นจริง ระบบจะติ๊ก 'เข้ายิม' ในหน้าวันนี้และนับรอบต่อจากนี้ · แตะซ้ำเพื่อยกเลิก">
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

      <GymSummary sum={sum?.sum ?? null} ticked={!!sum?.ticked} onClose={() => setSum(null)} />
      <ConfirmSheet open={askEnd} title="ยังไม่ได้ติ๊กเซ็ตไหน" body="จบตอนนี้จะไม่บันทึกเซ็ตของครั้งนี้" confirmLabel="จบโดยไม่บันทึก"
        onConfirm={() => finish(true)} onClose={() => setAskEnd(false)} />
      <ExerciseEditor code={editCode ?? code} open={editCode !== null} onClose={() => setEditCode(null)} />
      <Suspense fallback={null}><StartReader run={startRef} /></Suspense>
    </main>
  );
}

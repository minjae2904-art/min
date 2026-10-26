"use client";

// CareSheet (v1.7 spec 4.2): one routine's steps for today, context chips and the footer actions.
// Step ticks live in DayLog.care; the Today row ticks itself once every required due step is done (progress.ts).
import { useState } from "react";
import { IconCheck, IconMore } from "@/components/Icons";
import { Section, Sheet, Tap, toast } from "@/components/ui";
import { daysBetween, cadLabel, parseCad } from "@/lib/care/cadence";
import { dueTasks, lastReqDaily, restoreCare, rowOf, rowState, setHot, setIrr, skipRow, skipStep, snapCare, stepShort, stepsFor, tickStep } from "@/lib/care/progress";
import { BOWEL, SYM_LABEL, WALK } from "@/lib/care/track";
import type { Routine, Step } from "@/lib/care/types";
import { addDays, hm } from "@/lib/date";
import { openLive } from "@/lib/intent";
import { SYMS, dayFor, type SkipWhy, type State, type Sym } from "@/lib/model";
import { itemsFor, type Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Upd = (fn: (x: State) => void) => void;

export const SKIP_WHY: [SkipWhy, string][] = [["rest", "พัก"], ["sick", "ป่วย"], ["travel", "เดินทาง"], ["na", "ไม่ได้ใช้"]];
export const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export const routineOf = (s: State, rid: string): Routine | undefined => s.schedule.care?.find((r) => r.id === rid);

// "ข้ามวันนี้" with a reason; the undo restores skip, skipWhy and reschedAt exactly (snapCare).
export function skipRoutineWithUndo(update: Upd, s: State, date: string, item: Item, why: SkipWhy) {
  const rid = item.routine;
  if (!rid) return;
  const snap = snapCare(s, date, rid);
  play("toggle");
  update((x) => skipRow(x, date, item, why));
  toast(`ข้าม ${item.title} วันนี้ · ไม่นับคะแนน`, { action: "เลิกทำ", onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
}

// A change to the routine list with an exact undo of schedule.care.
export function editRoutines(update: Upd, s: State, fn: (list: Routine[]) => void, msg: string) {
  const prev = structuredClone(s.schedule.care ?? []);
  update((x) => fn((x.schedule.care ??= [])));
  toast(msg, { action: "เลิกทำ", onAction: () => update((x) => { x.schedule.care = structuredClone(prev); }) });
}
const patchStep = (list: Routine[], rid: string, sid: string, fn: (st: Step) => void) => {
  const st = list.find((r) => r.id === rid)?.steps.find((y) => y.id === sid);
  if (st) fn(st);
};
// Weekday cadence from a day set: none or all 7 = daily.
export const weekCad = (days: number[]) => (days.length === 0 || days.length === 7 ? "d" : `w:${[...days].sort((a, b) => a - b).join(",")}`);

export function CareSheet({ rid, date, onClose, onComplete, onJournal, onEdit, onTasks }: {
  rid: string | null; date: string; onClose: () => void;
  onComplete: (item: Item | undefined, rid: string) => void; // "เสร็จหมด" through the page (toast, late ask, settle)
  onJournal: () => void; onEdit: (rid: string, sid?: string) => void; onTasks: () => void;
}) {
  const { s, update } = useStore();
  const [last, setLast] = useState(rid);
  const [mode, setMode] = useState<"main" | "menu" | "days">("main");
  const [menu, setMenu] = useState<string | null>(null); // step id of the open step menu
  const [days, setDays] = useState<number[]>([]);
  const [skipAsk, setSkipAsk] = useState(false);
  if (rid && rid !== last) { setLast(rid); setMode("main"); setSkipAsk(false); }
  const id = rid ?? last;
  const r = id ? routineOf(s, id) : undefined;
  if (!id || !r) return null;

  const day = dayFor(s, date);
  const prev = s.days[addDays(date, -1)];
  const item = rowOf(s, date, id);
  const views = stepsFor(r, day, date, prev);
  const st = rowState(r, day, date, prev);
  const done = !!(item && day.done[item.id]);
  const step = menu ? r.steps.find((x) => x.id === menu) : undefined;
  const menuView = menu ? views.find((v) => v.step.id === menu) : undefined;
  const lastReq = !!step && lastReqDaily(r, step.id);
  const LAST_REQ = "ขั้นบังคับสุดท้ายที่ทำทุกวัน · ตั้งขั้นอื่นเป็นบังคับก่อน ที่แก้กิจวัตร";
  const hot = typeof day.hot === "number" && day.hot > 0;
  const patchDay = (fn: (d: ReturnType<typeof dayFor>) => void) => update((x) => { const d = dayFor(x, date); fn(d); x.days[date] = d; });

  function tap(v: (typeof views)[number]) {
    if (!v.due) return;
    if (v.step.act === "journal" && !v.done) { onClose(); onJournal(); return; }
    const on = !v.done;
    // Dry run: does this tick complete the routine?
    const probe = structuredClone(s);
    tickStep(probe, date, id!, v.step.id, on);
    const after = rowState(r!, dayFor(probe, date), date, prev);
    play(!on ? "undo" : after.complete && !st.complete ? "complete" : "done");
    update((x) => tickStep(x, date, id!, v.step.id, on));
    if (on && after.complete && !st.complete) toast(`ครบ ${r!.name} แล้ว`);
  }

  function skipTonight() {
    if (!step || !menuView) return;
    const snap = snapCare(s, date, id!), on = !menuView.skipped;
    update((x) => skipStep(x, date, id!, step.id, on));
    play("toggle");
    toast(on ? `ข้าม "${stepShort(step)}" คืนนี้` : `เอา "${stepShort(step)}" กลับมาแล้ว`, { action: "เลิกทำ", onAction: () => update((x) => restoreCare(x, date, id!, snap)) });
    setMode("main");
  }

  // Context chips per slot.
  const acne = s.care.packs.includes("acne");
  const ret = r.steps.find((x) => x.id === "ret" && x.on !== false);
  const rc = ret ? parseCad(ret.cad) : null;
  const k = rc && rc.t === "r" ? daysBetween(rc.from, date) : -1;
  const msKey = k >= 84 ? "pm.ret.84" : k >= 42 && k <= 56 ? "pm.ret.42" : null;
  const askRet = id === "pm" && acne && msKey && !s.care.ms[msKey];
  const hasStream = itemsFor(s.schedule, day, date).some((i) => i.id === "stream");
  const tasks = id === "pm" ? dueTasks(s, date) : [];
  const sym = Array.isArray(day.sym) ? day.sym : [];

  function setMs(key: string, v: 1 | 2 | 3) {
    const before = s.care.ms[key];
    play("tap");
    update((x) => { x.care.ms[key] = v; });
    toast("บันทึกแล้ว", { action: "เลิกทำ", onAction: () => update((x) => { if (before) x.care.ms[key] = before; else delete x.care.ms[key]; }) });
  }
  const toggleSym = (v: Sym) => patchDay((d) => {
    const cur = Array.isArray(d.sym) ? d.sym : [];
    const next = cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v].filter((y) => (SYMS as readonly string[]).includes(y));
    if (next.length) d.sym = next; else delete d.sym;
  });
  const band = (key: "bowel" | "walk", n: 1 | 2 | 3) => { play("tap"); patchDay((d) => { if (d[key] === n) delete d[key]; else d[key] = n; }); };

  return (
    <>
      <Sheet open={!!rid && mode === "main"} title={r.name} onClose={onClose}>
        <div className="sheet-meta num">{item ? `${hm(item.min)} · ` : ""}{st.done}/{st.total} ขั้นบังคับ</div>
        <div className="group care-steps">
          {views.filter((v) => v.due || v.why).map((v) => (
            <div key={v.step.id} className="care-step">
              <Tap className={`row ${v.done ? "done" : ""} ${v.due ? "" : "off"}`} pressed={v.done} disabled={!v.due} onTap={() => tap(v)}>
                <span className={`check ${v.done ? "on" : ""}`}>{v.done && <IconCheck size={16} />}</span>
                <span className="row-main">
                  <span className="row-title"><span className="strike">{v.step.title}</span></span>
                  {v.why === "rest-skin" && <span className="row-sub">พักผิว</span>}
                  {v.why === "conflict" && <span className="row-sub">คืนนี้ข้าม (มี{v.first?.split(" ")[0] ?? ""}แล้ว)</span>}
                  {!v.why && v.step.hint && <span className="row-sub">{v.step.hint}</span>}
                  {(v.step.opt || (v.step.cad && v.step.cad !== "d") || v.skipped) && (
                    <span className="care-badges">
                      {v.step.cad && v.step.cad !== "d" && <span className="badge">{cadLabel(v.step.cad)}</span>}
                      {v.step.opt && <span className="badge">ไม่บังคับ</span>}
                      {v.skipped && <span className="badge">ข้ามคืนนี้</span>}
                    </span>
                  )}
                </span>
              </Tap>
              <button type="button" className="row-more" aria-label={`ตัวเลือก: ${v.step.title}`} onClick={() => { play("tap"); setMenu(v.step.id); setMode("menu"); }}><IconMore size={20} /></button>
            </div>
          ))}
          {!views.some((v) => v.due || v.why) && <div className="row"><span className="row-main row-sub">วันนี้ไม่มีขั้นที่ต้องทำ</span></div>}
        </div>

        {id === "am" && (
          <Section header="วันนี้">
            <div className="row care-ctx">
              <span className="row-main">
                <span className="row-title">ร้อน/อยู่กลางแจ้งวันนี้</span>
                <span className="row-sub">เตือนทากันแดดซ้ำทุก 2 ชม. ถึง 18:00{s.care.water.plan ? " · เป้าน้ำ +500 ml" : ""}</span>
              </span>
              <button className={`chip ${hot ? "on" : ""}`} aria-pressed={hot} onClick={() => { play("toggle"); update((x) => setHot(x, date, !hot, Date.now())); }}>{hot ? "ร้อน" : "ปกติ"}</button>
            </div>
            {s.care.track.bowel && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">ขับถ่าย</span>
                <span className="chips">{BOWEL.map((t, i) => <button key={t} className={`chip chip--sm ${day.bowel === i + 1 ? "on" : ""}`} aria-pressed={day.bowel === i + 1} onClick={() => band("bowel", (i + 1) as 1 | 2 | 3)}>{t}</button>)}</span>
              </div>
            )}
          </Section>
        )}

        {id === "pm" && (
          <Section header="วันนี้">
            <div className="row care-ctx">
              <span className="row-main"><span className="row-title">ผิวระคายวันนี้</span><span className="row-sub">พักตัวแรง 2 คืน</span></span>
              <button className={`chip ${day.irr ? "on" : ""}`} aria-pressed={!!day.irr} onClick={() => { play("toggle"); update((x) => setIrr(x, date, !day.irr)); }}>{day.irr ? "ระคาย" : "ปกติ"}</button>
            </div>
            {s.care.track.walk && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">ก้าวเดินวันนี้</span>
                <span className="chips">{WALK.map((t, i) => <button key={t} className={`chip chip--sm ${day.walk === i + 1 ? "on" : ""}`} aria-pressed={day.walk === i + 1} onClick={() => band("walk", (i + 1) as 1 | 2 | 3)}>{t}</button>)}</span>
              </div>
            )}
            {s.care.track.sym && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">มีอาการวันนี้ไหม</span>
                <span className="chips">{SYMS.map((v) => <button key={v} className={`chip chip--sm ${sym.includes(v) ? "on" : ""}`} aria-pressed={sym.includes(v)} onClick={() => { play("tap"); toggleSym(v); }}>{SYM_LABEL[v]}</button>)}</span>
              </div>
            )}
            {askRet && msKey && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">ใช้เรตินอยด์มา {k} วันแล้ว ผิวดีขึ้นไหม</span>
                <span className="chips">{(["ดีขึ้น", "เท่าเดิม", "แย่ลง"] as const).map((t, i) => <button key={t} className="chip chip--sm" onClick={() => setMs(msKey, (i + 1) as 1 | 2 | 3)}>{t}</button>)}</span>
              </div>
            )}
          </Section>
        )}

        {id === "prep" && hasStream && (
          <div className="chips care-live"><button className="chip chip--fill" onClick={() => { onClose(); openLive("live"); }}>ไปโหมดไลฟ์</button></div>
        )}

        {tasks.length > 0 && (
          <button className="row care-foot-row" onClick={() => { play("tap"); onClose(); onTasks(); }}>
            <span className="row-main"><span className="row-title">ครบรอบ {tasks.length} งาน: {tasks.slice(0, 2).map((t) => t.title.split(" ")[0]).join(" · ")}</span></span>
          </button>
        )}
        {st.tomorrow.length > 0 && <div className="sheet-meta care-tmr">พรุ่งนี้: {st.tomorrow.map(stepShort).join(" · ")}</div>}

        <div className="confirm-actions care-actions">
          <button className="btn" disabled={done || (st.complete && !item)} onClick={() => { onComplete(item, id); onClose(); }}>{done ? "ครบแล้ว" : "เสร็จหมด"}</button>
          {!done && item && !skipAsk && <button className="btn secondary" onClick={() => { play("tap"); setSkipAsk(true); }}>ข้ามวันนี้</button>}
          {!done && item && skipAsk && (
            <div className="chips care-why" role="group" aria-label="เหตุผลที่ข้าม">
              {SKIP_WHY.map(([w, t]) => <button key={w} className="chip" onClick={() => { onClose(); skipRoutineWithUndo(update, s, date, item, w); }}>{t}</button>)}
            </div>
          )}
        </div>
        <div className="section-footer care-note">ข้อมูลสุขภาพทั่วไป ไม่ใช่การวินิจฉัย</div>
      </Sheet>

      <Sheet open={!!rid && mode === "menu"} title={step?.title ?? ""} detent="medium" onClose={() => setMode("main")}>
        {step && (
          <div className="group">
            <button className="row" disabled={lastReq} aria-disabled={lastReq} onClick={() => { if (lastReq) return; play("toggle"); setMode("main"); editRoutines(update, s, (l) => patchStep(l, id, step.id, (x) => { x.on = false; }), `ซ่อน "${stepShort(step)}" แล้ว`); }}>
              <span className="row-main"><span className="row-title">ซ่อนขั้นนี้</span><span className="row-sub">{lastReq ? LAST_REQ : "เปิดกลับได้ที่ แก้กิจวัตร"}</span></span>
            </button>
            <button className="row" onClick={() => { play("tap"); const c = parseCad(step.cad); setDays(c.t === "w" ? c.days : [0, 1, 2, 3, 4, 5, 6]); setMode("days"); }}>
              <span className="row-main"><span className="row-title">เปลี่ยนวัน</span><span className="row-sub">ตอนนี้: {cadLabel(step.cad)}</span></span>
            </button>
            <button className="row" onClick={() => { play("tap"); setMode("main"); onClose(); onEdit(id, step.id); }}>
              <span className="row-main row-title">แก้ไข</span>
            </button>
            {(step.opt || (step.cad && step.cad !== "d")) && (
              <button className="row" onClick={skipTonight}>
                <span className="row-main row-title">{menuView?.skipped ? "เลิกข้ามคืนนี้" : "ข้ามคืนนี้"}</span>
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!rid && mode === "days"} title="เปลี่ยนวัน" detent="medium" onClose={() => setMode("main")}>
        {step && (
          <>
            <div className="sheet-meta">{step.title}</div>
            <div className="chips care-days" role="group" aria-label="วันในสัปดาห์">
              {DOW.map((t, i) => {
                const on = days.includes(i);
                return <button key={t} className={`chip chip--day ${on ? "on" : ""}`} aria-pressed={on} onClick={() => { play("tap"); setDays(on ? days.filter((d) => d !== i) : [...days, i]); }}>{t}</button>;
              })}
            </div>
            <div className="chips care-days"><button className={`chip ${days.length === 7 ? "on" : ""}`} aria-pressed={days.length === 7} onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>ทุกวัน</button></div>
            {lastReq && days.length < 7 && <div className="sheet-meta">{LAST_REQ}</div>}
            <button className="btn" disabled={!days.length || (lastReq && days.length < 7)} onClick={() => {
              const cad = weekCad(days);
              play("done");
              setMode("main");
              editRoutines(update, s, (l) => patchStep(l, id, step.id, (x) => { x.cad = cad; x.ed = true; }), `"${stepShort(step)}" ${cadLabel(cad)}`);
            }}>บันทึก</button>
          </>
        )}
      </Sheet>
    </>
  );
}

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
import { fmt, getLang, langArr, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import { careStepText, careTaskText, newRoutineName, routineName, stepHint, stepTitle } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

type Upd = (fn: (x: State) => void) => void;

export const SKIP_WHY: [SkipWhy, string][] = langArr(() => [["rest", m("careSheet.why.rest")], ["sick", m("careSheet.why.sick")], ["travel", m("careSheet.why.travel")], ["na", m("careSheet.why.na")]]);
export const DOW: string[] = langArr(() => [0, 1, 2, 3, 4, 5, 6].map((d) => fmt.dowShort(d)));
export { newRoutineName, routineName }; // display names of stored routine names (spec 7)
// Short head of a display title (same rule as progress.stepShort): Thai keeps its first word; spaced languages use the
// head before the first ",", " (", " · " or ": ", at most 4 words.
export const headText = (t: string) => getLang() === "th" ? t.split(" ")[0] : t.split(/,| \(| · |: /)[0].split(" ").slice(0, 4).join(" ");
export const routineOf = (s: State, rid: string): Routine | undefined => s.schedule.care?.find((r) => r.id === rid);

// "ข้ามวันนี้" with a reason; the undo restores skip, skipWhy and reschedAt exactly (snapCare).
export function skipRoutineWithUndo(update: Upd, s: State, date: string, item: Item, why: SkipWhy) {
  const rid = item.routine;
  if (!rid) return;
  const snap = snapCare(s, date, rid);
  play("toggle");
  update((x) => skipRow(x, date, item, why));
  toast(m("careSheet.toast.skipped", { title: item.title }), { action: c("undo"), onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
}

// A change to the routine list with an exact undo of schedule.care.
export function editRoutines(update: Upd, s: State, fn: (list: Routine[]) => void, msg: string) {
  const prev = structuredClone(s.schedule.care ?? []);
  update((x) => fn((x.schedule.care ??= [])));
  toast(msg, { action: c("undo"), onAction: () => update((x) => { x.schedule.care = structuredClone(prev); }) });
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
  useLang();
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
  const LAST_REQ = m("careSheet.lastReq");
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
    if (on && after.complete && !st.complete) toast(m("careSheet.toast.complete", { name: routineName(r!.name) }));
  }

  function skipTonight() {
    if (!step || !menuView) return;
    const snap = snapCare(s, date, id!), on = !menuView.skipped;
    update((x) => skipStep(x, date, id!, step.id, on));
    play("toggle");
    toast(on ? m("careSheet.toast.skipTonight", { step: stepShort(step) }) : m("careSheet.toast.unskip", { step: stepShort(step) }), { action: c("undo"), onAction: () => update((x) => restoreCare(x, date, id!, snap)) });
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
    toast(m("careSheet.toast.saved"), { action: c("undo"), onAction: () => update((x) => { if (before) x.care.ms[key] = before; else delete x.care.ms[key]; }) });
  }
  const toggleSym = (v: Sym) => patchDay((d) => {
    const cur = Array.isArray(d.sym) ? d.sym : [];
    const next = cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v].filter((y) => (SYMS as readonly string[]).includes(y));
    if (next.length) d.sym = next; else delete d.sym;
  });
  const band = (key: "bowel" | "walk", n: 1 | 2 | 3) => { play("tap"); patchDay((d) => { if (d[key] === n) delete d[key]; else d[key] = n; }); };

  return (
    <>
      <Sheet open={!!rid && mode === "main"} title={routineName(r.name)} onClose={onClose}>
        <div className="sheet-meta num">{m("careSheet.meta.required", { pre: item ? `${hm(item.min)} · ` : "", done: st.done, total: st.total })}</div>
        <div className="group care-steps">
          {views.filter((v) => v.due || v.why).map((v) => (
            <div key={v.step.id} className="care-step">
              <Tap className={`row ${v.done ? "done" : ""} ${v.due ? "" : "off"}`} pressed={v.done} disabled={!v.due} onTap={() => tap(v)}>
                <span className={`check ${v.done ? "on" : ""}`}>{v.done && <IconCheck size={16} />}</span>
                <span className="row-main">
                  <span className="row-title"><span className="strike">{stepTitle(v.step)}</span></span>
                  {v.why === "rest-skin" && <span className="row-sub">{m("careSheet.step.restSkin")}</span>}
                  {v.why === "conflict" && <span className="row-sub">{m("careSheet.step.conflict", { first: v.first === undefined ? "" : headText(careStepText(v.first)) })}</span>}
                  {!v.why && v.step.hint && <span className="row-sub">{stepHint(v.step)}</span>}
                  {(v.step.opt || (v.step.cad && v.step.cad !== "d") || v.skipped) && (
                    <span className="care-badges">
                      {v.step.cad && v.step.cad !== "d" && <span className="badge">{cadLabel(v.step.cad)}</span>}
                      {v.step.opt && <span className="badge">{c("optional")}</span>}
                      {v.skipped && <span className="badge">{m("careSheet.badge.skipped")}</span>}
                    </span>
                  )}
                </span>
              </Tap>
              <button type="button" className="row-more" aria-label={m("careSheet.aria.more", { title: stepTitle(v.step) })} onClick={() => { play("tap"); setMenu(v.step.id); setMode("menu"); }}><IconMore size={20} /></button>
            </div>
          ))}
          {!views.some((v) => v.due || v.why) && <div className="row"><span className="row-main row-sub">{m("careSheet.empty")}</span></div>}
        </div>

        {id === "am" && (
          <Section header={c("today")}>
            <div className="row care-ctx">
              <span className="row-main">
                <span className="row-title">{m("careSheet.hot.title")}</span>
                <span className="row-sub">{m("careSheet.hot.sub", { water: s.care.water.plan ? m("careSheet.hot.water") : "" })}</span>
              </span>
              <button className={`chip ${hot ? "on" : ""}`} aria-pressed={hot} onClick={() => { play("toggle"); update((x) => setHot(x, date, !hot, Date.now())); }}>{hot ? m("careSheet.hot.on") : c("normal")}</button>
            </div>
            {s.care.track.bowel && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">{m("careSheet.bowel")}</span>
                <span className="chips">{BOWEL.map((t, i) => <button key={t} className={`chip chip--sm ${day.bowel === i + 1 ? "on" : ""}`} aria-pressed={day.bowel === i + 1} onClick={() => band("bowel", (i + 1) as 1 | 2 | 3)}>{t}</button>)}</span>
              </div>
            )}
          </Section>
        )}

        {id === "pm" && (
          <Section header={c("today")}>
            <div className="row care-ctx">
              <span className="row-main"><span className="row-title">{m("careSheet.irr.title")}</span><span className="row-sub">{m("careSheet.irr.sub")}</span></span>
              <button className={`chip ${day.irr ? "on" : ""}`} aria-pressed={!!day.irr} onClick={() => { play("toggle"); update((x) => setIrr(x, date, !day.irr)); }}>{day.irr ? m("careSheet.irr.on") : c("normal")}</button>
            </div>
            {s.care.track.walk && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">{m("careSheet.walk")}</span>
                <span className="chips">{WALK.map((t, i) => <button key={t} className={`chip chip--sm ${day.walk === i + 1 ? "on" : ""}`} aria-pressed={day.walk === i + 1} onClick={() => band("walk", (i + 1) as 1 | 2 | 3)}>{t}</button>)}</span>
              </div>
            )}
            {s.care.track.sym && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">{m("careSheet.sym")}</span>
                <span className="chips">{SYMS.map((v) => <button key={v} className={`chip chip--sm ${sym.includes(v) ? "on" : ""}`} aria-pressed={sym.includes(v)} onClick={() => { play("tap"); toggleSym(v); }}>{SYM_LABEL[v]}</button>)}</span>
              </div>
            )}
            {askRet && msKey && (
              <div className="row care-ctx care-ctx--wrap">
                <span className="row-main row-title">{m("careSheet.ret.ask", { k })}</span>
                <span className="chips">{(["careSheet.ret.better", "careSheet.ret.same", "careSheet.ret.worse"] as const).map((t, i) => <button key={t} className="chip chip--sm" onClick={() => setMs(msKey, (i + 1) as 1 | 2 | 3)}>{m(t)}</button>)}</span>
              </div>
            )}
          </Section>
        )}

        {id === "prep" && hasStream && (
          <div className="chips care-live"><button className="chip chip--fill" onClick={() => { onClose(); openLive("live"); }}>{m("careSheet.liveMode")}</button></div>
        )}

        {tasks.length > 0 && (
          <button className="row care-foot-row" onClick={() => { play("tap"); onClose(); onTasks(); }}>
            <span className="row-main"><span className="row-title">{m("careSheet.tasksDue", { n: tasks.length, list: tasks.slice(0, 2).map((t) => headText(careTaskText(t.title))).join(" · ") })}</span></span>
          </button>
        )}
        {st.tomorrow.length > 0 && <div className="sheet-meta care-tmr">{m("careSheet.tomorrow", { list: st.tomorrow.map(stepShort).join(" · ") })}</div>}

        <div className="confirm-actions care-actions">
          <button className="btn" disabled={done || (st.complete && !item)} onClick={() => { onComplete(item, id); onClose(); }}>{done ? m("careSheet.btn.allDoneAlready") : c("allDone")}</button>
          {!done && item && !skipAsk && <button className="btn secondary" onClick={() => { play("tap"); setSkipAsk(true); }}>{c("skipToday")}</button>}
          {!done && item && skipAsk && (
            <div className="chips care-why" role="group" aria-label={m("careSheet.aria.why")}>
              {SKIP_WHY.map(([w, t]) => <button key={w} className="chip" onClick={() => { onClose(); skipRoutineWithUndo(update, s, date, item, w); }}>{t}</button>)}
            </div>
          )}
        </div>
        <div className="section-footer care-note">{m("careSheet.note")}</div>
      </Sheet>

      <Sheet open={!!rid && mode === "menu"} title={step ? stepTitle(step) : ""} detent="medium" onClose={() => setMode("main")}>
        {step && (
          <div className="group">
            <button className="row" disabled={lastReq} aria-disabled={lastReq} onClick={() => { if (lastReq) return; play("toggle"); setMode("main"); editRoutines(update, s, (l) => patchStep(l, id, step.id, (x) => { x.on = false; }), m("careSheet.toast.hidden", { step: stepShort(step) })); }}>
              <span className="row-main"><span className="row-title">{m("careSheet.menu.hide")}</span><span className="row-sub">{lastReq ? LAST_REQ : m("careSheet.menu.hideSub")}</span></span>
            </button>
            <button className="row" onClick={() => { play("tap"); const c = parseCad(step.cad); setDays(c.t === "w" ? c.days : [0, 1, 2, 3, 4, 5, 6]); setMode("days"); }}>
              <span className="row-main"><span className="row-title">{m("careSheet.menu.days")}</span><span className="row-sub">{m("careSheet.menu.daysNow", { cad: cadLabel(step.cad) })}</span></span>
            </button>
            <button className="row" onClick={() => { play("tap"); setMode("main"); onClose(); onEdit(id, step.id); }}>
              <span className="row-main row-title">{c("edit")}</span>
            </button>
            {(step.opt || (step.cad && step.cad !== "d")) && (
              <button className="row" onClick={skipTonight}>
                <span className="row-main row-title">{menuView?.skipped ? m("careSheet.menu.unskipTonight") : m("careSheet.menu.skipTonight")}</span>
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!rid && mode === "days"} title={m("careSheet.menu.days")} detent="medium" onClose={() => setMode("main")}>
        {step && (
          <>
            <div className="sheet-meta">{stepTitle(step)}</div>
            <div className="chips care-days" role="group" aria-label={m("careSheet.aria.days")}>
              {DOW.map((t, i) => {
                const on = days.includes(i);
                return <button key={t} className={`chip chip--day ${on ? "on" : ""}`} aria-pressed={on} onClick={() => { play("tap"); setDays(on ? days.filter((d) => d !== i) : [...days, i]); }}>{t}</button>;
              })}
            </div>
            <div className="chips care-days"><button className={`chip ${days.length === 7 ? "on" : ""}`} aria-pressed={days.length === 7} onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>{m("careSheet.everyDay")}</button></div>
            {lastReq && days.length < 7 && <div className="sheet-meta">{LAST_REQ}</div>}
            <button className="btn" disabled={!days.length || (lastReq && days.length < 7)} onClick={() => {
              const cad = weekCad(days);
              play("done");
              setMode("main");
              editRoutines(update, s, (l) => patchStep(l, id, step.id, (x) => { x.cad = cad; x.ed = true; }), `"${stepShort(step)}" ${cadLabel(cad)}`);
            }}>{c("save")}</button>
          </>
        )}
      </Sheet>
    </>
  );
}

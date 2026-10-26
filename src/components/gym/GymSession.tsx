"use client";

// v1.7 set logging screen (no wake lock). Steppers and the kg input edit a local draft; the draft commits through setVal on input
// blur, 800 ms after the last stepper tap, or with the set tick (which also starts the rest timer in the accessory).
import { useCallback, useEffect, useRef, useState } from "react";
import { msgs } from "@/i18n";
import { gymExName } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-gym";
import { IconCheck } from "@/components/Icons";
import { Chev, Sheet, Tap } from "@/components/ui";
import { Sparkline } from "@/components/Charts";
import { THAI_DATE, logicalDate } from "@/lib/date";
import {
  addExercise, addSet, applyHint, exById, extrasOf, fmtKg, hint, history, lastSets, pastSessions, planFor, removeSet, setTxt, setVal, tickSet,
  DEFAULT_PLAN, GYM_CODES,
} from "@/lib/gymlog";
import type { GymEx, GymSet } from "@/lib/model";
import { GYM_LABEL } from "@/lib/rotation";
import { hmClock, msClock } from "@/lib/session";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(C);
const blurActive = () => { const a = document.activeElement; if (a instanceof HTMLElement && a.tagName === "INPUT") a.blur(); };
const kgIn = (n: number) => (n ? fmtKg(n) : "");
const parseKg = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
type Draft = { kg: string; reps: number };
const FLUSH = "krob-gym-flush";

function SetRow({ i, j, set, ex }: { i: number; j: number; set: GymSet; ex: GymEx }) {
  const { update } = useStore();
  const [kg, setKg] = useState(kgIn(set[0]));
  const [reps, setReps] = useState(set[1]);
  const [pending, setPending] = useState(false);
  const [seen, setSeen] = useState(`${set[0]}|${set[1]}`);
  const draft = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `${set[0]}|${set[1]}`;
  if (key !== seen && !pending) { setSeen(key); setKg(kgIn(set[0])); setReps(set[1]); }
  useEffect(() => () => clearTimeout(timer.current), []);

  const take = () => { clearTimeout(timer.current); const d = draft.current; draft.current = null; setPending(false); return d; };
  const commit = useCallback(() => {
    clearTimeout(timer.current);
    const d = draft.current;
    draft.current = null;
    setPending(false);
    if (d) update((x) => setVal(x, i, j, parseKg(d.kg), d.reps));
  }, [i, j, update]);
  useEffect(() => { // "จบ" flushes every pending draft before the session is read
    window.addEventListener(FLUSH, commit);
    return () => window.removeEventListener(FLUSH, commit);
  }, [commit]);
  const change = (k: string, r: number, idle: boolean) => {
    draft.current = { kg: k, reps: r };
    setKg(k); setReps(r); setPending(true);
    clearTimeout(timer.current);
    if (idle) timer.current = setTimeout(commit, 800);
  };
  const step = (dk: number, dr: number) => {
    blurActive();
    play("tap");
    const k = dk ? kgIn(Math.max(0, Math.min(500, Math.round((parseKg(kg) + dk) * 100) / 100))) : kg;
    change(k, Math.max(0, Math.min(50, reps + dr)), true);
  };
  const done = set[2] === 1;
  const tick = () => {
    const d = take();
    play(done ? "tap" : "done");
    update((x) => { if (d) setVal(x, i, j, parseKg(d.kg), d.reps); tickSet(x, i, j, !done, Date.now()); });
  };

  return (
    <div className={`gr-set ${done ? "is-done" : ""}`}>
      <span className="gr-idx num" aria-hidden>{j + 1}</span>
      <div className="gr-step" role="group" aria-label={m("gymSession.aria.kg", { n: j + 1 })}>
        <button type="button" className="gr-btn" aria-label={m("gymSession.aria.kgDec")} onClick={() => step(-ex.step, 0)}>-</button>
        <input className="gr-kg num" inputMode="decimal" enterKeyHint="done" placeholder={ex.bw ? "BW" : "kg"} value={kg} aria-label={m("gymSession.aria.kgInput")}
          onChange={(e) => change(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6), reps, false)} onBlur={commit} />
        <button type="button" className="gr-btn" aria-label={m("gymSession.aria.kgInc")} onClick={() => step(ex.step, 0)}>+</button>
      </div>
      <div className="gr-step" role="group" aria-label={m("gymSession.aria.reps", { n: j + 1 })}>
        <button type="button" className="gr-btn" aria-label={m("gymSession.aria.repsDec")} onClick={() => step(0, -1)}>-</button>
        <span className="gr-reps num" aria-live="polite">{reps}<span className="gr-unit"> {m("gymSession.unit.reps")}</span></span>
        <button type="button" className="gr-btn" aria-label={m("gymSession.aria.repsInc")} onClick={() => step(0, 1)}>+</button>
      </div>
      <Tap className="gr-check" pressed={done} label={m("gymSession.aria.setDone", { n: j + 1 })} onTap={tick}><IconCheck size={22} /></Tap>
    </div>
  );
}

function ExerciseCard({ i, id, sets, date }: { i: number; id: string; sets: GymSet[]; date: string }) {
  const { s, update } = useStore();
  const [open, setOpen] = useState(false);
  const ex = exById(s, id);
  if (!ex) return null;
  const last = lastSets(s, id, date);
  const h = last ? hint(ex, last, pastSessions(s, id, date).slice(1)) : null;
  const hist = open ? history(s, id) : [];
  return (
    <div className="card gr-ex">
      <button type="button" className="gr-name" aria-expanded={open} onClick={() => { play("tap"); setOpen(!open); }}>
        <span>{gymExName(ex.name)}</span><Chev />
      </button>
      <div className="gr-meta num">{m("gymSession.meta", { sets: ex.sets, lo: ex.lo, hi: ex.hi, rest: msClock(ex.rest) })}</div>
      {last && <div className="gr-meta num">{m("gymSession.last", { sets: last.map((t) => setTxt(t, !!ex.bw)).join(" · ") })}</div>}
      {h && (
        <div className="gr-hint">
          <span>{h.text}</span>
          {h.kg !== undefined && (h.k === "up" || h.k === "down") && (
            <button type="button" className="chip" onClick={() => { play("tap"); update((x) => applyHint(x, i, h.kg!)); }}>{m("gymSession.useKg", { kg: fmtKg(h.kg) })}</button>
          )}
        </div>
      )}
      {open && (
        <div className="gr-hist">
          {hist.length ? (
            <>
              <Sparkline values={[...hist].reverse().map((r) => r.top)} label={m("gymSession.trend")} unit="kg" area="training" />
              {hist.map((r) => (
                <div key={r.d} className="gr-hist-row num"><span>{THAI_DATE(r.d)}</span><span>{r.best}</span><span className="ink-2">1RM ~{fmtKg(r.top)}</span></div>
              ))}
            </>
          ) : <div className="gr-meta">{m("gymSession.noHistory")}</div>}
        </div>
      )}
      {sets.map((t, j) => <SetRow key={j} i={i} j={j} set={t} ex={ex} />)}
      <div className="chips gr-addrow">
        <button type="button" className="chip" disabled={sets.length >= 6} onClick={() => { play("tap"); update((x) => addSet(x, i)); }}>{m("gymSession.addSet")}</button>
        <button type="button" className="chip" disabled={sets.length <= 1} onClick={() => { play("tap"); update((x) => removeSet(x, i)); }}>{m("gymSession.removeSet")}</button>
      </div>
    </div>
  );
}

export function GymSession({ onFinish, onDiscard }: { onFinish: (endAt?: number) => void; onDiscard: () => void }) {
  const { s, update } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const run = s.gym.run;
  if (!run) return null;
  const dl = s.brain.deload;
  const deload = !!dl && dl.from <= run.d && run.d <= dl.to;
  const extras = extrasOf(s).length;
  const inRun = new Set(run.x.map((e) => e.id));
  // Left open (another day or 6 h+): offer to end at the last set tick or drop it.
  const stale = run.d < logicalDate() || now - run.at > 6 * 3600_000;
  const lastSet = run.lt ?? run.at; // tickSet stamps lt; survives a skipped or adjusted rest
  const end = (endAt?: number) => {
    blurActive();
    window.dispatchEvent(new Event(FLUSH));
    setTimeout(() => onFinish(endAt), 0); // after the flushed drafts have rendered
  };
  const more = GYM_CODES.filter((c) => c !== run.c).map((c) => ({ c, ex: (s.gym.plan[c] ?? DEFAULT_PLAN[c]).filter((e) => !inRun.has(e.id)) }));

  return (
    <section className="gym-run" aria-label={m("gymSession.aria.section")}>
      <div className="gr-head">
        <div className="gr-title"><b>{run.c} {GYM_LABEL[run.c]}</b> <span className="num ink-2">· {hmClock(now - run.at)}</span></div>
        <button type="button" className="chip chip--fill" onClick={() => end()}>{m("gymSession.finish")}</button>
      </div>
      {stale && (
        <div className="card gr-stale" role="status">
          <div>{m("gymSession.stale", { date: run.d < logicalDate() ? m("gymSession.staleDate", { date: THAI_DATE(run.d) }) : "" })}</div>
          <div className="chips">
            <button type="button" className="chip chip--fill" onClick={() => end(lastSet)}>{m("gymSession.endAtLast")}</button>
            <button type="button" className="chip" onClick={onDiscard}>{m("gymSession.discard")}</button>
          </div>
        </div>
      )}
      {deload && <div className="card fs-sub ink-2" role="note">{m("gymSession.deload")}</div>}
      {run.x.map((e, i) => <ExerciseCard key={e.id} i={i} id={e.id} sets={e.s} date={run.d} />)}
      {planFor(s, run.c).length === 0 && <div className="card fs-sub ink-2">{m("gymSession.emptyPlan")}</div>}
      <button type="button" className="btn secondary gr-more" disabled={extras >= 2 || run.x.length >= 10} onClick={() => { play("tap"); setAdding(true); }}>
        {m("gymSession.addOnce", { n: extras ? ` · ${extras}/2` : "" })}
      </button>
      <Sheet open={adding} title={m("gymSession.addOnce.title")} detent="medium" onClose={() => setAdding(false)}>
        <div className="sheet-meta">{m("gymSession.addOnce.meta")}</div>
        {more.filter((g) => g.ex.length).map((g) => (
          <div key={g.c} className="gr-pick">
            <div className="section-header">{g.c} {GYM_LABEL[g.c]}</div>
            <div className="group">
              {g.ex.map((e) => (
                <button key={e.id} type="button" className="row" onClick={() => { play("tap"); update((x) => addExercise(x, e.id)); setAdding(false); }}>
                  <span className="row-main row-title">{gymExName(e.name)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </section>
  );
}

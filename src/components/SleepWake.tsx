"use client";

import { useState } from "react";
import { fmt, msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { markSleep } from "@/lib/actions";
import { addDays, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor, type DayLog, type State } from "@/lib/model";
import { buildDay, itemsFor, maxDayShift, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { bkkMin, sleepDebt, sleepHours, wakeTarget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { IconMoon, IconSun } from "./Icons";
import { toast } from "./ui";

const m = msgs(C), c = msgs(Common);
const clock = (t: number) => fmt.clock(t);
const dur = (h: number) => { const n = Math.round(h * 60); return n % 60 ? m("sleepWake.dur.hm", { h: Math.floor(n / 60), m: n % 60 }) : m("sleepWake.dur.h", { h: n / 60 }); };
const sign = (n: number) => m("sleepWake.sign", { sign: n > 0 ? "+" : "", m: n });
// v1.8: a wake tap before 08:00 after last night's bedtime belongs to the next logical day (stats.ts wakeTarget).
export const newDayWake = () => m("sleepWake.toast.newDay");

// Planned wake/sleep for the day (global shift + sleep taper, not today's own shift).
function planned(s: State, d: DayLog, date: string) {
  const items = buildDay(d.type, d.meal2, s.schedule, 0, { date });
  return { wake: items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 13 * 60, sleep: items.find((i) => i.kind === "sleep")?.min ?? 29 * 60 };
}

// Epoch of a logical minute on the logical day `now` belongs to (client runs in the user's zone).
const epochAt = (now: Date, min: number) => new Date(logicalDate(now) + "T00:00:00").getTime() + min * 60_000;

// "I actually woke at..." picker: offsets from the planned wake-up, or any time via the time input.
// Saved only on tap/button: iOS fires onChange while the wheel is still spinning.
export function WakePicker({ planWake, now, onPick }: { planWake: number; now: Date; onPick: (epoch: number) => void }) {
  const [editT, setEditT] = useState<string | null>(null);
  const limit = now.getTime();
  return (
    <>
      <div className="sw-actions">
        {[-60, -30, -15, 0, 15, 30, 60].map((off) => {
          const t = epochAt(now, planWake + off);
          return (
            <button key={off} className="chip" disabled={t > limit} onClick={() => { play("tap"); onPick(t); }}>
              {off === 0 ? m("sleepWake.pick.plan") : sign(off)}
            </button>
          );
        })}
        <button className="chip" onClick={() => { play("tap"); setEditT(editT === null ? hm(planWake) : null); }}>{editT === null ? m("sleepWake.pick.other") : c("cancel")}</button>
      </div>
      {editT !== null && (
        <div className="sw-actions">
          <input className="time-input" type="time" value={editT} onChange={(e) => e.target.value && setEditT(e.target.value)} />
          <button className="chip chip--fill" onClick={() => {
            const [h, m] = editT.split(":").map(Number);
            const t = new Date(now); t.setHours(h, m, 0, 0);
            if (t.getTime() > limit) t.setDate(t.getDate() - 1);
            setEditT(null);
            onPick(t.getTime());
          }}>{c("save")}</button>
        </div>
      )}
    </>
  );
}

// Wake-up / bedtime buttons. Waking early or late can move today's whole schedule.
export function SleepWake({ date, now }: { date: string; now: Date }) {
  const { s, update } = useStore();
  const [offer, setOffer] = useState<{ diff: number; shift: number } | null>(null); // off-plan minutes + shift to apply, pending confirmation
  const [picking, setPicking] = useState(false); // WakePicker open
  const day = dayFor(s, date);
  const plan = planned(s, day, date);
  const nowMin = logicalMinutes(now);
  const slept = sleepHours(s, date);
  const debt = sleepDebt(s, date, 7, 8);
  const shift = day.shiftMin ?? 0;
  const patch = (fn: (d: DayLog) => void) => update((x) => { const d = dayFor(x, date); fn(d); x.days[date] = d; });

  // Next-day wake: only wakeAt is written (no shift offer); undo clears it again.
  function wakeNext(target: string, at: number) {
    const prev = s.days[target]?.wakeAt;
    play("done");
    setPicking(false);
    update((x) => { const d = dayFor(x, target); d.wakeAt = at; x.days[target] = d; });
    toast(newDayWake(), { action: c("undo"), onAction: () => update((x) => { const d = x.days[target]; if (!d) return; if (prev !== undefined) d.wakeAt = prev; else delete d.wakeAt; }) });
  }

  function wake(at: number) {
    const target = wakeTarget(s, date, at);
    if (target !== date) return wakeNext(target, at);
    const atMin = logicalMinutes(new Date(at));
    const diff = Math.round((atMin - plan.wake) / 5) * 5;
    play("done");
    setPicking(false);
    patch((d) => { d.wakeAt = at; });
    // Stream season: the wake time never moves the plan, so go-live stays put.
    if (resolveTemplate(s.schedule, day.type).def.season === "stream") {
      const live = itemsFor(s.schedule, day, date).find((i) => i.id === "stream");
      return toast(m("sleepWake.toast.morningSeason", { time: clock(at), live: live ? m("sleepWake.toast.liveAt", { time: hm(live.min) }) : "" }));
    }
    // Only sensible offsets (15 min - 4 h); anything bigger is a mis-tap or a different day. A later wake-up
    // is offered only as far as buildDay applies it before 07:59 (rounded down to 5 min).
    const shift = diff > 0 ? Math.min(diff, Math.floor(maxDayShift(day.type, day.meal2, s.schedule) / 5) * 5) : diff;
    if (s.settings.askShiftOnWake && Math.abs(diff) <= 240 && Math.abs(shift) >= 15) setOffer({ diff, shift });
    else toast(m("sleepWake.toast.morning", { time: clock(at) }));
  }

  function goSleep() {
    play("complete");
    update((x) => markSleep(x, date, true));
    toast(s.settings.sleepDnd ? m("sleepWake.toast.nightDnd") : m("sleepWake.toast.night"));
  }

  // Shift offer after waking off-plan.
  if (offer !== null) {
    const offerNote = [resolveTemplate(s.schedule, day.type).def.work && m("sleepWake.offer.noWork"), offer.shift !== offer.diff && m("sleepWake.offer.cap")].filter(Boolean).join(" · ");
    return (
      <div key="offer" className="card sw-card swap">
        <div className="sw-icon sw-icon--sun"><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">{m("sleepWake.offer.title", { dir: offer.diff > 0 ? m("sleepWake.offer.late") : m("sleepWake.offer.early"), n: Math.abs(offer.diff) })}</div>
          <div className="sw-sub">{m("sleepWake.offer.ask", { sign: sign(offer.shift), note: offerNote ? ` (${offerNote})` : "" })}</div>
          <div className="sw-actions">
            <button className="chip chip--fill" onClick={() => { play("done"); patch((d) => { d.shiftMin = offer.shift; }); setOffer(null); toast(m("sleepWake.offer.done", { sign: sign(offer.shift) })); }}>{m("sleepWake.offer.shift", { sign: sign(offer.shift) })}</button>
            <button className="chip" onClick={() => { play("tap"); setOffer(null); }}>{m("sleepWake.offer.no")}</button>
          </div>
        </div>
      </div>
    );
  }

  // Not up yet today.
  if (!day.wakeAt) {
    return (
      <div key="wake" className="card sw-card swap">
        <div className="sw-icon sw-icon--sun"><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">{m("sleepWake.wake.title")}</div>
          <div className="sw-sub">{m("sleepWake.wake.sub", { wake: hm(plan.wake), night: s.days[addDays(date, -1)]?.sleepAt ? m("sleepWake.wake.lastBed", { time: clock(s.days[addDays(date, -1)]!.sleepAt!) }) : m("sleepWake.wake.noBed") })}</div>
          {picking && <WakePicker planWake={plan.wake} now={now} onPick={wake} />}
        </div>
        <div className="sw-btns">
          <button className="sw-main" onClick={() => wake(Date.now())}>{m("sleepWake.btn.up")}</button>
          <button className="link sw-link" onClick={() => { play("tap"); setPicking(!picking); }}>{picking ? c("cancel") : m("sleepWake.btn.since")}</button>
        </div>
      </div>
    );
  }

  // Already went to bed (a sleepAt older than the wake-up is a stale list tick, not tonight's bedtime).
  if (day.sleepAt && day.sleepAt > day.wakeAt) {
    const unSleep = () => {
      play("undo");
      const was = day.sleepAt!;
      update((x) => markSleep(x, date, false));
      toast(m("sleepWake.toast.unsleep"), { action: c("undo"), onAction: () => update((x) => markSleep(x, date, true, was)) });
    };
    // v1.8 early wake: after midnight and 1 h past bedtime the wake button is back, for the next logical day.
    const sleptAt = day.sleepAt;
    const tom = addDays(date, 1), tomWake = s.days[tom]?.wakeAt;
    if (nowMin >= 1440 && now.getTime() > sleptAt + 3_600_000) {
      const tomPlan = planned(s, dayFor(s, tom), tom);
      const pick = (at: number) => {
        const target = wakeTarget(s, date, at);
        if (target === date) { play("error"); toast(m("sleepWake.err.afterBed")); return; }
        wakeNext(target, at);
      };
      return (
        <div key="early" className="card sw-card swap">
          <div className="sw-icon sw-icon--sun"><IconSun size={20} /></div>
          <div style={{ flex: 1 }}>
            <div className="sw-title">{tomWake ? m("sleepWake.early.woke", { time: clock(tomWake) }) : m("sleepWake.wake.title")}</div>
            <div className="sw-sub">
              {rich(m("sleepWake.early.sub", { time: clock(sleptAt) }), { rest: tomWake ? m("sleepWake.early.counted") : rich(m("sleepWake.early.plan", { wake: hm(tomPlan.wake) }), { undo: <button className="link fs-sub" onClick={unSleep}>{m("sleepWake.btn.stillUp")}</button> }) })}
            </div>
            {!tomWake && picking && <WakePicker planWake={tomPlan.wake + 1440} now={now} onPick={pick} />}
          </div>
          {tomWake ? (
            <button className="link sw-link" onClick={() => {
              play("undo");
              update((x) => { const d = x.days[tom]; if (d) delete d.wakeAt; });
              toast(m("sleepWake.toast.wakeCleared"), { action: c("undo"), onAction: () => update((x) => { const d = dayFor(x, tom); d.wakeAt = tomWake; x.days[tom] = d; }) });
            }}>{m("sleepWake.btn.editWake")}</button>
          ) : (
            <div className="sw-btns">
              <button className="sw-main" onClick={() => pick(Date.now())}>{m("sleepWake.btn.up")}</button>
              <button className="link sw-link" onClick={() => { play("tap"); setPicking(!picking); }}>{picking ? c("cancel") : m("sleepWake.btn.since")}</button>
            </div>
          )}
        </div>
      );
    }
    // Late bed on a game day: ask once how far past the plan the game went (brain leisure signal, optional).
    const game = itemsFor(s.schedule, day, date).some((i) => i.id === "game" || i.id === "game1");
    const askGame = game && day.gameOver === undefined && bkkMin(day.sleepAt) - (plan.sleep + shift) > 45;
    return (
      <div key="slept" className="card sw-card swap">
        <div className="sw-icon sw-icon--moon"><IconMoon size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">{m("sleepWake.slept.title", { time: clock(day.sleepAt) })}</div>
          <div className="sw-sub">{m("sleepWake.slept.sub", { wake: clock(day.wakeAt), dur: dur((day.sleepAt - day.wakeAt) / 3_600_000) })}</div>
          {askGame && (
            <div className="sw-actions">
              <span className="sw-sub" style={{ alignSelf: "center", marginTop: 0 }}>{m("sleepWake.game.ask")}</span>
              {([[0, m("sleepWake.game.no")], [30, m("sleepWake.game.30")], [60, m("sleepWake.game.60")]] as const).map(([v, label]) => (
                <button key={v} className="chip" onClick={() => { play("tap"); patch((d) => { d.gameOver = v; }); }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <button className="link sw-link" onClick={unSleep}>{m("sleepWake.btn.stillUp")}</button>
      </div>
    );
  }

  // Awake: show the night's sleep, today's shift, and the bedtime button near bedtime.
  const nearBed = nowMin >= plan.sleep + shift - 120;
  return (
    <div key="awake" className="card sw-card swap">
      <div className={`sw-icon ${nearBed ? "sw-icon--moon" : "sw-icon--sun"}`}>{nearBed ? <IconMoon size={20} /> : <IconSun size={20} />}</div>
      <div style={{ flex: 1 }}>
        <div className="sw-title">{m("sleepWake.awake.title", { time: clock(day.wakeAt), slept: slept !== null ? m("sleepWake.awake.slept", { dur: dur(slept) }) : "" })}</div>
        <div className="sw-sub">
          {rich(m("sleepWake.awake.sub", { time: hm(plan.sleep + shift) }), {
            shift: shift ? rich(m("sleepWake.awake.shifted", { sign: sign(shift) }), { reset: <button className="link fs-sub" onClick={() => { play("undo"); patch((d) => { delete d.shiftMin; }); }}>{m("sleepWake.awake.reset")}</button> }) : null,
            debt: debt.nights > 0 && <> · <span className={debt.hours > 3 ? "ink-danger" : undefined}>{m("sleepWake.awake.debt", { h: debt.hours.toFixed(1) })}</span></>,
          })}
        </div>
      </div>
      <div className="sw-btns">
        <button className={`sw-main ${nearBed ? "night" : "ghost"}`} onClick={goSleep}>{m("sleepWake.btn.bed")}</button>
        <button className="link sw-link" onClick={() => {
          play("undo");
          const was = { wakeAt: day.wakeAt, shiftMin: day.shiftMin };
          patch((d) => { delete d.wakeAt; delete d.shiftMin; });
          toast(m("sleepWake.toast.wakeClearedRedo"), { action: c("undo"), onAction: () => patch((d) => { d.wakeAt = was.wakeAt; if (was.shiftMin !== undefined) d.shiftMin = was.shiftMin; }) });
        }}>{m("sleepWake.btn.editWake")}</button>
      </div>
    </div>
  );
}

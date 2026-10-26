"use client";

import { useState } from "react";
import { markSleep } from "@/lib/actions";
import { addDays, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor, type DayLog, type State } from "@/lib/model";
import { buildDay, itemsFor, maxDayShift, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { bkkMin, sleepDebt, sleepHours, wakeTarget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { IconMoon, IconSun } from "./Icons";
import { toast } from "./ui";

const clock = (t: number) => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const dur = (h: number) => { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m / 60} ชม.`; };
const sign = (m: number) => `${m > 0 ? "+" : ""}${m} น.`;
// v1.8: a wake tap before 08:00 after last night's bedtime belongs to the next logical day (stats.ts wakeTarget).
export const NEW_DAY_WAKE = "บันทึกเวลาตื่นของวันใหม่แล้ว · หน้าวันนี้เปลี่ยนเป็นวันใหม่ตอน 08:00";

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
              {off === 0 ? "ตามแผน" : sign(off)}
            </button>
          );
        })}
        <button className="chip" onClick={() => { play("tap"); setEditT(editT === null ? hm(planWake) : null); }}>{editT === null ? "เวลาอื่น" : "ยกเลิก"}</button>
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
          }}>บันทึก</button>
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
    toast(NEW_DAY_WAKE, { action: "เลิกทำ", onAction: () => update((x) => { const d = x.days[target]; if (!d) return; if (prev !== undefined) d.wakeAt = prev; else delete d.wakeAt; }) });
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
      return toast(`อรุณสวัสดิ์ ตื่น ${clock(at)} · ช่วงไลฟ์ไม่เลื่อนตาราง${live ? ` ไลฟ์ ${hm(live.min)}` : ""}`);
    }
    // Only sensible offsets (15 min - 4 h); anything bigger is a mis-tap or a different day. A later wake-up
    // is offered only as far as buildDay applies it before 07:59 (rounded down to 5 min).
    const shift = diff > 0 ? Math.min(diff, Math.floor(maxDayShift(day.type, day.meal2, s.schedule) / 5) * 5) : diff;
    if (s.settings.askShiftOnWake && Math.abs(diff) <= 240 && Math.abs(shift) >= 15) setOffer({ diff, shift });
    else toast(`อรุณสวัสดิ์ ตื่น ${clock(at)}`);
  }

  function goSleep() {
    play("complete");
    update((x) => markSleep(x, date, true));
    toast(s.settings.sleepDnd ? "ฝันดี พักการแจ้งเตือนจนถึงเวลาตื่นแล้ว" : "ฝันดี");
  }

  // Shift offer after waking off-plan.
  if (offer !== null) {
    const offerNote = [resolveTemplate(s.schedule, day.type).def.work && "ไม่รวมเวลางาน", offer.shift !== offer.diff && "เลื่อนได้เท่านี้ก่อน 08:00"].filter(Boolean).join(" · ");
    return (
      <div key="offer" className="card sw-card swap">
        <div className="sw-icon sw-icon--sun"><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">ตื่น{offer.diff > 0 ? "ช้า" : "เร็ว"}กว่าแผน {Math.abs(offer.diff)} นาที</div>
          <div className="sw-sub">เลื่อนตารางวันนี้ทั้งหมด {sign(offer.shift)} ไหม{offerNote ? ` (${offerNote})` : ""}</div>
          <div className="sw-actions">
            <button className="chip chip--fill" onClick={() => { play("done"); patch((d) => { d.shiftMin = offer.shift; }); setOffer(null); toast(`เลื่อนตารางวันนี้ ${sign(offer.shift)} แล้ว`); }}>เลื่อน {sign(offer.shift)}</button>
            <button className="chip" onClick={() => { play("tap"); setOffer(null); }}>ไม่ต้อง</button>
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
          <div className="sw-title">ตื่นแล้วกดเลย</div>
          <div className="sw-sub">แผนตื่น {hm(plan.wake)} · {s.days[addDays(date, -1)]?.sleepAt ? `เข้านอนเมื่อคืน ${clock(s.days[addDays(date, -1)]!.sleepAt!)}` : "ยังไม่มีเวลานอนเมื่อคืน"}</div>
          {picking && <WakePicker planWake={plan.wake} now={now} onPick={wake} />}
        </div>
        <div className="sw-btns">
          <button className="sw-main" onClick={() => wake(Date.now())}>ตื่นแล้ว</button>
          <button className="link sw-link" onClick={() => { play("tap"); setPicking(!picking); }}>{picking ? "ยกเลิก" : "ตื่นตั้งแต่..."}</button>
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
      toast("ยกเลิกเข้านอนแล้ว", { action: "เลิกทำ", onAction: () => update((x) => markSleep(x, date, true, was)) });
    };
    // v1.8 early wake: after midnight and 1 h past bedtime the wake button is back, for the next logical day.
    const sleptAt = day.sleepAt;
    const tom = addDays(date, 1), tomWake = s.days[tom]?.wakeAt;
    if (nowMin >= 1440 && now.getTime() > sleptAt + 3_600_000) {
      const tomPlan = planned(s, dayFor(s, tom), tom);
      const pick = (at: number) => {
        const target = wakeTarget(s, date, at);
        if (target === date) { play("error"); toast("เวลาตื่นต้องหลังเวลาเข้านอนอย่างน้อย 1 ชม."); return; }
        wakeNext(target, at);
      };
      return (
        <div key="early" className="card sw-card swap">
          <div className="sw-icon sw-icon--sun"><IconSun size={20} /></div>
          <div style={{ flex: 1 }}>
            <div className="sw-title">{tomWake ? `ตื่น ${clock(tomWake)} · วันใหม่` : "ตื่นแล้วกดเลย"}</div>
            <div className="sw-sub">
              เข้านอน {clock(sleptAt)} · {tomWake ? "นับเป็นเวลาตื่นของวันใหม่ หน้าวันนี้เปลี่ยนตอน 08:00" : <>แผนตื่นวันใหม่ {hm(tomPlan.wake)} · นับเป็นของวันใหม่ · <button className="link fs-sub" onClick={unSleep}>ยังไม่นอน</button></>}
            </div>
            {!tomWake && picking && <WakePicker planWake={tomPlan.wake + 1440} now={now} onPick={pick} />}
          </div>
          {tomWake ? (
            <button className="link sw-link" onClick={() => {
              play("undo");
              update((x) => { const d = x.days[tom]; if (d) delete d.wakeAt; });
              toast("ล้างเวลาตื่นแล้ว", { action: "เลิกทำ", onAction: () => update((x) => { const d = dayFor(x, tom); d.wakeAt = tomWake; x.days[tom] = d; }) });
            }}>แก้เวลาตื่น</button>
          ) : (
            <div className="sw-btns">
              <button className="sw-main" onClick={() => pick(Date.now())}>ตื่นแล้ว</button>
              <button className="link sw-link" onClick={() => { play("tap"); setPicking(!picking); }}>{picking ? "ยกเลิก" : "ตื่นตั้งแต่..."}</button>
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
          <div className="sw-title">เข้านอน {clock(day.sleepAt)}</div>
          <div className="sw-sub">ตื่น {clock(day.wakeAt)} · ตื่นอยู่ {dur((day.sleepAt - day.wakeAt) / 3_600_000)}</div>
          {askGame && (
            <div className="sw-actions">
              <span className="sw-sub" style={{ alignSelf: "center", marginTop: 0 }}>เล่นเกินแผนไหม:</span>
              {([[0, "ไม่"], [30, "~30 น."], [60, "1 ชม.+"]] as const).map(([v, label]) => (
                <button key={v} className="chip" onClick={() => { play("tap"); patch((d) => { d.gameOver = v; }); }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <button className="link sw-link" onClick={unSleep}>ยังไม่นอน</button>
      </div>
    );
  }

  // Awake: show the night's sleep, today's shift, and the bedtime button near bedtime.
  const nearBed = nowMin >= plan.sleep + shift - 120;
  return (
    <div key="awake" className="card sw-card swap">
      <div className={`sw-icon ${nearBed ? "sw-icon--moon" : "sw-icon--sun"}`}>{nearBed ? <IconMoon size={20} /> : <IconSun size={20} />}</div>
      <div style={{ flex: 1 }}>
        <div className="sw-title">ตื่น {clock(day.wakeAt)}{slept !== null ? ` · นอนไป ${dur(slept)}` : ""}</div>
        <div className="sw-sub">
          {shift ? <>ตารางวันนี้เลื่อน {sign(shift)} · <button className="link fs-sub" onClick={() => { play("undo"); patch((d) => { delete d.shiftMin; }); }}>คืนค่า</button> · </> : null}
          เข้านอนตามแผน {hm(plan.sleep + shift)}
          {debt.nights > 0 && <> · <span className={debt.hours > 3 ? "ink-danger" : undefined}>หนี้นอน 7 คืน {debt.hours.toFixed(1)} ชม.</span></>}
        </div>
      </div>
      <div className="sw-btns">
        <button className={`sw-main ${nearBed ? "night" : "ghost"}`} onClick={goSleep}>เข้านอน</button>
        <button className="link sw-link" onClick={() => {
          play("undo");
          const was = { wakeAt: day.wakeAt, shiftMin: day.shiftMin };
          patch((d) => { delete d.wakeAt; delete d.shiftMin; });
          toast("ล้างเวลาตื่นแล้ว กดตื่นแล้วใหม่ได้", { action: "เลิกทำ", onAction: () => patch((d) => { d.wakeAt = was.wakeAt; if (was.shiftMin !== undefined) d.shiftMin = was.shiftMin; }) });
        }}>แก้เวลาตื่น</button>
      </div>
    </div>
  );
}

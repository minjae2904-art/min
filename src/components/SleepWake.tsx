"use client";

import { useState } from "react";
import { markSleep } from "@/lib/actions";
import { addDays, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor, type DayLog, type State } from "@/lib/model";
import { buildDay, maxDayShift, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { sleepDebt, sleepHours } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { IconMoon, IconSun } from "./Icons";
import { toast } from "./ui";

const clock = (t: number) => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const dur = (h: number) => { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m / 60} ชม.`; };
const sign = (m: number) => `${m > 0 ? "+" : ""}${m} น.`;

// Planned wake/sleep for the day (global shift only, not today's own shift).
function planned(s: State, d: DayLog) {
  const items = buildDay(d.type, d.meal2, s.schedule, 0);
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
            <button key={off} className="chip" disabled={t > limit} style={t > limit ? { opacity: 0.4 } : undefined} onClick={() => { play("tap"); onPick(t); }}>
              {off === 0 ? "ตามแผน" : sign(off)}
            </button>
          );
        })}
        <button className="chip" onClick={() => { play("tap"); setEditT(editT === null ? hm(planWake) : null); }}>{editT === null ? "เวลาอื่น" : "ยกเลิก"}</button>
      </div>
      {editT !== null && (
        <div className="sw-actions">
          <input className="time-input" type="time" value={editT} onChange={(e) => e.target.value && setEditT(e.target.value)} />
          <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => {
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
  const plan = planned(s, day);
  const nowMin = logicalMinutes(now);
  const slept = sleepHours(s, date);
  const debt = sleepDebt(s, date, 7, 8);
  const shift = day.shiftMin ?? 0;
  const patch = (fn: (d: DayLog) => void) => update((x) => { const d = dayFor(x, date); fn(d); x.days[date] = d; });

  function wake(at: number) {
    const atMin = logicalMinutes(new Date(at));
    const diff = Math.round((atMin - plan.wake) / 5) * 5;
    play("done");
    setPicking(false);
    patch((d) => { d.wakeAt = at; });
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
        <div className="sw-icon" style={{ background: "var(--orange)" }}><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">ตื่น{offer.diff > 0 ? "ช้า" : "เร็ว"}กว่าแผน {Math.abs(offer.diff)} นาที</div>
          <div className="sw-sub">เลื่อนตารางวันนี้ทั้งหมด {sign(offer.shift)} ไหม{offerNote ? ` (${offerNote})` : ""}</div>
          <div className="sw-actions">
            <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => { play("done"); patch((d) => { d.shiftMin = offer.shift; }); setOffer(null); toast(`เลื่อนตารางวันนี้ ${sign(offer.shift)} แล้ว`); }}>เลื่อน {sign(offer.shift)}</button>
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
        <div className="sw-icon" style={{ background: "var(--orange)" }}><IconSun size={20} /></div>
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
    return (
      <div key="slept" className="card sw-card swap">
        <div className="sw-icon" style={{ background: "var(--indigo, #5e5ce6)" }}><IconMoon size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">เข้านอน {clock(day.sleepAt)}</div>
          <div className="sw-sub">ตื่น {clock(day.wakeAt)} · ตื่นอยู่ {dur((day.sleepAt - day.wakeAt) / 3_600_000)}</div>
        </div>
        <button className="link sw-link" onClick={() => {
          play("undo");
          const was = day.sleepAt!;
          update((x) => markSleep(x, date, false));
          toast("ยกเลิกเข้านอนแล้ว", { action: "เลิกทำ", onAction: () => update((x) => markSleep(x, date, true, was)) });
        }}>ยังไม่นอน</button>
      </div>
    );
  }

  // Awake: show the night's sleep, today's shift, and the bedtime button near bedtime.
  const nearBed = nowMin >= plan.sleep + shift - 120;
  return (
    <div key="awake" className="card sw-card swap">
      <div className="sw-icon" style={{ background: nearBed ? "var(--indigo, #5e5ce6)" : "var(--orange)" }}>{nearBed ? <IconMoon size={20} /> : <IconSun size={20} />}</div>
      <div style={{ flex: 1 }}>
        <div className="sw-title">ตื่น {clock(day.wakeAt)}{slept !== null ? ` · นอนไป ${dur(slept)}` : ""}</div>
        <div className="sw-sub">
          {shift ? <>ตารางวันนี้เลื่อน {sign(shift)} · <button className="link" style={{ fontSize: 14 }} onClick={() => { play("undo"); patch((d) => { delete d.shiftMin; }); }}>คืนค่า</button> · </> : null}
          เข้านอนตามแผน {hm(plan.sleep + shift)}
          {debt.nights > 0 && <> · <span style={debt.hours > 3 ? { color: "var(--red)" } : undefined}>หนี้นอน 7 คืน {debt.hours.toFixed(1)} ชม.</span></>}
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

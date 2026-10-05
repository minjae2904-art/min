"use client";

import { useState } from "react";
import { addDays, hm, logicalMinutes } from "@/lib/date";
import type { DayLog, State } from "@/lib/model";
import { buildDay } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { sleepHours } from "@/lib/stats";
import { emptyDay, useStore } from "@/lib/store";
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

// Wake-up / bedtime buttons. Waking early or late can move today's whole schedule.
export function SleepWake({ date, now }: { date: string; now: Date }) {
  const { s, update } = useStore();
  const [offer, setOffer] = useState<number | null>(null); // minutes to shift, pending confirmation
  const [editT, setEditT] = useState<string | null>(null); // "HH:MM" while picking an earlier wake time
  const day = s.days[date] ?? emptyDay();
  const plan = planned(s, day);
  const nowMin = logicalMinutes(now);
  const slept = sleepHours(s, date);
  const shift = day.shiftMin ?? 0;
  const patch = (fn: (d: DayLog) => void) => update((x) => { const d = x.days[date] ?? emptyDay(); fn(d); x.days[date] = d; });

  function wake(at: number) {
    const atMin = logicalMinutes(new Date(at));
    const diff = Math.round((atMin - plan.wake) / 5) * 5;
    play("done");
    patch((d) => { d.wakeAt = at; });
    // Only sensible offsets (15 min - 4 h); anything bigger is a mis-tap or a different day.
    if (s.settings.askShiftOnWake && Math.abs(diff) >= 15 && Math.abs(diff) <= 240) setOffer(diff);
    else toast(`อรุณสวัสดิ์ ตื่น ${clock(at)}`);
  }

  function goSleep() {
    const t = Date.now();
    play("complete");
    update((x) => {
      const d = x.days[date] ?? emptyDay();
      d.sleepAt = t;
      d.done.sleep = t;
      x.days[date] = d;
      // Pause reminders until tomorrow's planned wake-up (plus today's shift habit is not carried over).
      if (x.settings.sleepDnd) {
        const minsToWake = plan.wake + 1440 - logicalMinutes(new Date(t));
        x.settings.dndUntil = t + Math.max(4 * 60, Math.min(14 * 60, minsToWake)) * 60_000;
      }
    });
    toast(s.settings.sleepDnd ? "ฝันดี พักการแจ้งเตือนจนถึงเวลาตื่นแล้ว" : "ฝันดี");
  }

  // Shift offer after waking off-plan.
  if (offer !== null) {
    return (
      <div className="card sw-card">
        <div className="sw-icon" style={{ background: "var(--orange)" }}><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">ตื่น{offer > 0 ? "ช้า" : "เร็ว"}กว่าแผน {Math.abs(offer)} นาที</div>
          <div className="sw-sub">เลื่อนตารางวันนี้ทั้งหมด {sign(offer)} ไหม (ไม่รวมเวลางาน)</div>
          <div className="sw-actions">
            <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => { play("done"); patch((d) => { d.shiftMin = offer; }); setOffer(null); toast(`เลื่อนตารางวันนี้ ${sign(offer)} แล้ว`); }}>เลื่อน {sign(offer)}</button>
            <button className="chip" onClick={() => { play("tap"); setOffer(null); }}>ไม่ต้อง</button>
          </div>
        </div>
      </div>
    );
  }

  // Not up yet today.
  if (!day.wakeAt) {
    return (
      <div className="card sw-card">
        <div className="sw-icon" style={{ background: "var(--orange)" }}><IconSun size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">ตื่นแล้วกดเลย</div>
          <div className="sw-sub">แผนตื่น {hm(plan.wake)} · {s.days[addDays(date, -1)]?.sleepAt ? `เข้านอนเมื่อคืน ${clock(s.days[addDays(date, -1)]!.sleepAt!)}` : "ยังไม่มีเวลานอนเมื่อคืน"}</div>
          {/* Saved only on the button: iOS fires onChange while the wheel is still spinning. */}
          {editT !== null && (
            <div className="sw-actions">
              <input className="time-input" type="time" value={editT} onChange={(e) => e.target.value && setEditT(e.target.value)} />
              <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => {
                const [h, m] = editT.split(":").map(Number);
                const t = new Date(now); t.setHours(h, m, 0, 0);
                if (t.getTime() > Date.now()) t.setDate(t.getDate() - 1);
                setEditT(null);
                wake(t.getTime());
              }}>บันทึก</button>
            </div>
          )}
        </div>
        <div className="sw-btns">
          <button className="sw-main" onClick={() => wake(Date.now())}>ตื่นแล้ว</button>
          <button className="link sw-link" onClick={() => { play("tap"); setEditT(editT === null ? hm(plan.wake) : null); }}>{editT !== null ? "ยกเลิก" : "ตื่นตั้งแต่..."}</button>
        </div>
      </div>
    );
  }

  // Already went to bed.
  if (day.sleepAt) {
    return (
      <div className="card sw-card">
        <div className="sw-icon" style={{ background: "var(--indigo, #5e5ce6)" }}><IconMoon size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="sw-title">เข้านอน {clock(day.sleepAt)}</div>
          <div className="sw-sub">ตื่น {clock(day.wakeAt)} · ตื่นอยู่ {dur((day.sleepAt - day.wakeAt) / 3_600_000)}</div>
        </div>
        <button className="link sw-link" onClick={() => { play("undo"); update((x) => { const d = x.days[date]!; delete d.sleepAt; delete d.done.sleep; x.settings.dndUntil = 0; }); }}>ยังไม่นอน</button>
      </div>
    );
  }

  // Awake: show the night's sleep, today's shift, and the bedtime button near bedtime.
  const nearBed = nowMin >= plan.sleep + shift - 120;
  return (
    <div className="card sw-card">
      <div className="sw-icon" style={{ background: nearBed ? "var(--indigo, #5e5ce6)" : "var(--orange)" }}>{nearBed ? <IconMoon size={20} /> : <IconSun size={20} />}</div>
      <div style={{ flex: 1 }}>
        <div className="sw-title">ตื่น {clock(day.wakeAt)}{slept !== null ? ` · นอนไป ${dur(slept)}` : ""}</div>
        <div className="sw-sub">
          {shift ? <>ตารางวันนี้เลื่อน {sign(shift)} · <button className="link" style={{ fontSize: 14 }} onClick={() => { play("undo"); patch((d) => { delete d.shiftMin; }); }}>คืนค่า</button> · </> : null}
          เข้านอนตามแผน {hm(plan.sleep + shift)}
        </div>
      </div>
      <div className="sw-btns">
        <button className={`sw-main ${nearBed ? "night" : "ghost"}`} onClick={goSleep}>เข้านอน</button>
        <button className="link sw-link" onClick={() => { play("undo"); patch((d) => { delete d.wakeAt; delete d.shiftMin; }); }}>แก้เวลาตื่น</button>
      </div>
    </div>
  );
}

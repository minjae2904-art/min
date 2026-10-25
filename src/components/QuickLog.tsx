"use client";

import { useState } from "react";
import { setDone, setTickTime, setWeight } from "@/lib/actions";
import { hm, logicalMinutes } from "@/lib/date";
import { dayFor, hasCheckin, type TradeLog, type TradeResult } from "@/lib/model";
import { currentPhase } from "@/lib/phase";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, buildDay, itemsFor, maxDayShift, resolveTemplate, type Item, type Meal2 } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { waterGoal, weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { isLateNow } from "@/lib/ticks";
import { quickScope } from "@/lib/today";
import { CHECKIN_ROWS } from "./CheckIn";
import { queueLateTick } from "./TickTime";
import { WakePicker } from "./SleepWake";
import { IconChevron } from "./Icons";
import { Segmented, motionOff, toast } from "./ui";

type Step = { kind: "wake" } | { kind: "checkin" } | { kind: "weigh" } | { kind: "item"; item: Item } | { kind: "water" } | { kind: "summary" };

const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถือ"]];

// One button -> walk through everything left today, one card at a time. Every step can be skipped.
type Scope = "phase" | "due" | "all";
const SCOPES: [Scope, string][] = [["phase", "ช่วงนี้"], ["due", "ถึงเวลา"], ["all", "ทั้งวัน"]];

export function QuickLog({ date, onClose, onComplete, scope: scope0 = "phase" }: { date: string; onClose: () => void; onComplete: () => void; scope?: Scope }) {
  const { s, update } = useStore();
  const [scope, setScope] = useState<Scope>(scope0);
  const day = dayFor(s, date);

  // Steps are fixed when the wizard opens (and when scope changes) so ticking doesn't reshuffle them.
  const [steps, setSteps] = useState<Step[]>(() => build(scope0));
  const [i, setI] = useState(0);
  const [kg, setKg] = useState("");
  const [feel, setFeel] = useState<{ sleep?: number; energy?: number; mood?: number }>({});
  const [trade, setTrade] = useState<TradeLog>({ count: 1, result: "open" });
  const [jr, setJr] = useState({ good: "", fix: "", thanks: "" });
  const [gym, setGym] = useState<string | null>(null);
  const [stats, setStats] = useState({ done: 0, skipped: 0 });
  const [applyShift, setApplyShift] = useState(s.settings.askShiftOnWake);
  const [dir, setDir] = useState<0 | 1 | -1>(0); // 0 = first card (wizard slide-up only)
  const [closing, setClosing] = useState(false);

  // Slides down before unmounting; timer only (motion-off kills the animation, animationend would never fire).
  function close() { if (closing) return; setClosing(true); setTimeout(onClose, motionOff() ? 0 : 260); }

  function build(sc: Scope): Step[] {
    const d = dayFor(s, date);
    const nowMin = logicalMinutes();
    const { phase } = currentPhase(s, d, nowMin, date); // same logical-minute coordinates as item.min
    const items = quickScope(itemsFor(s.schedule, d, date).filter((x) => x.ring && !d.done[x.id] && x.kind !== "weigh"), sc, { phaseKey: phase.key, phaseEnd: phase.end, nowMin });
    const list: Step[] = [];
    if (!d.wakeAt) list.push({ kind: "wake" });
    if (!hasCheckin(d)) list.push({ kind: "checkin" }); // a skipped check-in (mood 0) can still be filled in here
    if (!d.done.weigh) list.push({ kind: "weigh" });
    for (const item of items) list.push({ kind: "item", item });
    list.push({ kind: "water" }, { kind: "summary" });
    return list;
  }

  const step = steps[i];
  const total = steps.length - 1; // summary isn't a question
  const patchDay = (fn: (d: typeof day) => void) => update((x) => { const d = dayFor(x, date); fn(d); x.days[date] = d; });

  function next(didSomething: boolean) {
    setStats((st) => (didSomething ? { ...st, done: st.done + 1 } : { ...st, skipped: st.skipped + 1 }));
    if (!didSomething) play("tap");
    setKg(""); setGym(null);
    setDir(1);
    setI((n) => Math.min(n + 1, steps.length - 1));
  }

  function tick(item: Item, extra?: (d: typeof day) => void, gymCode?: string) {
    play("done");
    update((x) => {
      setDone(x, date, item, true, gymCode);
      if (extra) { const d = x.days[date]!; extra(d); }
    });
    // Late tick: one ask for the whole burst, shown after the wizard closes (TickTime re-arms while .wizard exists).
    if (isLateNow(date, item))
      queueLateTick({ date, item, apply: (ts, src) => update((x) => setTickTime(x, date, item.id, ts, src)) });
    next(true);
  }

  const kgNow = weightStats(s, date).cur;
  const goal = waterGoal(s, day, kgNow);

  function body() {
    if (!step) return null;
    switch (step.kind) {
      case "wake": {
        const plan = buildDay(day.type, day.meal2, s.schedule, 0, { date }).find((x) => x.id === "weigh")?.min ?? 13 * 60;
        const season = resolveTemplate(s.schedule, day.type).def.season === "stream"; // stream season: wake never shifts the day
        return (
          <>
            <div className="wz-title">ตื่นกี่โมง</div>
            <div className="wz-sub">แผนตื่น {hm(plan)}{season ? " · ช่วงไลฟ์ไม่เลื่อนตาราง" : ""}</div>
            {!season && (
              <label className="row" style={{ padding: "8px 0" }}>
                <span className="row-main row-title fs-sub">เลื่อนตารางวันนี้ตามเวลาตื่น (15 นาที - 4 ชม.)</span>
                <input type="checkbox" checked={applyShift} onChange={(e) => setApplyShift(e.target.checked)} style={{ width: 22, height: 22 }} />
              </label>
            )}
            <WakePicker planWake={plan} now={new Date()} onPick={(at) => {
              const diff = Math.round((logicalMinutes(new Date(at)) - plan) / 5) * 5;
              // Same rule as the SleepWake offer: a later wake-up shifts only as far as buildDay applies it.
              const shift = diff > 0 ? Math.min(diff, Math.floor(maxDayShift(day.type, day.meal2, s.schedule) / 5) * 5) : diff;
              play("done");
              patchDay((d) => { d.wakeAt = at; if (!season && Math.abs(diff) <= 240 && Math.abs(shift) >= 15 && applyShift) d.shiftMin = shift; });
              next(true);
            }} />
          </>
        );
      }
      case "checkin": {
        const ready = feel.sleep && feel.energy && feel.mood;
        return (
          <>
            <div className="wz-title">เช้านี้รู้สึกอย่างไร</div>
            <div className="wz-sub">ไม่แน่ใจข้อไหน กด &apos;ข้ามไปก่อน&apos; ได้ ดีกว่าเดา</div>
            {CHECKIN_ROWS.map((r) => (
              <div key={r.key} className="scale">
                <div className="scale-label">{r.label} <span className="scale-when">{r.when}</span></div>
                <div className="scale-dots">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={`scale-dot ${feel[r.key] === n ? "on" : ""}`} style={{ ["--lv" as string]: n }} aria-label={`${r.label} ${n}`} aria-pressed={feel[r.key] === n} onClick={() => { play("tap"); setFeel((f) => ({ ...f, [r.key]: n })); }}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn" disabled={!ready} style={{ marginTop: 14 }} onClick={() => { play("done"); patchDay((d) => { d.checkin = { ...(feel as { sleep: number; energy: number; mood: number }), at: Date.now() }; }); next(true); }}>บันทึก</button>
          </>
        );
      }
      case "weigh":
        return (
          <>
            <div className="wz-title">น้ำหนักเช้านี้</div>
            <div className="wz-sub">ก่อนกิน หลังเข้าห้องน้ำ · แนวโน้มตอนนี้ {kgNow.toFixed(1)} kg</div>
            <input className="field num fs-large" inputMode="decimal" placeholder={kgNow.toFixed(1)} value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ textAlign: "center", margin: "14px 0" }}
              onKeyDown={(e) => { if (e.key === "Enter") (document.getElementById("wz-weigh") as HTMLButtonElement | null)?.click(); }} />
            <button id="wz-weigh" className="btn" onClick={() => {
              const v = parseFloat(kg);
              if (!(v > 30 && v < 250)) { play("error"); return toast("ใส่น้ำหนักเป็นตัวเลข เช่น 67.4"); }
              play("done");
              update((x) => setWeight(x, date, v, date));
              next(true);
            }}>บันทึก</button>
          </>
        );
      case "item": {
        const it = step.item;
        const head = (
          <>
            <div className="wz-time num">{hm(it.min)}</div>
            <div className="wz-title">{it.title}</div>
            {(it.cue || it.sub) && <div className="wz-sub">{[it.cue, it.sub].filter(Boolean).join(" · ")}</div>}
          </>
        );
        if (it.id === "meal2" && resolveTemplate(s.schedule, day.type).def.work) {
          return (
            <>
              {head}
              <div className="wz-choices">
                {(Object.keys(MEAL2_LABEL) as Meal2[]).map((k) => (
                  <button key={k} className="wz-choice" onClick={() => {
                    if (k !== "C") tick(it, (d) => { d.meal2 = k; });
                    else { play("done"); patchDay((d) => { d.meal2 = k; }); next(true); }
                  }}>{k}. {MEAL2_LABEL[k]}</button>
                ))}
              </div>
            </>
          );
        }
        if (it.kind === "gym") {
          const cardio = it.id === "cardio";
          const dflt = cardio ? "R" : nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
          const opts: [string, string][] = cardio ? [["R", "พัก"], ["R-tennis", "เทนนิส"], ["R-cardio", "คาร์ดิโอ"]] : GYM_CYCLE.filter((c) => c !== "R").map((c) => [c, c]);
          const pick = gym ?? dflt;
          return (
            <>
              {head}
              {!cardio && <div className="wz-sub">ครั้งนี้: {pick} {GYM_LABEL[pick]}</div>}
              <div style={{ margin: "14px 0" }}><Segmented value={pick} options={opts} onChange={setGym} /></div>
              <button className="btn" onClick={() => tick(it, undefined, pick)}>เล่นแล้ว</button>
            </>
          );
        }
        if (it.kind === "trade") {
          return (
            <>
              {head}
              <div className="wz-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`chip ${trade.count === n ? "on" : ""}`} aria-pressed={trade.count === n} onClick={() => { play("tap"); setTrade((t) => ({ ...t, count: n })); }}>{n === 5 ? "5+" : n} ไม้</button>
                ))}
              </div>
              <Segmented value={trade.result === "skip" ? "open" : trade.result} options={TRADE_RESULT} onChange={(v) => setTrade({ ...trade, result: v })} />
              <input className="field field--fill wz-note" placeholder="โน้ต (ไม่บังคับ)" value={trade.note ?? ""} onChange={(e) => setTrade({ ...trade, note: e.target.value })} />
              <button className="btn" onClick={() => tick(it, (d) => { d.trade = { ...trade, note: trade.note?.trim() || undefined }; })}>บันทึกว่าเทรดแล้ว</button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => tick(it, (d) => { d.trade = { count: 0, result: "skip" }; })}>ไม่มีจังหวะ ไม่เข้า</button>
            </>
          );
        }
        if (it.kind === "sing") {
          return (
            <>
              {head}
              <button className="btn wz-big" onClick={() => tick(it)}>ร้องแล้ว</button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => { play("toggle"); patchDay((d) => { d.voiceRest = true; }); next(true); }}>พักเสียงวันนี้</button>
            </>
          );
        }
        if (it.id === "night") {
          return (
            <>
              {head}
              <textarea className="journal-field" placeholder="วันนี้ทำอะไรได้ดี" value={jr.good} onChange={(e) => setJr({ ...jr, good: e.target.value })} />
              <textarea className="journal-field" placeholder="พรุ่งนี้อยากแก้อะไร" value={jr.fix} onChange={(e) => setJr({ ...jr, fix: e.target.value })} />
              <textarea className="journal-field" placeholder="ขอบคุณอะไร" value={jr.thanks} onChange={(e) => setJr({ ...jr, thanks: e.target.value })} />
              <button className="btn" onClick={() => tick(it, (d) => { if (jr.good || jr.fix || jr.thanks) d.journal = jr; })}>เสร็จแล้ว</button>
            </>
          );
        }
        return (
          <>
            {head}
            <button className="btn wz-big" onClick={() => tick(it)}>ทำแล้ว</button>
          </>
        );
      }
      case "water": {
        const cur = s.days[date]?.waterMl ?? 0;
        return (
          <>
            <div className="wz-title">น้ำดื่มวันนี้</div>
            <div className="wz-sub">ตอนนี้ {(cur / 1000).toFixed(2)} / {(goal / 1000).toFixed(1)} ลิตร</div>
            <div className="wz-row" style={{ marginTop: 14 }}>
              {[250, 350, 500, 1000].map((ml) => (
                <button key={ml} className="chip" onClick={() => { play("water"); patchDay((d) => { d.waterMl += ml; }); }}>+{ml}</button>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => next(true)}>ถัดไป</button>
          </>
        );
      }
      case "summary": {
        const d = dayFor(s, date);
        const all = itemsFor(s.schedule, d, date).filter((x) => x.ring);
        const done = all.filter((x) => d.done[x.id]).length;
        const left = all.filter((x) => !d.done[x.id]);
        return (
          <>
            <div className="wz-title">เรียบร้อย</div>
            <div className="wz-sub">บันทึก {stats.done} ข้าม {stats.skipped} · วันนี้ครบ {done}/{all.length} ({Math.round((done / Math.max(1, all.length)) * 100)}%)</div>
            {left.length > 0 && <div className="wz-left">ยังเหลือ: {left.slice(0, 5).map((x) => `${hm(x.min)} ${x.title}`).join(" · ")}</div>}
            <button className="btn" style={{ marginTop: 18 }} onClick={() => { if (done === all.length) onComplete(); play(done === all.length ? "complete" : "done"); close(); }}>ปิด</button>
          </>
        );
      }
    }
  }

  return (
    <div className={`wizard ${closing ? "out" : ""}`} role="dialog" aria-label="บันทึกแบบเร็ว">
      <div className="wz-head">
        <button className="link" onClick={() => { play("close"); close(); }}>ปิด</button>
        <div className="wz-count num">{step?.kind === "summary" ? "สรุป" : `${i + 1} / ${total}`}</div>
        <button className="link" disabled={i === 0} onClick={() => { play("tap"); setDir(-1); setI((n) => Math.max(0, n - 1)); }}>ย้อน</button>
      </div>
      <div className="wz-bar"><span className="fill-x" style={{ ["--p" as string]: Math.min(i, total) / Math.max(1, total) }} /></div>
      {i === 0 && (
        <div style={{ marginBottom: 6 }}>
          <Segmented label="ขอบเขต" value={scope} options={SCOPES} onChange={(v) => { setScope(v); setSteps(build(v)); }} />
        </div>
      )}
      <div className={`wz-card ${dir > 0 ? "fwd" : dir < 0 ? "back" : ""}`} key={i}>{body()}</div>
      {step && step.kind !== "summary" && (
        <button className="wz-skip" onClick={() => next(false)}>ข้ามไปก่อน <IconChevron size={14} weight={2.4} /></button>
      )}
    </div>
  );
}

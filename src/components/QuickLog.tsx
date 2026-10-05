"use client";

import { useState } from "react";
import { setDone } from "@/lib/actions";
import { hm, logicalMinutes } from "@/lib/date";
import type { TradeLog, TradeResult } from "@/lib/model";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, buildDay, type Item, type Meal2 } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { waterGoal, weightStats } from "@/lib/stats";
import { emptyDay, useStore } from "@/lib/store";
import { Segmented, toast } from "./ui";

type Step = { kind: "wake" } | { kind: "checkin" } | { kind: "weigh" } | { kind: "item"; item: Item } | { kind: "water" } | { kind: "summary" };

const SCALE = [
  { key: "sleep", label: "การนอน" },
  { key: "energy", label: "พลังงาน" },
  { key: "mood", label: "อารมณ์" },
] as const;
const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถือ"]];

// One button -> walk through everything left today, one card at a time. Every step can be skipped.
export function QuickLog({ date, onClose, onComplete }: { date: string; onClose: () => void; onComplete: () => void }) {
  const { s, update } = useStore();
  const [scope, setScope] = useState<"due" | "all">("due");
  const day = s.days[date] ?? emptyDay();

  // Steps are fixed when the wizard opens (and when scope changes) so ticking doesn't reshuffle them.
  const [steps, setSteps] = useState<Step[]>(() => build("due"));
  const [i, setI] = useState(0);
  const [kg, setKg] = useState("");
  const [feel, setFeel] = useState<{ sleep?: number; energy?: number; mood?: number }>({});
  const [trade, setTrade] = useState<TradeLog>({ count: 1, result: "open" });
  const [jr, setJr] = useState({ good: "", fix: "", thanks: "" });
  const [gym, setGym] = useState<string | null>(null);
  const [stats, setStats] = useState({ done: 0, skipped: 0 });
  const [wakeT, setWakeT] = useState(() => { const n = new Date(); return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`; });
  const [applyShift, setApplyShift] = useState(true);

  function build(sc: "due" | "all"): Step[] {
    const d = s.days[date] ?? emptyDay();
    const nowMin = logicalMinutes();
    const items = buildDay(d.type, d.meal2, s.schedule, d.shiftMin ?? 0).filter((x) => x.ring && !d.done[x.id] && x.kind !== "weigh");
    const list: Step[] = [];
    if (!d.wakeAt) list.push({ kind: "wake" });
    if (!d.checkin) list.push({ kind: "checkin" });
    if (!d.done.weigh) list.push({ kind: "weigh" });
    for (const item of items) if (sc === "all" || item.min <= nowMin + 30) list.push({ kind: "item", item });
    list.push({ kind: "water" }, { kind: "summary" });
    return list;
  }

  const step = steps[i];
  const total = steps.length - 1; // summary isn't a question
  const patchDay = (fn: (d: typeof day) => void) => update((x) => { const d = x.days[date] ?? emptyDay(); fn(d); x.days[date] = d; });

  function next(didSomething: boolean) {
    setStats((st) => (didSomething ? { ...st, done: st.done + 1 } : { ...st, skipped: st.skipped + 1 }));
    if (!didSomething) play("tap");
    setKg(""); setGym(null);
    setI((n) => Math.min(n + 1, steps.length - 1));
  }

  function tick(item: Item, extra?: (d: typeof day) => void, gymCode?: string) {
    play("done");
    update((x) => {
      setDone(x, date, item, true, gymCode);
      if (extra) { const d = x.days[date]!; extra(d); }
    });
    next(true);
  }

  const kgNow = weightStats(s, date).cur;
  const goal = waterGoal(s, day, kgNow);

  function body() {
    if (!step) return null;
    switch (step.kind) {
      case "wake": {
        const plan = buildDay(day.type, day.meal2, s.schedule, 0).find((x) => x.id === "weigh")?.min ?? 13 * 60;
        const [h, m] = wakeT.split(":").map(Number);
        const wakeMin = (h < 8 ? h + 24 : h) * 60 + m;
        const diff = Math.round((wakeMin - plan) / 5) * 5;
        return (
          <>
            <div className="wz-title">ตื่นกี่โมง</div>
            <div className="wz-sub">แผนตื่น {hm(plan)}</div>
            <input className="time-input" type="time" value={wakeT} onChange={(e) => e.target.value && setWakeT(e.target.value)} style={{ fontSize: 30, padding: "10px 16px", margin: "14px 0", display: "block" }} />
            {Math.abs(diff) >= 15 && Math.abs(diff) <= 240 && (
              <label className="row" style={{ padding: "8px 0" }}>
                <span className="row-main row-title" style={{ fontSize: 15 }}>เลื่อนตารางวันนี้ {diff > 0 ? "+" : ""}{diff} นาที</span>
                <input type="checkbox" checked={applyShift} onChange={(e) => setApplyShift(e.target.checked)} style={{ width: 22, height: 22 }} />
              </label>
            )}
            <button className="btn" onClick={() => {
              const t = new Date(); t.setHours(h, m, 0, 0);
              if (t.getTime() > Date.now() + 60_000) t.setDate(t.getDate() - 1);
              play("done");
              patchDay((d) => { d.wakeAt = t.getTime(); if (Math.abs(diff) >= 15 && Math.abs(diff) <= 240 && applyShift) d.shiftMin = diff; });
              next(true);
            }}>บันทึก</button>
          </>
        );
      }
      case "checkin": {
        const ready = feel.sleep && feel.energy && feel.mood;
        return (
          <>
            <div className="wz-title">เช้านี้รู้สึกอย่างไร</div>
            {SCALE.map((r) => (
              <div key={r.key} className="scale">
                <div className="scale-label">{r.label}</div>
                <div className="scale-dots">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={`scale-dot ${feel[r.key] === n ? "on" : ""}`} style={{ ["--lv" as string]: n }} onClick={() => { play("tap"); setFeel((f) => ({ ...f, [r.key]: n })); }}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn" disabled={!ready} style={{ opacity: ready ? 1 : 0.4, marginTop: 14 }} onClick={() => { play("done"); patchDay((d) => { d.checkin = feel as { sleep: number; energy: number; mood: number }; }); next(true); }}>บันทึก</button>
          </>
        );
      }
      case "weigh":
        return (
          <>
            <div className="wz-title">น้ำหนักเช้านี้</div>
            <div className="wz-sub">ก่อนกิน หลังเข้าห้องน้ำ · แนวโน้มตอนนี้ {kgNow.toFixed(1)} kg</div>
            <input className="field num" inputMode="decimal" placeholder={kgNow.toFixed(1)} value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ fontSize: 34, textAlign: "center", margin: "14px 0" }}
              onKeyDown={(e) => { if (e.key === "Enter") (document.getElementById("wz-weigh") as HTMLButtonElement | null)?.click(); }} />
            <button id="wz-weigh" className="btn" onClick={() => {
              const v = parseFloat(kg);
              if (!(v > 30 && v < 250)) { play("error"); return toast("ใส่น้ำหนักเป็นตัวเลข เช่น 67.4"); }
              play("done");
              update((x) => {
                x.weights = x.weights.filter((w) => w.date !== date).concat({ date, kg: v });
                const d = x.days[date] ?? emptyDay(); d.done.weigh = Date.now(); x.days[date] = d;
              });
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
        if (it.id === "meal2" && day.type === "work") {
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
          const def = day.type === "off" ? "R" : nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
          const opts: [string, string][] = day.type === "off" ? [["R", "พัก"], ["R-tennis", "เทนนิส"], ["R-cardio", "คาร์ดิโอ"]] : GYM_CYCLE.filter((c) => c !== "R").map((c) => [c, c]);
          const pick = gym ?? def;
          return (
            <>
              {head}
              {day.type === "work" && <div className="wz-sub">ครั้งนี้: {pick} {GYM_LABEL[pick]}</div>}
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
                  <button key={n} className="chip" style={trade.count === n ? { background: "var(--blue)", color: "#fff" } : undefined} onClick={() => { play("tap"); setTrade((t) => ({ ...t, count: n })); }}>{n === 5 ? "5+" : n} ไม้</button>
                ))}
              </div>
              <Segmented value={trade.result === "skip" ? "open" : trade.result} options={TRADE_RESULT} onChange={(v) => setTrade({ ...trade, result: v })} />
              <input className="field" placeholder="โน้ต (ไม่บังคับ)" value={trade.note ?? ""} onChange={(e) => setTrade({ ...trade, note: e.target.value })} style={{ background: "var(--fill)", marginBottom: 12 }} />
              <button className="btn" onClick={() => tick(it, (d) => { d.trade = { ...trade, note: trade.note?.trim() || undefined }; })}>บันทึกว่าเทรดแล้ว</button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => tick(it, (d) => { d.trade = { count: 0, result: "skip" }; })}>ไม่มีจังหวะ ไม่เข้า</button>
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
        const d = s.days[date] ?? emptyDay();
        const all = buildDay(d.type, d.meal2, s.schedule, d.shiftMin ?? 0).filter((x) => x.ring);
        const done = all.filter((x) => d.done[x.id]).length;
        const left = all.filter((x) => !d.done[x.id]);
        return (
          <>
            <div className="wz-title">เรียบร้อย</div>
            <div className="wz-sub">บันทึก {stats.done} ข้าม {stats.skipped} · วันนี้ครบ {done}/{all.length} ({Math.round((done / Math.max(1, all.length)) * 100)}%)</div>
            {left.length > 0 && <div className="wz-left">ยังเหลือ: {left.slice(0, 5).map((x) => `${hm(x.min)} ${x.title}`).join(" · ")}</div>}
            <button className="btn" style={{ marginTop: 18 }} onClick={() => { if (done === all.length) onComplete(); play(done === all.length ? "complete" : "done"); onClose(); }}>ปิด</button>
          </>
        );
      }
    }
  }

  return (
    <div className="wizard" role="dialog" aria-label="บันทึกแบบเร็ว">
      <div className="wz-head">
        <button className="link" onClick={() => { play("close"); onClose(); }}>ปิด</button>
        <div className="wz-count num">{step?.kind === "summary" ? "สรุป" : `${i + 1} / ${total}`}</div>
        <button className="link" disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} onClick={() => { play("tap"); setI((n) => Math.max(0, n - 1)); }}>ย้อน</button>
      </div>
      <div className="wz-bar"><span style={{ width: `${(Math.min(i, total) / Math.max(1, total)) * 100}%` }} /></div>
      {i === 0 && (
        <div style={{ marginBottom: 6 }}>
          <Segmented value={scope} options={[["due", "เฉพาะที่ถึงเวลาแล้ว"], ["all", "ทั้งวัน"]]} onChange={(v) => { setScope(v); setSteps(build(v)); }} />
        </div>
      )}
      <div className="wz-card" key={i}>{body()}</div>
      {step && step.kind !== "summary" && (
        <button className="wz-skip" onClick={() => next(false)}>ข้ามไปก่อน ›</button>
      )}
    </div>
  );
}

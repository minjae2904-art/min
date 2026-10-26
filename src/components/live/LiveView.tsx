"use client";

// Live mode (v1.7 G3): a full-screen OLED-black overlay above the nav (z 30) and below sheets (40/41). Pre-live checklist,
// then a huge h:mm timer, silent amber cues, +250 ml / break / clip marks and the end flow. No sound, no haptics,
// no per-second state writes: the clock re-renders on minute boundaries while visible only.
import { useEffect, useState } from "react";
import { IconCheck } from "@/components/Icons";
import { Tap, toast } from "@/components/ui";
import { useWakeLock } from "@/components/useWakeLock";
import { addWater } from "@/lib/actions";
import { PRELIVE } from "@/lib/care/presets";
import { careIds, tickStep } from "@/lib/care/progress";
import { logicalDate } from "@/lib/date";
import { dayFor, type DayLog, type Run, type RunKind, type State } from "@/lib/model";
import { CUE_TEXT, PRESET, addBreak, canBreak, ackCue, elapsedMs, endRun, hmClock, markClip, nextCue, plannedEndMs, runLabel, startRun, staleRun } from "@/lib/session";
import { useStore } from "@/lib/store";

const MIN = 60_000;
const clockNow = () => Date.now(); // event handlers only
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ""}` : `${m} น.`);
const clockOf = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// Exact undo of a run change: the run and the touched fields of its day (absence included).
type Snap = { run: Run | null; runEnd?: number; date: string; had: boolean; day?: Pick<DayLog, "live" | "sing" | "breaks"> };
function snap(s: State, date: string): Snap {
  const d = s.days[date];
  return structuredClone({ run: s.run, runEnd: s.runEnd, date, had: !!d, day: d ? { live: d.live, sing: d.sing, breaks: d.breaks } : undefined });
}
function restore(x: State, p: Snap) {
  x.run = structuredClone(p.run);
  if (p.runEnd !== undefined) x.runEnd = p.runEnd; else delete x.runEnd;
  if (!p.had) { delete x.days[p.date]; return; }
  const d = dayFor(x, p.date);
  for (const k of ["live", "sing", "breaks"] as const) {
    const v = p.day?.[k];
    if (v === undefined) delete d[k]; else (d as Record<string, unknown>)[k] = structuredClone(v);
  }
  x.days[p.date] = d;
}

export function LiveView({ kind, onClose, onEnded }: { kind: RunKind | null; onClose: () => void; onEnded: (date: string, k: RunKind, undo: () => void) => void }) {
  const { s, update } = useStore();
  const open = kind !== null;
  const run = s.run;
  const [now, setNow] = useState(() => Date.now());
  const [eyesOff, setEyesOff] = useState(false);
  const { ok } = useWakeLock(open && !!run);

  // Minute-aligned clock (elapsed and wall-clock boundaries), only while open and visible; a resume recomputes from Date.now().
  useEffect(() => {
    if (!open) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(t);
      if (document.visibilityState !== "visible") return;
      const n = Date.now();
      const wall = MIN - (n % MIN);
      const el = run ? MIN - (elapsedMs(run, n) % MIN) : wall;
      t = setTimeout(() => { setNow(Date.now()); arm(); }, Math.min(wall, el) + 50);
    };
    const onVis = () => { if (document.visibilityState === "visible") setNow(Date.now()); arm(); };
    const first = setTimeout(() => { setNow(Date.now()); arm(); }, 0);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); clearTimeout(first); document.removeEventListener("visibilitychange", onVis); };
  }, [open, run]);

  // Cue banner: shown for 45 s after it falls due, then recorded as not taken. Cues that fell due while hidden or
  // minimised are acked silently on the next look (no missed counter on screen; the ratio is in the recap).
  const nc = open && run && !staleRun(run, logicalDate(new Date(now)), now) ? nextCue(run, now) : null;
  const dueAt = nc && run ? run.at + nc.cue.atMin * MIN : 0;
  const expired = !!nc && now - dueAt >= 45_000;
  useEffect(() => {
    if (!nc) return;
    if (expired) { update((x) => ackCue(x, nc.cue, false, nc.missed, Date.now())); return; }
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, 45_000 - (Date.now() - dueAt)) + 50);
    return () => clearTimeout(t);
  }, [nc?.cue.slot, expired]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const today = logicalDate(new Date(now));
  const k: RunKind = run?.k ?? kind ?? "live";
  const label = runLabel(k);

  function close() { onClose(); }

  function start() {
    const date = today, before = structuredClone(s.days[date]);
    const day = dayFor(s, date);
    const pre = k === "live" ? [...careIds(day, "prep")] : [];
    update((x) => startRun(x, date, k, Date.now(), { pre, eyes: eyesOff ? false : undefined }));
    toast(`เริ่ม${label}แล้ว`, { action: "เลิกทำ", onAction: () => update((x) => { if (x.run) x.runEnd = x.run.at; x.run = null; if (before) x.days[date] = before; else delete x.days[date]; }) });
  }

  function end(endAt?: number) {
    if (!run) return;
    const p = snap(s, run.date);
    const t = clockNow();
    const min = Math.max(0, Math.min(960, Math.round(((endAt ?? t) - run.at) / MIN)));
    update((x) => { endRun(x, t, endAt); });
    const undo = () => update((x) => restore(x, p));
    toast(`จบ${label}แล้ว · ${span(min)}`, { action: "เลิกทำ", onAction: undo });
    onEnded(run.date, run.k, undo);
  }

  function water() {
    const date = today;
    const total = Math.max(0, (dayFor(s, date).waterMl || 0) + 250);
    update((x) => { addWater(x, date, 250); });
    toast(`+250 ml · ${(total / 1000).toFixed(2)} ลิตร`, { action: "เลิกทำ", onAction: () => update((x) => { addWater(x, date, -250); }) });
  }

  function brk() {
    if (!run) return;
    const t = Date.now();
    if (!canBreak(run, t)) { toast("เพิ่งบันทึกพักไปไม่ถึง 5 นาที"); return; }
    const p = snap(s, run.date);
    update((x) => { addBreak(x, t); });
    toast(`บันทึกพักแล้ว · ${run.br + 1} ครั้ง`, { action: "เลิกทำ", onAction: () => update((x) => restore(x, p)) });
  }

  function clip() {
    if (!run) return;
    const p = snap(s, run.date);
    update((x) => markClip(x, Date.now()));
    toast(`มาร์กคลิปที่ ${hmClock(elapsedMs(run, Date.now()))}`, { action: "เลิกทำ", onAction: () => update((x) => restore(x, p)) });
  }

  // ---- stale run: forgot to end yesterday ----
  if (run && staleRun(run, today, now)) {
    const pe = plannedEndMs(s, run);
    return (
      <div className="liveview" role="dialog" aria-modal="true" aria-label={`โหมด${label}`}>
        <div className="lv-body">
          <div className="lv-title">ลืมจบ{label}เมื่อวาน?</div>
          <div className="lv-sub">เริ่มตอน {clockOf(run.at)}</div>
          <div className="lv-actions">
            {pe !== null && <button className="btn" onClick={() => end(pe)}>จบตอนเวลาปิดตามแผน ({clockOf(pe)})</button>}
            <button className={pe !== null ? "btn secondary" : "btn"} onClick={() => end()}>จบตอนนี้</button>
            <button className="btn secondary" onClick={close}>ย่อ</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- pre state ----
  if (!run) {
    const day = dayFor(s, today);
    const ids = careIds(day, "prep");
    const r = s.schedule.care?.find((x) => x.id === "prep");
    const steps = k !== "live" ? [] : r?.on ? r.steps.filter((x) => x.on !== false) : PRELIVE;
    return (
      <div className="liveview" role="dialog" aria-modal="true" aria-label={`ก่อน${label}`}>
        <div className="lv-body">
          <div className="lv-title">{k === "live" ? "ก่อนไลฟ์ 30 วินาที" : label}</div>
          {k !== "live" && <div className="lv-sub">จับเวลา · เตือนจิบน้ำอุ่นทุก 10 นาที บนจอ</div>}
          {steps.length > 0 && (
            <div className="group lv-pre">
              {steps.map((st) => {
                const on = ids.has(st.id);
                return (
                  <Tap key={st.id} className={`row ${on ? "done" : ""}`} pressed={on} onTap={() => update((x) => tickStep(x, today, "prep", st.id, !on))}>
                    <span className={`check ${on ? "on" : ""}`}>{on && <IconCheck size={16} />}</span>
                    <span className="row-main">
                      <span className="row-title">{st.title}</span>
                      {st.hint && <span className="row-sub">{st.hint}</span>}
                    </span>
                  </Tap>
                );
              })}
            </div>
          )}
          {PRESET[k]?.eyes && (
            <div className="chips lv-chips">
              <button type="button" className={`chip ${eyesOff ? "on" : ""}`} aria-pressed={eyesOff} onClick={() => setEyesOff(!eyesOff)}>ปิดเตือนพักตา</button>
            </div>
          )}
          <div className="lv-actions">
            <button className="btn" onClick={start}>{k === "live" ? "เริ่มไลฟ์" : "เริ่มจับเวลา"}</button>
            <button className="btn secondary" onClick={close}>ปิด</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- on state ----
  const el = elapsedMs(run, now);
  const pe = plannedEndMs(s, run);
  const diff = pe !== null ? pe - now : null;
  const p = (el % (60 * MIN)) / (60 * MIN);
  const cue = nc && !expired ? nc : null;
  return (
    <div className="liveview" role="dialog" aria-modal="true" aria-label={`โหมด${label}`}>
      <div className="lv-body lv-on">
        <div className="lv-eyebrow num">{label}{pe !== null ? ` · ถึง ${clockOf(pe)}` : ""}</div>
        <div className="lv-clockwrap" style={{ ["--p" as string]: p }}>
          <span className="lv-ring" aria-hidden />
          <div className="lv-clock num" role="timer" aria-label={`${label}มาแล้ว ${span(Math.floor(el / MIN))}`}>{hmClock(el)}</div>
        </div>
        {diff !== null && <div className="lv-sub num">{diff >= 0 ? `เหลือ ${hmClock(diff)} ตามแผน` : `เลยแผน ${hmClock(-diff)}`}</div>}
        {cue && (
          <div className="lv-cue" role="status">
            <div className="lv-cue-text">{CUE_TEXT[cue.cue.kind]}</div>
            <div className="lv-cue-acts">
              <button className="chip chip--fill" onClick={() => update((x) => ackCue(x, cue.cue, true, cue.missed, Date.now()))}>ทำแล้ว</button>
              <button className="chip" onClick={() => update((x) => ackCue(x, cue.cue, false, cue.missed, Date.now()))}>ข้าม</button>
            </div>
          </div>
        )}
        <div className="lv-ctrls">
          <button className="chip" onClick={water}>+250 ml</button>
          <button className="chip" onClick={brk}>พักแล้ว</button>
          {run.k === "live" && <button className="chip" onClick={clip}>มาร์กคลิป</button>}
        </div>
        <div className="lv-actions">
          <button className="btn" onClick={() => end()}>จบ{label}</button>
          <button className="btn secondary" onClick={close}>ย่อ</button>
        </div>
        <div className="lv-note">
          เสียบสายชาร์จระหว่าง{label}
          {ok === false && <span className="lv-warn"> · หน้าจออาจดับเอง: ตั้งค่า iPhone &gt; จอภาพและความสว่าง &gt; ล็อกอัตโนมัติ &gt; ไม่ใช้ (ระหว่างไลฟ์){s.settings.gameBreakMin > 0 ? ` · เตือนพักทุก ${s.settings.gameBreakMin} นาทียังมาทางแจ้งเตือน` : ""}</span>}
        </div>
      </div>
    </div>
  );
}

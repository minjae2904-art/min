"use client";

import { useState } from "react";
import { play } from "@/lib/sound";

// `when` fixes what each scale means: sleep = last night, energy/mood = right now (shared with QuickLog).
export const CHECKIN_ROWS = [
  { key: "sleep", label: "การนอน", when: "เมื่อคืน", low: "แย่", high: "ดีมาก" },
  { key: "energy", label: "พลังงาน", when: "ตอนนี้", low: "หมดแรง", high: "เต็มที่" },
  { key: "mood", label: "อารมณ์", when: "ตอนนี้", low: "หม่น", high: "สดใส" },
] as const;
type Vals = { mood: number; energy: number; sleep: number };

// Quick 3-tap check-in after waking. Feeds Stats (averages + correlation with completion).
export function CheckIn({ onSave, onSkip }: { onSave: (v: Vals) => void; onSkip: () => void }) {
  const [v, setV] = useState<Partial<Vals>>({});
  const ready = v.mood && v.energy && v.sleep;
  return (
    <div className="card checkin">
      <div className="checkin-head">
        <div>
          <div className="eyebrow">เช็กอินหลังตื่น</div>
          <div className="card-title">วันนี้รู้สึกอย่างไร</div>
          <div className="checkin-hint">ไม่แน่ใจข้อไหน กด &apos;ข้าม&apos; ได้ ดีกว่าเดา</div>
        </div>
        <button className="link fs-sub" onClick={() => { play("tap"); onSkip(); }}>ข้าม</button>
      </div>
      {CHECKIN_ROWS.map((r) => (
        <div key={r.key} className="scale">
          <div className="scale-label">{r.label} <span className="scale-when">{r.when}</span></div>
          <div className="scale-dots">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`scale-dot ${v[r.key] === n ? "on" : ""}`} style={{ ["--lv" as string]: n }} onClick={() => { play("tap"); setV((p) => ({ ...p, [r.key]: n })); }} aria-label={`${r.label} ${n}`} aria-pressed={v[r.key] === n}>{n}</button>
            ))}
          </div>
          <div className="scale-ends"><span>{r.low}</span><span>{r.high}</span></div>
        </div>
      ))}
      <button className="btn" disabled={!ready} style={{ marginTop: 6 }} onClick={() => { if (ready) { play("done"); onSave(v as Vals); } }}>บันทึก</button>
    </div>
  );
}

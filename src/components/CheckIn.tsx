"use client";

import { useState } from "react";
import { play } from "@/lib/sound";

const ROWS = [
  { key: "sleep", label: "การนอน", low: "แย่", high: "ดีมาก" },
  { key: "energy", label: "พลังงาน", low: "หมดแรง", high: "เต็มที่" },
  { key: "mood", label: "อารมณ์", low: "หม่น", high: "สดใส" },
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>วันนี้รู้สึกอย่างไร</div>
        </div>
        <button className="link" style={{ fontSize: 15 }} onClick={() => { play("tap"); onSkip(); }}>ข้าม</button>
      </div>
      {ROWS.map((r) => (
        <div key={r.key} className="scale">
          <div className="scale-label">{r.label}</div>
          <div className="scale-dots">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`scale-dot ${v[r.key] === n ? "on" : ""}`} style={{ ["--lv" as string]: n }} onClick={() => { play("tap"); setV({ ...v, [r.key]: n }); }} aria-label={`${r.label} ${n}`}>{n}</button>
            ))}
          </div>
          <div className="scale-ends"><span>{r.low}</span><span>{r.high}</span></div>
        </div>
      ))}
      <button className="btn" disabled={!ready} style={{ opacity: ready ? 1 : 0.4, marginTop: 6 }} onClick={() => { if (ready) { play("done"); onSave(v as Vals); } }}>บันทึก</button>
    </div>
  );
}

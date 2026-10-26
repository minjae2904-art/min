"use client";

import { useState } from "react";
import { langArr, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { SYM_LABEL } from "@/lib/care/track";
import { SYMS, type Sym } from "@/lib/model";
import { play } from "@/lib/sound";

const m = msgs(C), c = msgs(Common);

// `when` fixes what each scale means: sleep = last night, energy/mood = right now (shared with QuickLog).
export const CHECKIN_ROWS = langArr(() => [
  { key: "sleep" as const, label: m("checkIn.sleep.label"), when: m("checkIn.sleep.when"), low: m("checkIn.sleep.low"), high: m("checkIn.sleep.high") },
  { key: "energy" as const, label: m("checkIn.energy.label"), when: m("checkIn.energy.when"), low: m("checkIn.energy.low"), high: m("checkIn.energy.high") },
  { key: "mood" as const, label: m("checkIn.mood.label"), when: m("checkIn.mood.when"), low: m("checkIn.mood.low"), high: m("checkIn.mood.high") },
]);
type Vals = { mood: number; energy: number; sleep: number };

// Quick 3-tap check-in after waking. Feeds Stats (averages + correlation with completion).
// sym (v1.7, symptom tracker on): a collapsed "มีอาการไหม" row with symptom chips; the sliders are unchanged.
export function CheckIn({ onSave, onSkip, sym }: { onSave: (v: Vals) => void; onSkip: () => void; sym?: { on: Sym[]; toggle: (v: Sym) => void } }) {
  const [v, setV] = useState<Partial<Vals>>({});
  const [symOpen, setSymOpen] = useState(false);
  const ready = v.mood && v.energy && v.sleep;
  return (
    <div className="card checkin">
      <div className="checkin-head">
        <div>
          <div className="eyebrow">{m("checkIn.eyebrow")}</div>
          <div className="card-title">{m("checkIn.title")}</div>
          <div className="checkin-hint">{m("checkIn.hint")}</div>
        </div>
        <button className="link fs-sub" onClick={() => { play("tap"); onSkip(); }}>{m("checkIn.skip")}</button>
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
      {sym && (
        <div className="checkin-sym">
          <button type="button" className="link fs-sub" aria-expanded={symOpen} onClick={() => { play("tap"); setSymOpen(!symOpen); }}>{m("checkIn.sym", { count: sym.on.length ? ` (${sym.on.length})` : "" })}</button>
          {symOpen && (
            <div className="chips">
              {SYMS.map((k) => <button key={k} className={`chip chip--sm ${sym.on.includes(k) ? "on" : ""}`} aria-pressed={sym.on.includes(k)} onClick={() => { play("tap"); sym.toggle(k); }}>{SYM_LABEL[k]}</button>)}
            </div>
          )}
        </div>
      )}
      <button className="btn" disabled={!ready} style={{ marginTop: 6 }} onClick={() => { if (ready) { play("done"); onSave(v as Vals); } }}>{c("save")}</button>
    </div>
  );
}

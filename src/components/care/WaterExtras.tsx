"use client";

// Water sheet extras (v1.7 spec 4.5), shown only once self-care is set up: goal breakdown, hot day, fruit/veg,
// urine colour and caffeine. Static wellness text only; nothing here pushes.
import { useState } from "react";
import { useLongPress } from "@/components/gestures";
import { toast } from "@/components/ui";
import { setHot } from "@/lib/care/progress";
import { CAF_LABEL, URINE, VEG_TARGET, cafCutoff, cafNote, cafTotal, logCaf, type CafKind } from "@/lib/care/track";
import { hm, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { itemsFor } from "@/lib/schedule";
import { play } from "@/lib/sound";
import type { waterPlan } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { fmt, msgs } from "@/i18n";
import { rich, useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

const KINDS: CafKind[] = ["c", "t", "e", "p"];
const l1 = (ml: number) => (ml / 1000).toFixed(1);

export function WaterExtras({ date, plan }: { date: string; plan: ReturnType<typeof waterPlan> }) {
  const { s, update } = useStore();
  useLang();
  const [open, setOpen] = useState(false);
  const day = dayFor(s, date);
  const tr = s.care.track;
  const hot = typeof day.hot === "number" && day.hot > 0;
  const veg = typeof day.veg === "number" ? Math.max(0, Math.min(VEG_TARGET, day.veg)) : 0;
  const sleepMin = itemsFor(s.schedule, day, date).find((i) => i.kind === "sleep")?.min ?? 1530;
  const note = cafNote(day, s.care.cafMg, 0, sleepMin);
  const mg = cafTotal(day, s.care.cafMg);
  const active = s.care.water.plan;
  const patch = (fn: (d: ReturnType<typeof dayFor>) => void) => update((x) => { const d = dayFor(x, date); fn(d); x.days[date] = d; });

  const resetVeg = useLongPress(() => {
    if (!veg) return;
    const prev = veg;
    play("undo");
    patch((d) => { delete d.veg; });
    toast(m("waterExtras.toast.vegReset"), { action: c("undo"), onAction: () => patch((d) => { d.veg = prev; }) });
  });
  function caf(k: CafKind) {
    const prev = day.caf ? structuredClone(day.caf) : undefined;
    play("tap");
    update((x) => logCaf(x, date, k, logicalMinutes(), sleepMin));
    toast(m("waterExtras.toast.caf", { kind: CAF_LABEL[k], mg: mg + s.care.cafMg[k] }), { action: c("undo"), onAction: () => patch((d) => { if (prev) d.caf = prev; else delete d.caf; }) });
  }

  return (
    <div className="water-extras">
      {active && (
        <>
          <button className="row care-goal" aria-expanded={open} onClick={() => { play("tap"); setOpen(!open); }}>
            <span className="row-main row-title">{m("waterExtras.goal", { l: l1(plan.goal) })}</span>
          </button>
          {open && (
            <div className="care-parts">
              {plan.parts.map((p) => <div key={p.k} className="care-part"><span>{p.label}</span><span className="num">{fmt.num(p.ml)} ml</span></div>)}
              {plan.capped && <div className="care-part"><span>{m("waterExtras.capped")}</span></div>}
              {plan.fixed && <div className="care-part"><span>{m("waterExtras.fixed")}</span><span className="num">{fmt.num(plan.goal)} ml</span></div>}
            </div>
          )}
        </>
      )}
      <div className="chips water-hot">
        <button className={`chip ${hot ? "on" : ""}`} aria-pressed={hot} onClick={() => { play("toggle"); update((x) => setHot(x, date, !hot, Date.now())); }}>{m("waterExtras.hot")}</button>
      </div>

      {tr.veg && (
        <div className="row care-veg" {...resetVeg.bind} data-armed={resetVeg.armed || undefined}>
          <span className="row-main row-title">{rich(m("waterExtras.veg"), { num: <span className="num">{veg}/{VEG_TARGET}</span> })}</span>
          <span className="veg-dots" aria-hidden>{Array.from({ length: VEG_TARGET }, (_, i) => <span key={i} className={i < veg ? "on" : ""} />)}</span>
          <button className="chip" aria-label={m("waterExtras.aria.veg")} disabled={veg >= VEG_TARGET} onClick={() => { play("tap"); patch((d) => { d.veg = Math.min(VEG_TARGET, veg + 1); }); }}>+</button>
        </div>
      )}

      {tr.urine && (
        <div className="care-block">
          <div className="care-label">{m("waterExtras.urine")}</div>
          <div className="chips">
            {URINE.map((t, i) => {
              const on = day.urine === i + 1;
              return <button key={t} className={`chip chip--sm ${on ? "on" : ""}`} aria-pressed={on} onClick={() => { play("tap"); patch((d) => { if (on) delete d.urine; else d.urine = (i + 1) as 1 | 2 | 3; }); }}>{t}</button>;
            })}
          </div>
          <div className="care-small">{m("waterExtras.urineNote")}</div>
        </div>
      )}

      {tr.caf && (
        <div className="care-block">
          <div className="care-label">{rich(m("waterExtras.caf"), { num: <span className="num">{mg}</span> })}</div>
          <div className="chips">{KINDS.map((k) => <button key={k} className="chip chip--sm" onClick={() => caf(k)}>{CAF_LABEL[k]}</button>)}</div>
          {note.over && <div className="care-small ink-warn">{m("waterExtras.caf.over")}</div>}
          {note.late && <div className="care-small">{m("waterExtras.caf.late", { time: hm(cafCutoff(sleepMin).coffee) })}</div>}
          {note.preLate && <div className="care-small">{m("waterExtras.caf.preLate")}</div>}
        </div>
      )}
      <div className="care-small">{m("waterExtras.footer")}</div>
    </div>
  );
}

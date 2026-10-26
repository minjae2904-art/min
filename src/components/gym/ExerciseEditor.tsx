"use client";

// "แก้ท่าของ D1": a draft copy of the day's exercise list; "บันทึก" and "คืนค่าเริ่มต้น" commit with an undo toast.
// A running session keeps its own list. Footer: the opt-in rest-done beep.
import { useState } from "react";
import { keepStored, msgs, withLang } from "@/i18n";
import { gymExName } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-gym";
import * as Common from "@/i18n/msg/common";
import { IconChevron } from "@/components/Icons";
import { Section, Sheet, Switch, toast } from "@/components/ui";
import { DEFAULT_PLAN, isCode, planFor } from "@/lib/gymlog";
import type { Gym, GymEx } from "@/lib/model";
import { GYM_LABEL } from "@/lib/rotation";
import { msClock } from "@/lib/session";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(C), c = msgs(Common);
const RESTS = [60, 75, 90, 120, 150, 180];
const STEPS = [0.5, 1, 1.25, 2, 2.5, 5];
const newId = () => "u" + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, "");

function Stepper({ label, value, lo, hi, onChange }: { label: string; value: number; lo: number; hi: number; onChange: (v: number) => void }) {
  return (
    <div className="row ee-field">
      <span className="row-main row-title">{label}</span>
      <div className="gr-step">
        <button type="button" className="gr-btn" aria-label={m("exerciseEditor.aria.dec", { label })} disabled={value <= lo} onClick={() => { play("tap"); onChange(value - 1); }}>-</button>
        <span className="gr-reps num">{value}</span>
        <button type="button" className="gr-btn" aria-label={m("exerciseEditor.aria.inc", { label })} disabled={value >= hi} onClick={() => { play("tap"); onChange(value + 1); }}>+</button>
      </div>
    </div>
  );
}

export function ExerciseEditor({ code, open, onClose }: { code: string; open: boolean; onClose: () => void }) {
  const { s, update } = useStore();
  const [draft, setDraft] = useState<GymEx[]>([]);
  const [was, setWas] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [orig, setOrig] = useState<Record<string, string>>({}); // stored name per exercise id when opened (spec 7)
  // orig is read under th (canonical): DEFAULT_PLAN follows the UI language and storedText indexes th values only.
  // The draft holds display-language names; save restores an untouched built-in default (keepStored), user text as typed.
  if (open !== was) { setWas(open); if (open) { const p = withLang("th", () => planFor(s, code)); setOrig(Object.fromEntries(p.map((e) => [e.id, e.name]))); setDraft(p.map((e) => ({ ...e, name: gymExName(e.name) }))); setSel(null); } }
  if (!isCode(code)) return null;

  const set = (id: string, p: Partial<GymEx>) => setDraft((d) => d.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const move = (i: number, by: number) => setDraft((d) => { const n = [...d]; const [e] = n.splice(i, 1); n.splice(i + by, 0, e); return n; });
  const add = () => {
    if (draft.length >= 8) return;
    const e: GymEx = { id: newId().slice(0, 8), name: m("exerciseEditor.newName"), sets: 3, lo: 8, hi: 12, rest: 90, step: 2.5 };
    play("tap");
    setOrig({ ...orig, [e.id]: m.in("th", "exerciseEditor.newName") });
    setDraft([...draft, e]);
    setSel(e.id);
  };
  const commit = (next: GymEx[] | undefined, msg: string) => {
    const prev = s.gym.plan[code] as GymEx[] | undefined;
    const put = (x: { gym: Gym }, v: GymEx[] | undefined) => { if (v) x.gym.plan[code] = v; else delete x.gym.plan[code]; };
    play("done");
    update((x) => put(x, next));
    onClose();
    toast(msg, { action: c("undo"), onAction: () => update((x) => put(x, prev)) });
  };
  const valid = draft.every((e) => e.name.trim());
  const save = () => commit(draft.map((e) => ({ ...e, name: keepStored(gymExName, orig[e.id], e.name.trim(), 40) })), m("exerciseEditor.toast.saved", { code }));

  return (
    <Sheet open={open} title={m("exerciseEditor.title", { code })} onClose={onClose}>
      <div className="sheet-meta">{m("exerciseEditor.meta", { label: GYM_LABEL[code] })}</div>
      <Section>
        {draft.map((e, i) => (
          <div key={e.id} className="ee-item">
            <div className="row ee-head">
              <button type="button" className="row-main ee-name" aria-expanded={sel === e.id} onClick={() => { play("tap"); setSel(sel === e.id ? null : e.id); }}>
                <span className="row-title">{e.name || m("exerciseEditor.noName")}</span>
                <span className="row-sub num">{m("exerciseEditor.sub", { sets: e.sets, lo: e.lo, hi: e.hi, rest: msClock(e.rest), core: e.c ? m("exerciseEditor.sub.core") : "", bw: e.bw ? m("exerciseEditor.sub.bw") : "" })}</span>
              </button>
              <button type="button" className="icon-btn" aria-label={m("exerciseEditor.aria.up", { name: e.name })} disabled={i === 0} onClick={() => { play("tap"); move(i, -1); }}><span className="care-up"><IconChevron size={16} /></span></button>
              <button type="button" className="icon-btn" aria-label={m("exerciseEditor.aria.down", { name: e.name })} disabled={i === draft.length - 1} onClick={() => { play("tap"); move(i, 1); }}><span className="care-down"><IconChevron size={16} /></span></button>
            </div>
            {sel === e.id && (
              <div className="ee-form">
                <label className="row form-row">
                  <span className="row-title">{m("exerciseEditor.name")}</span>
                  <input className="inline-input" maxLength={40} value={e.name} onChange={(v) => set(e.id, { name: v.target.value })} />
                </label>
                <Stepper label={m("exerciseEditor.sets")} value={e.sets} lo={1} hi={6} onChange={(v) => set(e.id, { sets: v })} />
                <Stepper label={m("exerciseEditor.lo")} value={e.lo} lo={1} hi={Math.min(30, e.hi)} onChange={(v) => set(e.id, { lo: v })} />
                <Stepper label={m("exerciseEditor.hi")} value={e.hi} lo={e.lo} hi={50} onChange={(v) => set(e.id, { hi: v })} />
                <div className="row ee-chips">
                  <span className="row-title">{m("exerciseEditor.rest")}</span>
                  <div className="chips">
                    {RESTS.map((r) => <button key={r} type="button" className={`chip ${e.rest === r ? "on" : ""}`} aria-pressed={e.rest === r} onClick={() => { play("tap"); set(e.id, { rest: r }); }}>{msClock(r)}</button>)}
                  </div>
                </div>
                <div className="row ee-chips">
                  <span className="row-title">{m("exerciseEditor.step")}</span>
                  <div className="chips">
                    {STEPS.map((v) => <button key={v} type="button" className={`chip ${e.step === v ? "on" : ""}`} aria-pressed={e.step === v} onClick={() => { play("tap"); set(e.id, { step: v }); }}>{v}</button>)}
                  </div>
                </div>
                <div className="row"><span className="row-main row-title">{m("exerciseEditor.core.row")}</span><Switch on={!!e.c} label={m("exerciseEditor.core.label")} onChange={(v) => set(e.id, { c: v ? 1 : undefined })} /></div>
                <div className="row"><span className="row-main row-title">{m("exerciseEditor.bw")}</span><Switch on={!!e.bw} label={m("exerciseEditor.bw")} onChange={(v) => set(e.id, { bw: v ? 1 : undefined })} /></div>
                <button type="button" className="row" onClick={() => { play("undo"); setDraft(draft.filter((x) => x.id !== e.id)); setSel(null); }}>
                  <span className="row-main row-title ee-del">{m("exerciseEditor.del")}</span>
                </button>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="row" disabled={draft.length >= 8} onClick={add}><span className="row-main row-title link">{m("exerciseEditor.add")}</span></button>
      </Section>
      <button type="button" className="btn" disabled={!valid} onClick={save}>{c("save")}</button>
      {s.gym.plan[code] && (
        <button type="button" className="btn secondary ee-reset" onClick={() => commit(undefined, m("exerciseEditor.toast.reset", { code, n: DEFAULT_PLAN[code].length }))}>{c("reset")}</button>
      )}
      <Section footer={m("exerciseEditor.beep.footer")}>
        <div className="row">
          <span className="row-main row-title">{m("exerciseEditor.beep.row")}</span>
          <Switch on={s.gym.beep} label={m("exerciseEditor.beep.label")} onChange={(v) => update((x) => { x.gym.beep = v; })} />
        </div>
      </Section>
    </Sheet>
  );
}

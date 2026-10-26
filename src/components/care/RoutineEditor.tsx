"use client";

// RoutineEditor (v1.7 spec 4.3): edits a draft copy; nothing is written until "บันทึก" (with undo).
// Opened from RowActions, the CareSheet step menu and Settings > ดูแลตัวเอง. rid "new" creates a custom routine.
import { useState } from "react";
import { IconBack, IconChevron, IconMore, IconPlus } from "@/components/Icons";
import { Section, Sheet, Switch, toast } from "@/components/ui";
import { CAD_RE, cadLabel, parseCad } from "@/lib/care/cadence";
import { SLOTS, STEP_LIBRARY } from "@/lib/care/presets";
import { resetRoutine } from "@/lib/care/progress";
import { IRRITANTS, hasRequiredDaily, type Anchor, type Irritant, type Routine, type Step } from "@/lib/care/types";
import { ROLLOVER_HOUR, hm, logicalDate } from "@/lib/date";
import { LAST } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { DOW, routineName, routineOf, weekCad } from "./CareSheet";
import { StepLibrary, type LibPick } from "./StepLibrary";
import { keepStored, langArr, langObj, msgs, withLang, type Stored } from "@/i18n";
import { rich, useLang } from "@/i18n/react";
import { careStepText, stepTitle } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

// Language-following (built per language, read-only): anchors are cloned before they go into the draft.
const TIME_CHIPS: [string, string, Anchor][] = langArr(() => [
  ["weigh", m("routineEditor.time.weigh"), { item: ["weigh"], off: 10 }],
  ["gym", m("routineEditor.time.gym"), { item: ["gym", "cardio"], off: 5, end: true }],
  ["stream-prep", m("routineEditor.time.streamPrep"), { item: ["stream-prep"], off: -15 }],
  ["night", m("routineEditor.time.night"), { item: ["night"], off: -15 }],
  ["meal1", m("routineEditor.time.meal1"), { item: ["meal1"], off: 30 }],
  ["meal2", m("routineEditor.time.meal2"), { item: ["meal2"], off: 30 }],
  ["meal3", m("routineEditor.time.meal3"), { item: ["meal3"], off: 30 }],
]);
export const IRR_LABEL: Record<Irritant, string> = langObj(() => ({ ret: m("routineEditor.irr.ret"), bha: "BHA", aha: "AHA", bp: m("routineEditor.irr.bp"), vitc: m("routineEditor.irr.vitc") }));
type CadKind = "d" | "w" | "e" | "r" | "h";
const CAD_KINDS: [CadKind, string][] = langArr(() => [["d", m("routineEditor.cad.d")], ["w", m("routineEditor.cad.w")], ["e", m("routineEditor.cad.e")], ["r", m("routineEditor.cad.r")], ["h", m("routineEditor.cad.h")]]);
// The draft holds display-language text; save() restores untouched built-in defaults per row (spec 7, keepStored) and
// stores user text as typed. Orig = the stored values when the editor opened (a new row starts from its th default).
type Orig = { name?: string; t: Record<string, string | undefined>; h: Record<string, string | undefined> };
const origOf = (r: Routine | undefined): Orig => r
  ? { name: r.name, t: Object.fromEntries(r.steps.map((x) => [x.id, x.title])), h: Object.fromEntries(r.steps.map((x) => [x.id, x.hint])) }
  : { name: m.in("th", "routineEditor.newName"), t: {}, h: {} };
const shown = (r: Routine): Routine => ({ ...r, name: routineName(r.name),
  steps: r.steps.map((x) => ({ ...x, title: stepTitle(x), ...(x.hint !== undefined ? { hint: careStepText(x.hint) } : {}) })) });
// Cap typed text; an untouched built-in default (the draft still shows its display text) is kept whole.
const cap = (f: Stored, orig: string | undefined, t: string, n: number) => (orig !== undefined && f.is(orig) && t === f(orig) ? t : t.slice(0, n));
const canon = (r: Routine, o: Orig): Routine => ({ ...r, name: keepStored(routineName, o.name, r.name),
  steps: r.steps.map((x) => ({ ...x, title: keepStored(careStepText, o.t[x.id], x.title), ...(x.hint !== undefined ? { hint: keepStored(careStepText, o.h[x.id], x.hint) } : {}) })) });
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A step id unique in the routine (/^[a-z0-9]{1,6}$/).
function stepId(base: string, steps: Step[]): string {
  const taken = new Set(steps.map((x) => x.id));
  const b = base.replace(/[^a-z0-9]/g, "").slice(0, 6);
  if (b && !taken.has(b)) return b;
  for (let i = 1; i < 10; i++) { const c = `${b.slice(0, 5) || "s"}${i}`; if (!taken.has(c)) return c; }
  for (;;) { const c = "s" + Math.random().toString(36).slice(2, 7); if (!taken.has(c)) return c; }
}
type Edit = { i: number; st: Step; kind: CadKind; days: number[]; n: number; from: string };
function editOf(i: number, st: Step, today: string): Edit {
  const c = parseCad(st.cad);
  return { i, st: structuredClone(st), kind: c.t, days: c.t === "w" ? c.days : [1, 3, 5], n: c.t === "e" ? c.n : 2, from: c.t === "e" || c.t === "r" ? c.from : today };
}
function cadOf(e: Edit): string {
  const cad = e.kind === "w" ? weekCad(e.days) : e.kind === "e" ? `e:${clamp(e.n, 2, 99)}@${e.from}` : e.kind === "r" ? `r@${e.from}` : e.kind;
  return CAD_RE.test(cad) ? cad : "d";
}

export function RoutineEditor({ open, onClose }: { open: { rid: string; sid?: string } | null; onClose: () => void }) {
  const { s, update } = useStore();
  useLang();
  const today = logicalDate();
  const [last, setLast] = useState(open);
  const [draft, setDraft] = useState<Routine | null>(null);
  const [orig, setOrig] = useState<Orig>({ t: {}, h: {} });
  const [mode, setMode] = useState<"main" | "step" | "lib">("main");
  const [edit, setEdit] = useState<Edit | null>(null);
  if (open && open !== last) {
    setLast(open);
    const cur = open.rid === "new" ? undefined : routineOf(s, open.rid);
    const d: Routine = cur ? shown(structuredClone(cur))
      : { id: "", name: m("routineEditor.newName"), anchor: { item: ["weigh"], off: 30 }, remind: false, on: true, steps: [] };
    setDraft(d);
    setOrig(origOf(cur));
    const i = open.sid ? d.steps.findIndex((x) => x.id === open.sid) : -1;
    if (i >= 0) { setEdit(editOf(i, d.steps[i], today)); setMode("step"); } else setMode("main");
  }
  if (!draft) return null;

  const isNew = !routineOf(s, draft.id);
  const preset = SLOTS.some((x) => x.id === draft.id);
  const hosted = "host" in draft.anchor;
  const valid = !draft.on || hasRequiredDaily(draft);
  const total = (s.schedule.care ?? []).filter((r) => r.id !== draft.id).reduce((n, r) => n + r.steps.length, 0) + draft.steps.length;
  const canAdd = draft.steps.length < 20 && total < 60;
  const set = (fn: (d: Routine) => void) => setDraft((p) => { if (!p) return p; const n = structuredClone(p); fn(n); return n; });
  const anchor = draft.anchor;
  const chipKey = "at" in anchor ? "at" : "item" in anchor ? anchor.item[0] : "";

  function save() {
    if (!draft || !valid || !draft.name.trim()) { play("error"); return; }
    const next = canon({ ...structuredClone(draft), name: cap(routineName, orig.name, draft.name.trim(), 24) }, orig);
    if (!next.id) { const used = new Set((s.schedule.care ?? []).map((r) => r.id)); do next.id = "u-" + Math.random().toString(36).slice(2, 8); while (used.has(next.id)); }
    const prev = structuredClone(s.schedule.care ?? []);
    play("done");
    update((x) => {
      const list = (x.schedule.care ??= []);
      const i = list.findIndex((r) => r.id === next.id);
      if (i >= 0) list[i] = next; else list.push(next);
    });
    onClose();
    toast(m("routineEditor.toast.saved", { name: routineName(next.name) }), { action: c("undo"), onAction: () => update((x) => { x.schedule.care = structuredClone(prev); }) });
  }
  function reset() {
    if (!draft) return;
    const prev = structuredClone(s.schedule.care ?? []), id = draft.id;
    play("undo");
    update((x) => resetRoutine(x, id, today));
    onClose();
    toast(m("routineEditor.toast.reset", { name: draft.name }), { action: c("undo"), onAction: () => update((x) => { x.schedule.care = structuredClone(prev); }) });
  }
  function remove() {
    if (!draft) return;
    const prev = structuredClone(s.schedule.care ?? []), id = draft.id;
    play("undo");
    update((x) => { x.schedule.care = (x.schedule.care ?? []).filter((r) => r.id !== id); });
    onClose();
    toast(m("routineEditor.toast.removed", { name: draft.name }), { action: c("undo"), onAction: () => update((x) => { x.schedule.care = structuredClone(prev); }) });
  }
  function addFromLib(p: LibPick) {
    if (!draft) return;
    const id = stepId(p.id || "s", draft.steps);
    // A library step starts from its th default (shown as p.title); a custom one is user text.
    const th = p.id ? withLang("th", () => { const x = STEP_LIBRARY.find((y) => y.id === p.id); return x && { title: x.title, hint: x.hint }; }) : undefined;
    setOrig((o) => ({ ...o, t: { ...o.t, [id]: th?.title }, h: { ...o.h, [id]: th?.hint } }));
    set((d) => { d.steps.push({ id, title: p.title, tag: p.tag, ...(p.hint ? { hint: p.hint } : {}), ...(p.irr ? { irr: p.irr } : {}), ed: true }); });
    setMode("main");
  }
  function move(i: number, by: -1 | 1) {
    play("tap");
    set((d) => { const j = i + by; if (j < 0 || j >= d.steps.length) return; [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]]; });
  }
  function saveStep() {
    if (!edit) return;
    const title = cap(careStepText, orig.t[edit.st.id], edit.st.title.trim(), 40);
    if (!title) { play("error"); return; }
    const st: Step = { ...edit.st, title, cad: cadOf(edit), ed: true };
    if (st.cad === "d") delete st.cad;
    if (!st.hint?.trim()) delete st.hint; else st.hint = cap(careStepText, orig.h[edit.st.id], st.hint.trim(), 60);
    play("done");
    set((d) => { d.steps[edit.i] = st; });
    setMode("main");
  }
  const patch = (fn: (e: Edit) => void) => setEdit((p) => { if (!p) return p; const n = structuredClone(p); fn(n); return n; });
  const shelf = s.care.shelf.filter((p) => !p.done);

  return (
    <>
      <Sheet open={!!open && mode === "main"} title={isNew ? m("routineEditor.title.create") : m("routineEditor.title.edit", { name: draft.name })} onClose={onClose}>
        <Section>
          <label className="row form-row">
            <span className="row-title form-label">{m("routineEditor.name")}</span>
            <input className="inline-input" maxLength={24} value={draft.name} onChange={(e) => set((d) => { d.name = e.target.value; })} />
          </label>
          <div className="row">
            <span className="row-main row-title">{m("routineEditor.use")}</span>
            <Switch label={m("routineEditor.use")} on={draft.on} onChange={(v) => set((d) => { d.on = v; })} />
          </div>
        </Section>

        <Section header={m("routineEditor.time")} footer={hosted ? undefined : m("routineEditor.time.footer")}>
          {hosted ? (
            <div className="row"><span className="row-main row-sub">{m("routineEditor.hosted", { host: draft.id === "prep" ? m("routineEditor.host.prep") : m("routineEditor.host.shower") })}</span></div>
          ) : draft.id === "gym" ? (
            <div className="row"><span className="row-main row-sub">{m("routineEditor.gymNote")}</span></div>
          ) : (
            <div className="row care-ctx--wrap">
              <span className="chips" role="radiogroup" aria-label={m("routineEditor.time")}>
                {TIME_CHIPS.map(([k, t, a]) => (
                  <button key={k} role="radio" aria-checked={chipKey === k} className={`chip chip--sm ${chipKey === k ? "on" : ""}`} onClick={() => { play("tap"); set((d) => { d.anchor = structuredClone(a); }); }}>{t}</button>
                ))}
                <button role="radio" aria-checked={chipKey === "at"} className={`chip chip--sm ${chipKey === "at" ? "on" : ""}`} onClick={() => { play("tap"); set((d) => { d.anchor = { at: 12 * 60 }; }); }}>{m("routineEditor.time.custom")}</button>
              </span>
            </div>
          )}
          {"item" in anchor && !hosted && (
            <div className="row care-stepper">
              <span className="row-main row-title">{m("routineEditor.offset")}</span>
              <button className="chip" aria-label={m("routineEditor.aria.earlier")} disabled={anchor.off <= -60} onClick={() => { play("tap"); set((d) => { if ("item" in d.anchor) d.anchor.off = clamp(d.anchor.off - 5, -60, 120); }); }}>-5</button>
              <span className="num care-stepper-val">{m("routineEditor.offsetVal", { sign: anchor.off > 0 ? "+" : "", off: anchor.off })}</span>
              <button className="chip" aria-label={m("routineEditor.aria.later")} disabled={anchor.off >= 120} onClick={() => { play("tap"); set((d) => { if ("item" in d.anchor) d.anchor.off = clamp(d.anchor.off + 5, -60, 120); }); }}>+5</button>
            </div>
          )}
          {"at" in anchor && (
            <label className="row form-row">
              <span className="row-main row-title">{m("routineEditor.time")}</span>
              <input className="time-input" type="time" value={hm(anchor.at)} onChange={(e) => { if (e.target.value) { const m = clamp(toMin(e.target.value), ROLLOVER_HOUR * 60, LAST); set((d) => { d.anchor = { at: m }; }); } }} />
            </label>
          )}
          {!hosted && (
            <div className="row">
              <span className="row-main"><span className="row-title">{m("routineEditor.remind")}</span><span className="row-sub">{m("routineEditor.remindSub")}</span></span>
              <Switch label={m("routineEditor.remind")} on={draft.remind} onChange={(v) => set((d) => { d.remind = v; })} />
            </div>
          )}
        </Section>

        <Section header={m("routineEditor.steps")} footer={valid ? m("routineEditor.steps.footer") : m("routineEditor.steps.invalid")}>
          {draft.steps.map((st, i) => (
            <div key={st.id} className={`row care-edit-step ${st.on === false ? "disabled" : ""}`}>
              <Switch label={st.title} on={st.on !== false} onChange={(v) => set((d) => { if (v) delete d.steps[i].on; else d.steps[i].on = false; })} />
              <button className="row-main care-edit-title" onClick={() => { play("tap"); setEdit(editOf(i, st, today)); setMode("step"); }}>
                <span className="row-title">{st.title}</span>
                <span className="row-sub">{cadLabel(st.cad)}{st.opt ? m("routineEditor.step.opt") : ""}</span>
              </button>
              <span className="care-edit-ctl">
                <button className="icon-btn" aria-label={m("routineEditor.aria.up", { title: st.title })} disabled={i === 0} onClick={() => move(i, -1)}><span className="care-up"><IconChevron size={16} /></span></button>
                <button className="icon-btn" aria-label={m("routineEditor.aria.down", { title: st.title })} disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)}><span className="care-down"><IconChevron size={16} /></span></button>
                <button className="icon-btn" aria-label={m("routineEditor.aria.edit", { title: st.title })} onClick={() => { play("tap"); setEdit(editOf(i, st, today)); setMode("step"); }}><IconMore size={18} /></button>
              </span>
            </div>
          ))}
          <button className="row care-add" disabled={!canAdd} onClick={() => { play("tap"); setMode("lib"); }}>
            <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
            <span className="row-main row-title link">{canAdd ? m("routineEditor.addStep") : m("routineEditor.stepsFull")}</span>
          </button>
        </Section>

        <button className="btn" disabled={!valid || !draft.name.trim()} onClick={save}>{c("save")}</button>
        {preset && !isNew && <button className="btn secondary care-gap" onClick={reset}>{c("reset")}</button>}
        {!preset && !isNew && <button className="btn danger care-gap" onClick={remove}>{m("routineEditor.remove")}</button>}
      </Sheet>

      <Sheet open={!!open && mode === "step"} title={m("routineEditor.title.step")} onClose={() => setMode("main")}>
        {edit && (
          <>
            <button className="link care-back" onClick={() => { play("tap"); setMode("main"); }}>{rich(m("routineEditor.back"), { icon: <IconBack size={16} /> })}</button>
            <Section>
              <label className="row form-row">
                <span className="row-title form-label">{m("routineEditor.stepName")}</span>
                <input className="inline-input" maxLength={40} value={edit.st.title} onChange={(e) => patch((x) => { x.st.title = e.target.value; })} />
              </label>
              <div className="row">
                <span className="row-main"><span className="row-title">{m("routineEditor.required")}</span><span className="row-sub">{m("routineEditor.requiredSub")}</span></span>
                <Switch label={m("routineEditor.required")} on={!edit.st.opt} onChange={(v) => patch((x) => { if (v) delete x.st.opt; else x.st.opt = true; })} />
              </div>
              <label className="row form-row">
                <span className="row-main row-title">{m("routineEditor.minutes")}</span>
                <input className="inline-input num" inputMode="numeric" placeholder="0" value={edit.st.min ?? ""} onChange={(e) => patch((x) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) x.st.min = clamp(v, 0, 60); else delete x.st.min; })} />
              </label>
              <label className="row form-row">
                <span className="row-title form-label">{m("routineEditor.hint")}</span>
                <input className="inline-input" maxLength={60} placeholder={c("optional")} value={edit.st.hint ?? ""} onChange={(e) => patch((x) => { x.st.hint = e.target.value; })} />
              </label>
            </Section>

            <Section header={m("routineEditor.when")}>
              <div className="row care-ctx--wrap">
                <span className="chips" role="radiogroup" aria-label={m("routineEditor.when")}>
                  {CAD_KINDS.map(([k, t]) => <button key={k} role="radio" aria-checked={edit.kind === k} className={`chip chip--sm ${edit.kind === k ? "on" : ""}`} onClick={() => { play("tap"); patch((x) => { x.kind = k; }); }}>{t}</button>)}
                </span>
              </div>
              {edit.kind === "w" && (
                <div className="row"><span className="chips care-days">{DOW.map((t, i) => {
                  const on = edit.days.includes(i);
                  return <button key={t} className={`chip chip--day ${on ? "on" : ""}`} aria-pressed={on} onClick={() => patch((x) => { x.days = on ? x.days.filter((d) => d !== i) : [...x.days, i]; })}>{t}</button>;
                })}</span></div>
              )}
              {edit.kind === "e" && (
                <div className="row care-stepper">
                  <span className="row-main row-title">{m("routineEditor.every")}</span>
                  <button className="chip" disabled={edit.n <= 2} onClick={() => patch((x) => { x.n = clamp(x.n - 1, 2, 99); })}>-1</button>
                  <span className="num care-stepper-val">{m("routineEditor.nDays", { n: edit.n })}</span>
                  <button className="chip" disabled={edit.n >= 99} onClick={() => patch((x) => { x.n = clamp(x.n + 1, 2, 99); })}>+1</button>
                </div>
              )}
              {(edit.kind === "e" || edit.kind === "r") && (
                <label className="row form-row">
                  <span className="row-main row-title">{m("routineEditor.start")}</span>
                  <input className="inline-input" type="date" value={edit.from} onChange={(e) => e.target.value && patch((x) => { x.from = e.target.value; })} />
                </label>
              )}
              {edit.kind === "r" && <div className="row"><span className="row-main row-sub">{m("routineEditor.ramp")}</span></div>}
            </Section>

            <Section header={m("routineEditor.irr.header")}>
              <div className="row"><span className="chips">
                <button className={`chip chip--sm ${!edit.st.irr ? "on" : ""}`} aria-pressed={!edit.st.irr} onClick={() => patch((x) => { delete x.st.irr; })}>{m("routineEditor.irr.none")}</button>
                {IRRITANTS.map((k) => <button key={k} className={`chip chip--sm ${edit.st.irr === k ? "on" : ""}`} aria-pressed={edit.st.irr === k} onClick={() => patch((x) => { x.st.irr = k; })}>{IRR_LABEL[k]}</button>)}
              </span></div>
            </Section>

            {shelf.length > 0 && (
              <Section header={m("routineEditor.shelf.header")}>
                <div className="row"><span className="chips">
                  <button className={`chip chip--sm ${!edit.st.product ? "on" : ""}`} aria-pressed={!edit.st.product} onClick={() => patch((x) => { delete x.st.product; })}>{m("routineEditor.shelf.none")}</button>
                  {shelf.map((p) => <button key={p.id} className={`chip chip--sm ${edit.st.product === p.id ? "on" : ""}`} aria-pressed={edit.st.product === p.id} onClick={() => patch((x) => { x.st.product = p.id; })}>{p.name}</button>)}
                </span></div>
              </Section>
            )}

            <button className="btn" disabled={!edit.st.title.trim() || (edit.kind === "w" && !edit.days.length)} onClick={saveStep}>{m("routineEditor.ok")}</button>
            {!edit.st.pack && (
              <button className="btn danger care-gap" onClick={() => { play("undo"); set((d) => { d.steps.splice(edit.i, 1); }); setMode("main"); }}>{m("routineEditor.removeStep")}</button>
            )}
            <div className="section-footer">{m("routineEditor.saveHint")}</div>
          </>
        )}
      </Sheet>

      <StepLibrary open={!!open && mode === "lib"} onPick={addFromLib} onClose={() => setMode("main")} />
    </>
  );
}
